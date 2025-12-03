// server.js
import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getBangumiData } = require('./utils/bangumi.cjs');
const { createRateLimiter } = require('./utils/rate-limiter.cjs');
const { extractClientIP, generateRequestId } = require('./utils/ip.cjs');
const { validateUID } = require('./utils/security.cjs');
const metrics = require('./utils/metrics.cjs');
const createPushStore = require('./utils/push-store.cjs');
const pushStore = createPushStore(process.env.PUSH_STORE_FILE);
const PUSH_ADMIN_TOKEN = process.env.PUSH_ADMIN_TOKEN || '';
const IS_DEV = (process.env.NODE_ENV || 'development') === 'development';
let webpushInstance = null;

function resolveTrustProxySetting(rawValue) {
  if (rawValue == null) return undefined;
  const trimmed = String(rawValue).trim();
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  if (lowered === 'true') return true;
  if (lowered === 'false') return false;
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) return numeric;
  return trimmed;
}

// 抽离的通用工具（使用 CJS 版本）
const { generateICS, respondWithICS, respondWithEmptyCalendar } = require('./utils/ics.cjs');
const { generateMergedICS, fetchExternalICS } = require('./utils/ics-merge.cjs');

const app = express();

const trustProxySetting = resolveTrustProxySetting(process.env.TRUST_PROXY);
if (trustProxySetting !== undefined) {
  app.set('trust proxy', trustProxySetting);
}

// JSON 解析
app.use(express.json({ limit: '1mb' }));

// 启用响应压缩（gzip/brotli）以减少传输数据量
app.use(
  compression({
    // 只压缩大于1KB的响应
    threshold: 1024,
    // 压缩级别：6是平衡性能和压缩率的好选择
    level: 6,
    // 过滤函数：决定是否压缩特定响应
    filter: (req, res) => {
      // 不压缩已经指定no-transform的响应
      if (req.headers['x-no-compression']) {
        return false;
      }
      // 使用compression的默认过滤器
      return compression.filter(req, res);
    },
  })
);

const PORT = process.env.PORT || 3000;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

// 创建速率限制器实例
const rateLimiter = createRateLimiter();
const requirePushAuth = (req, res) => {
  if (!PUSH_ADMIN_TOKEN) return true;
  const header = req.headers['authorization'] || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.query.token;
  if (token === PUSH_ADMIN_TOKEN) return true;
  res.status(401).json({ error: 'Unauthorized', message: '缺少推送管理令牌' });
  return false;
};

async function getWebpush() {
  if (!webpushInstance) {
    const mod = await import('web-push');
    webpushInstance = mod.default;
    webpushInstance.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }
  return webpushInstance;
}

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
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; worker-src 'self'; upgrade-insecure-requests; block-all-mixed-content; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; script-src 'self'; connect-src 'self' https://api.bilibili.com; font-src 'self' data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; manifest-src 'self'"
  );
  // CORS
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 提供静态文件服务
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'dist'), { dotfiles: 'allow' }));

// 请求ID & 日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  const routeKey = req.path || req.originalUrl || 'unknown';
  metrics.onRequest(routeKey);
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
    metrics.onResponse(statusCode, duration, routeKey);
  });
  next();
});

// 读取版本（增强版）
let VERSION = 'dev';
try {
  const pkgPath = path.join(__dirname, 'package.json');
  const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
  const pkg = JSON.parse(pkgContent);
  
  if (pkg.version && typeof pkg.version === 'string') {
    const trimmedVersion = pkg.version.trim();
    if (trimmedVersion && trimmedVersion !== 'dev') {
      VERSION = trimmedVersion;
    }
  }
} catch (err) {
  console.warn('⚠️ 无法读取版本信息:', err.message);
}

// 限流中间件
const rateLimiterMiddleware = (req, res, next) => {
  const ip = extractClientIP(req);

  // 应用限流（所有请求）
  if (!rateLimiter.check(ip)) {
    const resetTime = new Date(rateLimiter.getResetTime(ip)).toISOString();
    metrics.onRateLimited();

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

// 健康检查接口
app.get('/status', (req, res) => {
  const uptime = process.uptime();
  const uptimeFormatted = formatUptime(uptime);
  const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);

  // 智能判断环境类型
  const env = process.env.NODE_ENV || 'development';

  const data = {
    status: 'ok',
    uptime: uptimeFormatted,
    uptimeMs: Math.round(uptime * 1000),
    memoryMB: mem,
    env,
    version: VERSION,
    port: PORT,
    metrics: metrics.snapshot(),
  };

  const wantJson = req.query.format === 'json' || req.headers.accept?.includes('application/json');
  if (wantJson) {
    res.json(data);
  } else {
    const statusMessage = `✅ Bili-Calendar Service is running.

服务状态:
- 运行时间: ${uptimeFormatted}
- 内存使用: ${mem} MB
- 环境: ${env}
- 版本: ${VERSION}
- 端口: ${PORT}
- 请求统计: 总计 ${data.metrics.requests.total}, 成功 ${data.metrics.requests.success}, 错误 ${data.metrics.requests.errors}, 限流 ${data.metrics.requests.rateLimited}
- B站API: 调用 ${data.metrics.api.calls}, 错误 ${data.metrics.api.errors}, 平均耗时 ${data.metrics.api.avgLatencyMs}ms, 最大耗时 ${data.metrics.api.maxLatencyMs}ms`;

    res.send(statusMessage);
  }
});

// 简易指标 API（JSON）
app.get('/metrics', (req, res) => {
  res.json({ status: 'ok', metrics: metrics.snapshot() });
});

// Prometheus 文本格式
app.get('/metrics/prometheus', (req, res) => {
  const m = metrics.snapshot();
  const lines = [
    '# HELP bili_requests_total Total requests',
    '# TYPE bili_requests_total counter',
    `bili_requests_total ${m.requests.total}`,
    '# HELP bili_requests_errors Total error responses',
    '# TYPE bili_requests_errors counter',
    `bili_requests_errors ${m.requests.errors}`,
    '# HELP bili_requests_success Total success responses',
    '# TYPE bili_requests_success counter',
    `bili_requests_success ${m.requests.success}`,
    '# HELP bili_requests_rate_limited Rate limited count',
    '# TYPE bili_requests_rate_limited counter',
    `bili_requests_rate_limited ${m.requests.rateLimited}`,
    '# HELP bili_api_calls Total Bilibili API calls',
    '# TYPE bili_api_calls counter',
    `bili_api_calls ${m.api.calls}`,
    '# HELP bili_api_errors Bilibili API errors',
    '# TYPE bili_api_errors counter',
    `bili_api_errors ${m.api.errors}`,
    '# HELP bili_api_latency_avg_ms Average API latency ms',
    '# TYPE bili_api_latency_avg_ms gauge',
    `bili_api_latency_avg_ms ${m.api.avgLatencyMs}`,
    '# HELP bili_api_latency_p95_ms API latency p95 ms',
    '# TYPE bili_api_latency_p95_ms gauge',
    `bili_api_latency_p95_ms ${m.api.p95Ms}`,
    '# HELP bili_api_latency_p99_ms API latency p99 ms',
    '# TYPE bili_api_latency_p99_ms gauge',
    `bili_api_latency_p99_ms ${m.api.p99Ms}`,
  ];

  m.routes.forEach((r) => {
    const label = `{route="${r.route}"}`;
    lines.push('# HELP bili_route_requests_total Requests per route');
    lines.push('# TYPE bili_route_requests_total counter');
    lines.push(`bili_route_requests_total${label} ${r.total}`);
    lines.push('# HELP bili_route_requests_errors Route errors');
    lines.push('# TYPE bili_route_requests_errors counter');
    lines.push(`bili_route_requests_errors${label} ${r.errors}`);
    lines.push('# HELP bili_route_latency_avg_ms Route avg latency');
    lines.push('# TYPE bili_route_latency_avg_ms gauge');
    lines.push(`bili_route_latency_avg_ms${label} ${r.avg}`);
    lines.push('# HELP bili_route_latency_p95_ms Route p95 latency');
    lines.push('# TYPE bili_route_latency_p95_ms gauge');
    lines.push(`bili_route_latency_p95_ms${label} ${r.p95}`);
    lines.push('# HELP bili_route_latency_p99_ms Route p99 latency');
    lines.push('# TYPE bili_route_latency_p99_ms gauge');
    lines.push(`bili_route_latency_p99_ms${label} ${r.p99}`);
  });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(lines.join('\n'));
});

// WebPush 实验接口
app.get('/push/public-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(404).json({ error: 'missing key' });
  res.json({ key });
});

app.post('/push/subscribe', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(501).json({ error: 'push not configured' });
  }
  if (!req.body || !req.body.endpoint) {
    return res.status(400).json({ error: 'invalid subscription' });
  }
  pushStore.add(req.body);
  res.json({ status: 'ok', stored: pushStore.list().length });
});

if (IS_DEV) {
  app.post('/push/test', async (req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return res.status(501).json({ error: 'push not configured' });
    }
    if (!requirePushAuth(req, res)) return;
    try {
      const webpush = await getWebpush();
      const payload = JSON.stringify({ title: 'Bili-Calendar 推送测试', body: '推送配置已生效' });
      const subs = pushStore.list();
      const promises = subs.map((sub) =>
        webpush.sendNotification(sub, payload).catch((err) => {
          console.warn('push send failed', err?.statusCode || err?.message);
        })
      );
      await Promise.all(promises);
      res.json({ status: 'sent', count: subs.length });
    } catch (err) {
      res.status(501).json({ error: 'web-push module missing', detail: err.message });
    }
  });
}

/**
 * 将秒数转换为人类可读的运行时间字符串
 * @param {number} seconds - 运行秒数
 * @return {string} 格式化的时间字符串
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

// 根路径返回前端页面（Vite 构建产物）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// 获取 B站追番数据
app.get('/api/bangumi/:uid', rateLimiterMiddleware, async (req, res, next) => {
  const { uid } = req.params;

  if (!validateUID(uid)) {
    console.warn(`⚠️ 无效的UID格式: ${uid}`);
    return res.status(400).json({
      error: 'Invalid UID',
      message: 'UID必须是1-20位纯数字',
    });
  }

  try {
    const apiStart = Date.now();
    const data = await getBangumiData(uid);
    metrics.onApiCall(Date.now() - apiStart, data && data.code === 0);
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

  // 验证 UID 格式
  if (!validateUID(cleanUid)) {
    console.warn(`⚠️ 无效的UID格式: ${cleanUid}`);
    return respondWithEmptyCalendar(res, cleanUid || 'invalid', 'UID必须是1-20位纯数字');
  }

  try {
    console.log(`🔍 处理UID: ${cleanUid}`);

    // 获取追番数据
    const apiStart = Date.now();
    const data = await getBangumiData(cleanUid);
    metrics.onApiCall(Date.now() - apiStart, data && data.code === 0);
    if (!data) {
      console.error(`❌ getBangumiData 返回 null: ${cleanUid}`);
      return respondWithEmptyCalendar(res, cleanUid, '获取数据失败，请稍后重试');
    }

    if (data.error) {
      console.error(`❌ B站API错误: ${data.message || data.error}`);
      return respondWithEmptyCalendar(
        res,
        cleanUid,
        `${data.error}: ${data.message || '请稍后重试'}`
      );
    }

    // 检查API返回错误
    const errorResponse = processBangumiApiError(res, data, cleanUid);
    if (errorResponse) {
      return errorResponse;
    }

    // 处理番剧列表
    const bangumiList = data.data?.list || [];
    console.log(`📋 获取到番剧列表数量: ${bangumiList.length}`);

    if (bangumiList.length === 0) {
      console.warn(`⚠️ 未找到正在播出的番剧: ${cleanUid}`);
      return respondWithEmptyCalendar(res, cleanUid, '未找到正在播出的番剧');
    }

    // 生成并返回ICS日历
    console.log(`📅 生成日历文件`);
    const icsContent = generateICS(bangumiList, cleanUid);
    return respondWithICS(res, icsContent, cleanUid);
  } catch (err) {
    console.error(`❌ 处理请求时出错:`, err);
    next(err);
  }
};

// 聚合番剧 + 外部 ICS 日程
const handleAggregate = async (req, res, next) => {
  const raw = req.params.uid;
  const cleanUid = raw.replace('.ics', '');

  // 验证 UID 格式
  if (!validateUID(cleanUid)) {
    console.warn(`⚠️ 无效的UID格式: ${cleanUid}`);
    return res.status(400).json({
      error: 'Invalid UID',
      message: 'UID必须是1-20位纯数字',
    });
  }

  // 健壮的源列表解析：处理数组参数和非法编码
  const rawSources = req.query.sources;
  const sourceItems = Array.isArray(rawSources)
    ? rawSources
    : rawSources
    ? [rawSources]
    : [];
  let hasInvalidSourceEncoding = false;
  const sourceList = sourceItems
    .flatMap((s) => String(s).split(','))
    .map((s) => {
      const trimmed = s.trim();
      if (!trimmed) return null;
      try {
        return decodeURIComponent(trimmed);
      } catch {
        hasInvalidSourceEncoding = true;
        console.warn(`⚠️ 无效的 URL 编码参数: ${trimmed}`);
        return null;
      }
    })
    .filter(Boolean);

  if (hasInvalidSourceEncoding) {
    return res.status(400).json({
      error: 'Invalid source',
      message: 'sources 参数包含无效的编码',
    });
  }

  if (sourceList.length > 5) {
    return res
      .status(400)
      .json({ error: 'Too many sources', message: '最多支持 5 个外部 ICS 链接' });
  }

  try {
    console.log(`🔀 聚合 UID: ${cleanUid}, 外部源数量: ${sourceList.length}`);

    const apiStart = Date.now();
    const data = await getBangumiData(cleanUid);
    metrics.onApiCall(Date.now() - apiStart, data && data.code === 0);
    if (!data) {
      return res.status(500).json({ error: 'Internal Error', message: '获取数据失败，请稍后重试' });
    }

    if (data.error) {
      return res.status(502).json({
        error: data.error,
        message: data.message || '获取番剧数据失败',
        code: data.code,
      });
    }

    const errorResponse = processBangumiApiError(res, data, cleanUid);
    if (errorResponse) return errorResponse;

    const bangumiList = data.data?.list || [];
    const externalCalendars = await fetchExternalICS(sourceList);

    const merged = generateMergedICS(bangumiList, cleanUid, externalCalendars);
    if (!merged) {
      return respondWithEmptyCalendar(res, cleanUid, '未找到可用日程');
    }

    const icsName = `bili_merge_${cleanUid}.ics`;
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${icsName}"`,
      'Cache-Control': 'public, max-age=600',
    });
    return res.send(merged);
  } catch (err) {
    console.error(`❌ 聚合处理出错:`, err);
    next(err);
  }
};

/**
 * 处理B站API返回的错误
 * @param {Object} res - Express响应对象
 * @param {Object} data - API返回的数据
 * @param {string} uid - 用户UID
 * @returns {Object|undefined} 错误响应对象，如果没有错误则返回undefined
 */
function processBangumiApiError(res, data, uid) {
  if (data.code !== 0) {
    if (data.code === 53013) {
      console.warn(`⚠️ 用户隐私设置限制: ${uid}`);
      return respondWithEmptyCalendar(res, uid, '用户设置为隐私');
    }
    console.error(`❌ B站API错误: ${data.message} (code: ${data.code})`);
    return res.status(500).send(`Bilibili API 错误: ${data.message} (code: ${data.code})`);
  }
  return undefined;
}

app.get('/:uid(\\d+)\\.ics', rateLimiterMiddleware, handleCalendar);
app.get('/:uid(\\d+)', rateLimiterMiddleware, handleCalendar);
app.get('/aggregate/:uid(\\d+)\\.ics', rateLimiterMiddleware, handleAggregate);
app.get('/aggregate/:uid(\\d+)', rateLimiterMiddleware, handleAggregate);

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
            <footer class="footer">© ${new Date().getFullYear()} Bili-Calendar. 保留所有权利。</footer>
          </div>
        </body>
      </html>
    `);
  }
});

// 全局错误处理中间件（放在所有路由之后确保正确捕获）
app.use((err, req, res, _next) => {
  console.error(`❌ 服务器错误:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Bili-Calendar service running on port ${PORT}`);
});
