// @ts-check
/**
 * 共享 Express 中间件工厂
 */

import { extractClientIP, generateRequestId } from '../../utils-es/ip.js';
import metrics from '../../utils-es/metrics.js';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

const CSP =
  "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; worker-src 'self'; upgrade-insecure-requests; block-all-mixed-content; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; script-src 'self'; connect-src 'self' https://api.bilibili.com; font-src 'self' data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; manifest-src 'self'";

/**
 * 安全响应头 + CORS
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function securityAndCorsMiddleware(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Content-Security-Policy', CSP);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
}

/**
 * 请求 ID、日志与指标
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function requestLogMiddleware(req, res, next) {
  const start = Date.now();
  const routeKey = req.path || req.originalUrl || 'unknown';
  metrics.onRequest(routeKey);
  const ip = extractClientIP(req);
  const requestId = generateRequestId(req);
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const statusEmoji = statusCode >= 400 ? '❌' : '✅';
    // 单行结构化日志：方法/路径/状态/耗时/IP/请求ID，降低日志量与解析成本
    const safeUrl = (req.originalUrl || '').replace(
      /([?&](?:token|key|secret|password)=)[^&]*/gi,
      '\[REDACTED]'
    );
    console.log(
      `${statusEmoji} ${req.method} ${safeUrl} - ${statusCode} - ${duration}ms - ip=${ip} - id=${requestId}`
    );
    metrics.onResponse(statusCode, duration, routeKey);
  });
  next();
}

/**
 * 创建限流中间件
 * @param {{check: (ip: string) => boolean, getResetTime: (ip: string) => number, getRemainingRequests: (ip: string) => number, MAX_REQUESTS: number, TIME_WINDOW?: number}} rateLimiter
 * @returns {import('express').RequestHandler}
 */
export function createRateLimiterMiddleware(rateLimiter) {
  return (req, res, next) => {
    const ip = extractClientIP(req);

    if (!rateLimiter.check(ip)) {
      const resetMs = rateLimiter.getResetTime(ip);
      const resetTime = new Date(resetMs).toISOString();
      const retryAfterSeconds = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
      metrics.onRateLimited();

      res.setHeader('X-RateLimit-Limit', rateLimiter.MAX_REQUESTS);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', resetTime);
      // 标明限流实现为进程内存，Serverless 多实例下仅尽力而为
      res.setHeader('X-RateLimit-Backend', 'memory');
      // 客户端可按 Retry-After 自动退避
      res.setHeader('Retry-After', String(retryAfterSeconds));

      const windowMinutes = Math.max(
        1,
        Math.round((rateLimiter.TIME_WINDOW || 60 * 60 * 1000) / 60000)
      );

      res.status(429).json({
        error: '请求过于频繁',
        message: `API调用次数已达上限，请在${resetTime}后再试`,
        limit: rateLimiter.MAX_REQUESTS,
        window: `${windowMinutes}分钟`,
        reset: resetTime,
        note: '限流基于进程内存；Serverless 多实例下为尽力而为，生产可接 Redis/边缘限流',
      });
      return;
    }

    res.setHeader('X-RateLimit-Limit', rateLimiter.MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', rateLimiter.getRemainingRequests(ip));
    res.setHeader('X-RateLimit-Reset', new Date(rateLimiter.getResetTime(ip)).toISOString());
    res.setHeader('X-RateLimit-Backend', 'memory');
    next();
  };
}

/**
 * 格式化运行时间
 * @param {number} seconds
 * @returns {string}
 */
export function formatUptime(seconds) {
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
