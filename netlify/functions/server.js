// netlify/functions/server.js
const serverless = require('serverless-http');
const express = require('express');
const path = require('path');
const { httpClient } = require('../../utils/http.js');

// 复用时间与ICS工具
const { parseBroadcastTime, parseNewEpTime, getNextBroadcastDate, formatDate, escapeICSText } = require('../../utils/time.js');
const { generateICS, respondWithICS, respondWithEmptyCalendar } = require('../../utils/ics.js');
const { getBangumiData } = require('../../utils/bangumi.js');

// 导入主应用逻辑
const app = express();

// 创建简单的内存存储限流器
const rateLimiter = {
  // 存储结构 { ip: { count: 0, resetTime: timestamp } }
  store: {},
  
  // 环境变量控制限制
  MAX_REQUESTS: process.env.API_RATE_LIMIT || 3, // 默认每小时3次
  TIME_WINDOW: process.env.API_RATE_WINDOW || 60 * 60 * 1000, // 默认1小时(毫秒)
  ENABLED: process.env.ENABLE_RATE_LIMIT !== 'false', // 默认启用
  
  // 检查并递增计数
  check(ip) {
    const now = Date.now();
    
    // 如果功能被禁用，始终允许请求
    if (!this.ENABLED) return true;
    
    // 清理过期的条目（机会性清理）
    this.cleanup(now);
    
    // 初始化或重置过期的限制
    if (!this.store[ip] || now > this.store[ip].resetTime) {
      this.store[ip] = {
        count: 1,
        resetTime: now + this.TIME_WINDOW
      };
      return true;
    }
    
    // 检查是否达到限制
    if (this.store[ip].count >= this.MAX_REQUESTS) {
      return false;
    }
    
    // 递增计数
    this.store[ip].count += 1;
    return true;
  },
  
  // 获取剩余可用次数
  getRemainingRequests(ip) {
    const now = Date.now();
    
    // 清理过期的条目（机会性清理）
    this.cleanup(now);
    
    if (!this.store[ip] || now > this.store[ip].resetTime) {
      return this.MAX_REQUESTS;
    }
    
    return Math.max(0, this.MAX_REQUESTS - this.store[ip].count);
  },
  
  // 获取重置时间
  getResetTime(ip) {
    const now = Date.now();
    
    // 清理过期的条目（机会性清理）
    this.cleanup(now);
    
    if (!this.store[ip] || now > this.store[ip].resetTime) {
      return now + this.TIME_WINDOW;
    }
    
    return this.store[ip].resetTime;
  },
  
  // 清理过期的条目
  cleanup(now = Date.now()) {
    for (const ip in this.store) {
      if (now > this.store[ip].resetTime) {
        delete this.store[ip];
      }
    }
  }
};

// 注意：在Netlify函数环境中，因为函数是无状态的，内存存储在每次调用之间不会保留
// 在生产环境中应该考虑使用Redis等外部存储来实现持久化的限流

// 设置跨域支持
app.use((req, res, next) => {
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 限流中间件
const rateLimiterMiddleware = (req, res, next) => {
  // 获取客户端IP，处理代理和IPv6地址
  let ip = req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null);
  
  // 处理 x-forwarded-for 头部可能包含多个IP地址的情况（逗号分隔）
  if (ip && ip.includes(',')) {
    // 使用第一个IP地址（最原始的客户端IP）
    ip = ip.split(',')[0].trim();
  }
  
  // 处理IPv6地址的格式（例如：::ffff:127.0.0.1）
  if (ip && ip.includes('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  
  // 区分内部调用和外部直接访问
  const isDirectAccess = !req.headers['x-bili-calendar-internal'];
  
  // 仅对直接访问应用限流
  if (isDirectAccess && !rateLimiter.check(ip)) {
    const resetTime = new Date(rateLimiter.getResetTime(ip)).toISOString();
    
    // 设置速率限制响应头
    res.setHeader('X-RateLimit-Limit', rateLimiter.MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', resetTime);
    
    return res.status(429).json({
      error: '请求过于频繁',
      message: `API调用次数已达上限，请在${resetTime}后再试`,
      limit: rateLimiter.MAX_REQUESTS,
      window: '1小时',
      reset: resetTime
    });
  }
  
  // 对于允许的请求，设置剩余次数响应头
  if (isDirectAccess) {
    res.setHeader('X-RateLimit-Limit', rateLimiter.MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', rateLimiter.getRemainingRequests(ip));
    res.setHeader('X-RateLimit-Reset', new Date(rateLimiter.getResetTime(ip)).toISOString());
  }
  
  next();
};

// 提供静态文件服务
app.use(express.static(path.join(__dirname, '../../public')));

// 日志中间件 (简化版，因为Netlify有自己的日志系统)
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`📥 ${req.method} ${req.originalUrl}`);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const statusEmoji = statusCode >= 400 ? '❌' : '✅';
    
    console.log(`${statusEmoji} ${req.method} ${req.originalUrl} - ${statusCode} - ${duration}ms`);
  });
  
  next();
});

// 获取 B站追番数据
app.get('/api/bangumi/:uid', rateLimiterMiddleware, async (req, res, next) => {
  const { uid } = req.params;

  if (!/^\d+$/.test(uid)) {
    console.warn(`⚠️ 无效的UID格式: ${uid}`);
    return res.status(400).json({ 
      error: 'Invalid UID',
      message: 'UID必须是纯数字'
    });
  }

  try {
    const data = await getBangumiData(uid);
    
    if (!data) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: '获取数据失败'
      });
    }
    
    res.json(data);
  } catch (err) {
    console.error(`❌ 处理请求时出错:`, err);
    next(err);
  }
});

// 处理 /{UID} 路径，生成并返回 ICS 文件
app.get('/:uid', async (req, res, next) => {
  const { uid } = req.params;
  const cleanUid = uid.replace('.ics', '');
  
  // 验证 UID 是否为数字
  if (!/^\d+$/.test(cleanUid)) {
    console.warn(`⚠️ 无效的UID格式: ${cleanUid}`);
    return res.status(400).send('❌ 无效的 UID (只允许是数字)');
  }
  
  try {
    console.log(`🔍 处理UID: ${cleanUid}`);
    
    // 调用获取数据函数
    const data = await getBangumiData(cleanUid);
    
    if (!data) {
      return res.status(500).send('获取数据失败');
    }
    
    // 检查API返回的错误码
    if (data.code !== 0) {
      if (data.code === 53013) {
        console.warn(`⚠️ 用户隐私设置限制: ${cleanUid}`);
        return respondWithEmptyCalendar(res, cleanUid, '用户设置为隐私');
      }
      console.error(`❌ B站API错误: ${data.message} (code: ${data.code})`);
      return res.status(500).send(`Bilibili API 错误: ${data.message} (code: ${data.code})`);
    }
    
    // 检查数据列表
    const bangumiList = data.data?.list || [];
    console.log(`📋 获取到番剧列表数量: ${bangumiList.length}`);
    
    if (bangumiList.length === 0) {
      console.warn(`⚠️ 未找到正在播出的番剧: ${cleanUid}`);
      return respondWithEmptyCalendar(res, cleanUid, '未找到正在播出的番剧');
    }
    
    console.log(`📅 生成日历文件`);
    const icsContent = generateICS(bangumiList, cleanUid);
    
    return respondWithICS(res, icsContent, cleanUid);
  } catch (err) {
    console.error(`❌ 处理请求时出错:`, err);
    next(err);
  }
});

// 健康检查接口
app.get('/status', (req, res) => {
  res.send(`✅ Bili-Calendar Service is running here (Netlify Function).`);
});

// 根路径返回前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'index.html'));
});

// 处理404错误 - 为浏览器请求返回HTML页面
app.use((req, res) => {
  // 检查是否为API请求
  if (req.originalUrl.startsWith('/api/')) {
    // API请求返回JSON错误
    console.warn(`⚠️ 404 Not Found: ${req.originalUrl}`);
    return res.status(404).json({ 
      error: 'Not Found',
      message: `路径 ${req.originalUrl} 不存在` 
    });
  } else {
    // 非API请求返回HTML错误页面
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>页面未找到 - Bili-Calendar</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              text-align: center;
              padding: 50px;
              background-color: #f5f5f5;
            }
            .container {
              max-width: 500px;
              margin: 0 auto;
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 {
              color: #e53935;
              font-size: 24px;
              margin-bottom: 20px;
            }
            p {
              color: #666;
              font-size: 16px;
              line-height: 1.6;
            }
            a {
              color: #1976d2;
              text-decoration: none;
              font-weight: 500;
            }
            a:hover {
              text-decoration: underline;
            }
            .error-code {
              font-size: 64px;
              font-weight: bold;
              color: #ddd;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-code">404</div>
            <h1>页面未找到</h1>
            <p>抱歉，您访问的页面不存在。</p>
            <p><a href="/">返回首页</a></p>
          </div>
        </body>
      </html>
    `);
  }
});

// 错误处理中间件（移到所有路由之后）
app.use((err, req, res, next) => {
  console.error(`❌ 服务器错误:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message
  });
});






// 将Express应用包装为serverless函数
exports.handler = serverless(app);