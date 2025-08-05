 // main.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { httpClient } from './utils/http.js';

// 复用时间与ICS工具
import { parseBroadcastTime, parseNewEpTime, getNextBroadcastDate, formatDate, escapeICSText } from './utils/time.js';
import { generateICS, respondWithICS, respondWithEmptyCalendar } from './utils/ics.js';

const app = express();

const PORT = process.env.PORT || 3000;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

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
    
    if (!this.store[ip] || now > this.store[ip].resetTime) {
      return this.MAX_REQUESTS;
    }
    
    return Math.max(0, this.MAX_REQUESTS - this.store[ip].count);
  },
  
  // 获取重置时间
  getResetTime(ip) {
    const now = Date.now();
    
    if (!this.store[ip] || now > this.store[ip].resetTime) {
      return now + this.TIME_WINDOW;
    }
    
    return this.store[ip].resetTime;
  },
  
  // 清理过期的记录 (定期调用)
  cleanup() {
    const now = Date.now();
    for (const ip in this.store) {
      if (now > this.store[ip].resetTime) {
        delete this.store[ip];
      }
    }
  }
};

// 每小时清理一次过期的限流记录
setInterval(() => rateLimiter.cleanup(), 60 * 60 * 1000);

/** 安全响应头 + CORS */
app.use((req, res, next) => {
  // 基础安全头
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // CORS
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 提供静态文件服务
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

// 日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  // 请求开始日志
  console.log(`[${timestamp}] 📥 ${req.method} ${req.originalUrl} - IP: ${ip}`);
  
  // 响应完成后的日志
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const statusEmoji = statusCode >= 400 ? '❌' : '✅';
    
    console.log(`[${timestamp}] ${statusEmoji} ${req.method} ${req.originalUrl} - ${statusCode} - ${duration}ms`);
  });
  
  next();
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ❌ 服务器错误:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message
  });
});

// 限流中间件
const rateLimiterMiddleware = (req, res, next) => {
  // 获取客户端IP
  const ip = req.headers['x-forwarded-for'] || 
             req.connection.remoteAddress || 
             req.socket.remoteAddress ||
             (req.connection.socket ? req.connection.socket.remoteAddress : null);
  
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

// 获取 B站追番数据
app.get('/api/bangumi/:uid', rateLimiterMiddleware, async (req, res, next) => {
  const {uid} = req.params;

  if (!/^\d+$/.test(uid)) {
    console.warn(`[${new Date().toISOString()}] ⚠️ 无效的UID格式: ${uid}`);
    return res.status(400).json({ 
      error: 'Invalid UID',
      message: 'UID必须是纯数字'
    });
  }

  try {
    console.log(`[${new Date().toISOString()}] 🔍 获取用户 ${uid} 的追番数据`);
    const url = `https://api.bilibili.com/x/space/bangumi/follow/list?type=1&follow_status=0&vmid=${uid}&pn=1&ps=30`;

    const response = await httpClient.get(url).catch(err => {
      if (err.response) {
        console.error(`[${new Date().toISOString()}] ❌ B站API返回错误: ${err.response.status}`);
        return { data: { error: 'Bilibili API Error', message: `B站API返回错误: ${err.response.status}`, details: err.response.data } };
      }
      throw err;
    });

    const data = response.data;
    
    // 检查B站API返回的错误码
    if (data.code !== 0) {
      console.warn(`[${new Date().toISOString()}] ⚠️ B站API返回业务错误: code=${data.code}, message=${data.message}`);
      
      // 特殊处理一些常见错误
      if (data.code === 53013) {
        return res.status(403).json({
          error: 'Privacy Settings',
          message: '该用户的追番列表已设为隐私，无法获取',
          code: data.code
        });
      }
      
      // 返回原始错误
      return res.json(data);
    }
    
    // 如果API返回成功，过滤出正在播出的番剧
    if (data.data && data.data.list) {
      const originalCount = data.data.list.length;
      
      // 过滤条件：
      // 1. 番剧的状态不是已完结 (is_finish 为 0)
      // 2. 番剧有播出时间信息 (pub_index 不为空) 或者有更新时间信息 (renewal_time 不为空) 或者有新剧集信息 (new_ep 不为空)
      const currentlyAiring = data.data.list.filter(bangumi => {
        // 检查是否未完结 (is_finish: 0 表示连载中，1 表示已完结)
        const isOngoing = bangumi.is_finish === 0;
        
        // 检查是否有播出时间信息
        const hasBroadcastInfo = (bangumi.pub_index && bangumi.pub_index.trim() !== '') ||
                                   (bangumi.renewal_time && bangumi.renewal_time.trim() !== '') ||
                                   (bangumi.new_ep && bangumi.new_ep.pub_time && bangumi.new_ep.pub_time.trim() !== '');
        
        // 检查最近是否有更新 (可选，如果需要更严格的过滤)
        const hasRecentProgress = bangumi.progress && bangumi.progress.includes('更新至');
        
        return isOngoing && hasBroadcastInfo;
      });
      
      // 替换原始列表为过滤后的列表
      data.data.list = currentlyAiring;
      console.log(`[${new Date().toISOString()}] 📊 [UID:${uid}] 总共 ${originalCount} 部番剧，过滤后 ${currentlyAiring.length} 部正在播出`);
      
      // 添加自定义字段表明数据已被过滤
      data.filtered = true;
      data.filtered_count = currentlyAiring.length;
      data.original_count = originalCount;
    }
    
    res.json(data);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ 处理请求时出错:`, err);
    
    // 使用next(err)将错误传递给错误处理中间件
    next(err);
  }
});

// 健康检查接口
app.get('/status', (req, res) => {
  const uptime = process.uptime();
  const uptimeFormatted = formatUptime(uptime);
  
  res.send(`✅ Bili-Calendar Service is running here.
  
服务状态:
- 运行时间: ${uptimeFormatted}
- 内存使用: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB
- 环境: ${process.env.NODE_ENV || 'development'}
- 端口: ${PORT}
`);
});

// 根路径返回前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 处理 /{UID} 路径，生成并返回 ICS 文件
app.get('/:uid', async (req, res, next) => {
  const uid = req.params.uid.replace('.ics', '');
  
  // 验证 UID 是否为数字
  if (!/^\d+$/.test(uid)) {
    console.warn(`[${new Date().toISOString()}] ⚠️ 无效的UID格式: ${uid}`);
    return res.status(400).send('❌ 无效的 UID (只允许是数字)');
  }
  
  try {
    console.log(`[${new Date().toISOString()}] 🔍 处理UID: ${uid}`);
    
    // 直接调用内部函数获取数据，而不是通过 HTTP 请求
    const data = await getBangumiData(uid);
    
    if (!data) {
      return res.status(500).send('获取数据失败');
    }
    
    // 检查API返回的错误码
    if (data.code !== 0) {
      if (data.code === 53013) {
        console.warn(`[${new Date().toISOString()}] ⚠️ 用户隐私设置限制: ${uid}`);
        return respondWithEmptyCalendar(res, uid, '用户设置为隐私');
      }
      console.error(`[${new Date().toISOString()}] ❌ B站API错误: ${data.message} (code: ${data.code})`);
      return res.status(500).send(`Bilibili API 错误: ${data.message} (code: ${data.code})`);
    }
    
    
    // 检查数据列表
    const bangumiList = data.data?.list || [];
    console.log(`[${new Date().toISOString()}] 📋 获取到番剧列表数量: ${bangumiList.length}`);
    
    if (bangumiList.length === 0) {
      console.warn(`[${new Date().toISOString()}] ⚠️ 未找到正在播出的番剧: ${uid}`);
      return respondWithEmptyCalendar(res, uid, '未找到正在播出的番剧');
    }
    
    console.log(`[${new Date().toISOString()}] 📅 生成日历文件`);
    const icsContent = generateICS(bangumiList, uid);
    
    return respondWithICS(res, icsContent, uid);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ 处理请求时出错:`, err);
    next(err);
  }
});

// 处理404错误
app.use((req, res) => {
  console.warn(`[${new Date().toISOString()}] ⚠️ 404 Not Found: ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Not Found',
    message: `路径 ${req.originalUrl} 不存在` 
  });
});

/**
 * Fetches and filters the Bilibili bangumi (anime) follow list for a given user ID.
 *
 * Retrieves the user's followed bangumi list from the Bilibili API, handling HTTP and API errors.
 * Filters the list to include only currently airing series (not finished and with broadcast or update information).
 * Adds metadata about the filtering process to the returned object.
 *
 * @param {string|number} uid - The Bilibili user ID.
 * @returns {Promise<Object|null>} The filtered bangumi data object, or null if the request fails.
 */
async function getBangumiData(uid) {
  try {
    console.log(`[${new Date().toISOString()}] 🔍 获取用户 ${uid} 的追番数据`);
    const url = `https://api.bilibili.com/x/space/bangumi/follow/list?type=1&follow_status=0&vmid=${uid}&pn=1&ps=30`;

    const response = await httpClient.get(url);

    // 检查B站API返回的错误码
    if (response.data.code !== 0) {
      console.warn(`[${new Date().toISOString()}] ⚠️ B站API返回业务错误: code=${response.data.code}, message=${response.data.message}`);
      
      // 特殊处理一些常见错误
      if (response.data.code === 53013) {
        return {
          error: 'Privacy Settings',
          message: '该用户的追番列表已设为隐私，无法获取',
          code: response.data.code
        };
      }
      
      // 返回原始错误
      return response.data;
    }
    
    // 如果API返回成功，过滤出正在播出的番剧
    if (response.data.data && response.data.data.list) {
      const originalCount = response.data.data.list.length;
      
      // 过滤条件：
      // 1. 番剧的状态不是已完结 (is_finish 为 0)
      // 2. 番剧有播出时间信息 (pub_index 不为空) 或者有更新时间信息 (renewal_time 不为空) 或者有新剧集信息 (new_ep 不为空)
      const currentlyAiring = response.data.data.list.filter(bangumi => {
        // 检查是否未完结 (is_finish: 0 表示连载中，1 表示已完结)
        const isOngoing = bangumi.is_finish === 0;
        
        // 检查是否有播出时间信息
        const hasBroadcastInfo = (bangumi.pub_index && bangumi.pub_index.trim() !== '') ||
                                 (bangumi.renewal_time && bangumi.renewal_time.trim() !== '') ||
                                 (bangumi.new_ep && bangumi.new_ep.pub_time && bangumi.new_ep.pub_time.trim() !== '');
        
        return isOngoing && hasBroadcastInfo;
      });
      
      // 替换原始列表为过滤后的列表
      response.data.data.list = currentlyAiring;
      console.log(`[${new Date().toISOString()}] 📊 [UID:${uid}] 总共 ${originalCount} 部番剧，过滤后 ${currentlyAiring.length} 部正在播出`);
      
      // 添加自定义字段表明数据已被过滤
      response.data.filtered = true;
      response.data.filtered_count = currentlyAiring.length;
      response.data.original_count = originalCount;
    }
    
    return response.data;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ 获取追番数据失败:`, err);
    if (err.response) {
      return {
        error: 'Bilibili API Error',
        message: `B站API返回错误: ${err.response.status}`,
        details: err.response.data
      };
    }
    return null;
  }
}

/**
 * Converts a duration in seconds to a human-readable string in Chinese, including days, hours, minutes, and seconds.
 * @param {number} seconds - The total number of seconds to format.
 * @return {string} The formatted uptime string in Chinese.
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`);
  
  return parts.join(' ');
}

/* moved to utils/time.js: parseBroadcastTime */






export { app };