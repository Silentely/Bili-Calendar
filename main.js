// main.js
import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { getBangumiData } = require('./utils/bangumi.cjs');
const { createRateLimiter } = require('./utils/rate-limiter.cjs');
const { extractClientIP, generateRequestId } = require('./utils/ip.cjs');

// 复用ICS工具（使用 CJS 版本）
const { generateICS, respondWithICS, respondWithEmptyCalendar } = require('./utils/ics.cjs');

const app = express();

// 启用响应压缩以提升性能
app.use(compression({
  threshold: 1024, // 只压缩大于1KB的响应
  level: 6, // 平衡压缩率和CPU使用率
}));

const PORT = process.env.PORT || 3000;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 创建速率限制器实例
const rateLimiter = createRateLimiter();

// 每小时清理一次过期的限流记录
const cleanupInterval = setInterval(() => rateLimiter.cleanup(), 60 * 60 * 1000);

// 优雅关闭时清理定时器
process.on('SIGTERM', () => {
  clearInterval(cleanupInterval);
});
process.on('SIGINT', () => {
  clearInterval(cleanupInterval);
});

/** 安全响应头 + CORS + 基础安全策略 */
app.use((req, res, next) => {
  // 基础安全头
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  // HSTS（仅在 HTTPS 生效）
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // 最小可行 CSP（允许 inline 以兼容现有前端）
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
  const timestamp = new Date().toISOString();
  const ip = extractClientIP(req);
  const requestId = generateRequestId(req);
  res.setHeader('X-Request-Id', requestId);
  // 请求开始日志
  console.log(`[${timestamp}] 📥 ${req.method} ${req.originalUrl} - IP: ${ip} - id=${requestId}`);
  // 响应完成后的日志
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const statusEmoji = statusCode >= 400 ? '❌' : '✅';
    console.log(
      `[${timestamp}] ${statusEmoji} ${req.method} ${req.originalUrl} - ${statusCode} - ${duration}ms - id=${requestId}`
    );
  });
  next();
});

// 读取版本信息
let VERSION = 'dev';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
  VERSION = pkg.version || 'dev';
} catch {}

// 错误处理中间件
app.use((err, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] ❌ 服务器错误:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
  });
});

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

// 获取 B站追番数据
app.get('/api/bangumi/:uid', rateLimiterMiddleware, async (req, res, next) => {
  const { uid } = req.params;

  if (!/^\d+$/.test(uid)) {
    console.warn(`[${new Date().toISOString()}] ⚠️ 无效的UID格式: ${uid}`);
    return res.status(400).json({
      error: 'Invalid UID',
      message: 'UID必须是纯数字',
    });
  }

  try {
    const data = await getBangumiData(uid);

    if (!data) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: '获取数据失败',
      });
    }

    if (data && typeof data.code === 'number' && data.code !== 0) {
      if (data.code === 53013) {
        return res.status(403).json(data);
      }
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
    console.error(`[${new Date().toISOString()}] ❌ 处理请求时出错:`, err);
    next(err);
  }
});

// 健康检查接口
app.get('/status', (req, res) => {
  const uptime = process.uptime();
  const uptimeFormatted = formatUptime(uptime);
  const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
  res.send(
    `✅ Bili-Calendar Service is running here.

服务状态:
- 运行时间: ${uptimeFormatted}
- 内存使用: ${mem} MB
- 环境: ${process.env.NODE_ENV || 'development'}
- 端口: ${PORT}
`
  );
});

// 根路径返回前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 处理 UID 路由（显式 .ics 与纯 UID）
const handleCalendar = async (req, res, next) => {
  const raw = req.params.uid;
  const uid = raw.replace('.ics', '');
  try {
    console.log(`[${new Date().toISOString()}] 🔍 处理UID: ${uid}`);
    const data = await getBangumiData(uid);
    if (!data) {
      return res.status(500).send('获取数据失败');
    }
    if (data.code !== 0) {
      if (data.code === 53013) {
        console.warn(`[${new Date().toISOString()}] ⚠️ 用户隐私设置限制: ${uid}`);
        return respondWithEmptyCalendar(res, uid, '用户设置为隐私');
      }
      console.error(
        `[${new Date().toISOString()}] ❌ B站API错误: ${data.message} (code: ${data.code})`
      );
      return res.status(500).send(`Bilibili API 错误: ${data.message} (code: ${data.code})`);
    }
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
};
app.get('/:uid(\\d+)\\.ics', handleCalendar);
app.get('/:uid(\\d+)', handleCalendar);

// 处理404错误
app.use((req, res) => {
  console.warn(`[${new Date().toISOString()}] ⚠️ 404 Not Found: ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    message: `路径 ${req.originalUrl} 不存在`,
  });
});

// 错误处理中间件（放在所有路由之后）
app.use((err, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] ❌ 服务器错误:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
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
// 移除：getBangumiData 本地实现，统一复用 utils/bangumi.js

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
