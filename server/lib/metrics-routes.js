// @ts-check
/**
 * 指标路由注册
 */

import crypto from 'node:crypto';
import metrics from '../../utils-es/metrics.js';

/**
 * 监控端点鉴权中间件（当配置了 METRICS_TOKEN 环境变量时生效）
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function metricsAuthMiddleware(req, res, next) {
  const token = process.env.METRICS_TOKEN;
  if (!token) {
    return next();
  }

  const authHeader = req.headers?.['authorization'];
  const bearer =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const provided = bearer || (typeof req.query?.token === 'string' ? req.query.token : null);

  if (typeof provided === 'string') {
    const bufA = Buffer.from(provided);
    const bufB = Buffer.from(token);
    if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
      return next();
    }
  }

  res.status(401).json({
    error: 'Unauthorized',
    message: '访问监控指标需要有效的访问令牌',
  });
}

/**
 * @param {import('express').Express} app
 */
export function registerMetricsRoutes(app) {
  app.get('/metrics', metricsAuthMiddleware, (_req, res) => {
    res.json({ status: 'ok', metrics: metrics.snapshot() });
  });

  app.get('/metrics/prometheus', metricsAuthMiddleware, (_req, res) => {
    const m = metrics.snapshot();
    const mem = process.memoryUsage();
    const lines = [
      '# HELP bili_calendar_requests_total Total number of HTTP requests',
      '# TYPE bili_calendar_requests_total counter',
      `bili_calendar_requests_total ${m.requests.total}`,
      '# HELP bili_calendar_requests_success Successful HTTP requests',
      '# TYPE bili_calendar_requests_success counter',
      `bili_calendar_requests_success ${m.requests.success}`,
      '# HELP bili_calendar_requests_errors Failed HTTP requests',
      '# TYPE bili_calendar_requests_errors counter',
      `bili_calendar_requests_errors ${m.requests.errors}`,
      '# HELP bili_calendar_rate_limited_total Rate limited requests',
      '# TYPE bili_calendar_rate_limited_total counter',
      `bili_calendar_rate_limited_total ${m.requests.rateLimited}`,
      '# HELP bili_calendar_api_calls_total External API calls',
      '# TYPE bili_calendar_api_calls_total counter',
      `bili_calendar_api_calls_total ${m.api.calls}`,
      '# HELP bili_calendar_api_errors_total External API errors',
      '# TYPE bili_calendar_api_errors_total counter',
      `bili_calendar_api_errors_total ${m.api.errors}`,
      '# HELP bili_calendar_api_latency_avg_ms Average API latency in ms',
      '# TYPE bili_calendar_api_latency_avg_ms gauge',
      `bili_calendar_api_latency_avg_ms ${m.api.avgLatencyMs}`,
      '# HELP bili_calendar_api_latency_p95_ms P95 API latency in ms',
      '# TYPE bili_calendar_api_latency_p95_ms gauge',
      `bili_calendar_api_latency_p95_ms ${m.api.p95Ms}`,
      '# HELP bili_calendar_api_latency_p99_ms P99 API latency in ms',
      '# TYPE bili_calendar_api_latency_p99_ms gauge',
      `bili_calendar_api_latency_p99_ms ${m.api.p99Ms}`,
      '# HELP process_resident_memory_bytes Resident memory size in bytes',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${mem.rss}`,
      '# HELP process_heap_used_bytes Heap memory used in bytes',
      '# TYPE process_heap_used_bytes gauge',
      `process_heap_used_bytes ${mem.heapUsed}`,
    ];
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(lines.join('\n') + '\n');
  });
}
