// server.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getBangumiData } = require('./utils/bangumi.cjs');
const { createRateLimiter } = require('./utils/rate-limiter.cjs');
const { extractClientIP, generateRequestId } = require('./utils/ip.cjs');

// 抽离的通用工具（使用 CJS 版本）
const { generateICS, respondWithICS, respondWithEmptyCalendar } = require('./utils/ics.cjs');

const app = express();

const PORT = process.env.PORT || 3000;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 创建速率限制器实例
const rateLimiter = createRateLimiter();

// 定期清理过期的限流记录（每小时一次）
const cleanupInterval = setInterval(() => rateLimiter.cleanup(), 60 * 60 * 1000);

// 优雅关闭时清理定时器
process.on('SIGTERM', () => {
  clearInterval(cleanupInterval);
});
process.on('SIGINT', () => {
  clearInterval(cleanupInterval);
});

// 注意：在Docker容器环境中，内存存储在每次重启时会被重置
// 在生产环境中应该考虑使用Redis等外部存储来实现持久化的限流

/** 安全响应头 + CORS */
app.use((req, res, next) => {
  // 基础安全头
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; worker-src 'self'; upgrade-insecure-requests; block-all-mixed-content; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api.bilibili.com; font-src 'self' data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; manifest-src 'self'"
  );
  // CORS
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 提供静态文件服务
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

// 请求ID & 日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  const ip = extractClientIP(req);
  const requestId = generateRequestId(req);
  res.setHeader('X-Request-Id', requestId);
  console.log(`📥 ${req.method} ${req.originalUrl} - IP: ${ip} - id=${requestId}`);
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const statusEmoji = statusCode >= 400 ? '❌' : '✅';
    console.log(
      `${statusEmoji} ${req.method} ${req.originalUrl} - ${statusCode} - ${duration}ms - id=${requestId}`
    );
  });
  next();
});

// 读取版本
let VERSION = 'dev';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
  VERSION = pkg.version || 'dev';
} catch {}

// 限流中间件
const rateLimiterMiddleware = (req, res, next) => {
  const ip = extractClientIP(req);

  // 应用限流（所有请求）
  if (!rateLimiter.check(ip)) {
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
      reset: resetTime,
    });
  }

  // 对于允许的请求，设置剩余次数响应头
  res.setHeader('X-RateLimit-Limit', rateLimiter.MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', rateLimiter.getRemainingRequests(ip));
  res.setHeader('X-RateLimit-Reset', new Date(rateLimiter.getResetTime(ip)).toISOString());

  next();
};

// 错误处理中间件
app.use((err, req, res, _next) => {
  console.error(`❌ 服务器错误:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
  });
});

// 健康检查接口
app.get('/status', (req, res) => {
  res.send(`✅ Bili-Calendar Service is running.

服务状态:
- 版本: ${VERSION}
- 环境: ${process.env.NODE_ENV || 'development'}
`);
});

// 根路径返回前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 获取 B站追番数据
app.get('/api/bangumi/:uid', rateLimiterMiddleware, async (req, res, next) => {
  const { uid } = req.params;

  if (!/^\d+$/.test(uid)) {
    console.warn(`⚠️ 无效的UID格式: ${uid}`);
    return res.status(400).json({
      error: 'Invalid UID',
      message: 'UID必须是纯数字',
    });
  }

  try {
    const data = await getBangumiData(uid);
    if (!data) {
      return res.status(500).json({ error: 'Internal Server Error', message: '获取数据失败' });
    }
    if (data && typeof data.code === 'number' && data.code !== 0) {
      if (data.code === 53013) return res.status(403).json(data);
      return res.json(data);
    }
    const bodyJson = JSON.stringify(data);
    const etag = `W/"${crypto.createHash('sha1').update(bodyJson).digest('hex')}"`;
    const inm = req.headers['if-none-match'];
    if (inm && inm === etag) {
      return res.status(304).end();
    }
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('application/json').send(bodyJson);
  } catch (err) {
    console.error(`❌ 处理请求时出错:`, err);
    next(err);
  }
});

// 处理 UID 路由（显式 .ics 与纯 UID）
const handleCalendar = async (req, res, next) => {
  const raw = req.params.uid;
  const cleanUid = raw.replace('.ics', '');
  try {
    console.log(`🔍 处理UID: ${cleanUid}`);
    const data = await getBangumiData(cleanUid);
    if (!data) {
      return res.status(500).send('获取数据失败');
    }
    if (data.code !== 0) {
      if (data.code === 53013) {
        console.warn(`⚠️ 用户隐私设置限制: ${cleanUid}`);
        return respondWithEmptyCalendar(res, cleanUid, '用户设置为隐私');
      }
      console.error(`❌ B站API错误: ${data.message} (code: ${data.code})`);
      return res.status(500).send(`Bilibili API 错误: ${data.message} (code: ${data.code})`);
    }
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
};
app.get('/:uid(\\d+)\\.ics', handleCalendar);
app.get('/:uid(\\d+)', handleCalendar);

// 处理404错误 - 为浏览器请求返回HTML页面
app.use((req, res) => {
  // 检查是否为API请求
  if (req.originalUrl.startsWith('/api/')) {
    // API请求返回JSON错误
    console.warn(`⚠️ 404 Not Found: ${req.originalUrl}`);
    return res.status(404).json({
      error: 'Not Found',
      message: `路径 ${req.originalUrl} 不存在`,
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
            .footer {
              margin-top: 16px;
              padding-top: 12px;
              border-top: 1px solid #eee;
              color: #9aa0a6;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-code">404</div>
            <h1>页面未找到</h1>
            <p>抱歉，您访问的页面不存在。</p>
            <p><a href="/">返回首页</a></p>
            <footer class="footer">© ${new Date().getFullYear()} CloudPaste. 保留所有权利。</footer>
          </div>
        </body>
      </html>
    `);
  }
});

// 移除：本地 getBangumiData，实现统一复用 utils/bangumi.js

/* 已迁移至 utils/time.js: formatDate */

/* 已迁移至 utils/time.js: escapeICSText */

app.listen(PORT, () => {
  console.log(`🚀 Bili-Calendar service running on port ${PORT}`);
});
