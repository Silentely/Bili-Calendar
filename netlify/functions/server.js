// netlify/functions/server.js
const serverless = require('serverless-http');
const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// 让 Netlify bundler 显式包含 axios，供 utils/* 动态依赖
require('axios');

const { createRequire } = require('module');
const requireFromRoot = createRequire(path.join(__dirname, '../../package.json'));

const { createRateLimiter } = requireFromRoot('./utils/rate-limiter.cjs');
const { extractClientIP, generateRequestId } = requireFromRoot('./utils/ip.cjs');
const { generateICS, respondWithICS, respondWithEmptyCalendar } = requireFromRoot('./utils/ics.cjs');
const { generateMergedICS, fetchExternalICS } = requireFromRoot('./utils/ics-merge.cjs');
const { getBangumiData } = requireFromRoot('./utils/bangumi.cjs');
const metrics = requireFromRoot('./utils/metrics.cjs');
const PUSH_ADMIN_TOKEN = process.env.PUSH_ADMIN_TOKEN || '';
const IS_DEV = (process.env.NODE_ENV || 'development') === 'development';
let webpush = null;
const pushSubscriptions = new Set();

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

// 导入主应用逻辑
const app = express();
const trustProxySetting = resolveTrustProxySetting(process.env.TRUST_PROXY);
if (trustProxySetting !== undefined) {
  app.set('trust proxy', trustProxySetting);
}
app.use(express.json({ limit: '1mb' }));

// 启用 gzip/brotli 压缩
app.use(
  compression({
    threshold: 1024, // 仅压缩大于 1KB 的响应
    level: 6, // 压缩级别 (0-9)
    filter: (req, res) => {
      // 不压缩已经压缩的内容
      if (res.getHeader('Content-Encoding')) {
        return false;
      }
      // 使用compression的默认过滤器
      return compression.filter(req, res);
    },
  })
);

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

// 注意：在Netlify函数环境中，因为函数是无状态的，内存存储在每次调用之间不会保留
// 在生产环境中应该考虑使用Redis等外部存储来实现持久化的限流

// 安全头 + CORS
app.use((req, res, next) => {
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  };
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

// 限流中间件
const rateLimiterMiddleware = (req, res, next) => {
  const ip = extractClientIP(req);

  // 应用限流（所有请求）
  if (!rateLimiter.check(ip)) {
    const resetTime = new Date(rateLimiter.getResetTime(ip)).toISOString();

    // 记录限流事件到 metrics
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

// 静态文件服务配置
const STATIC_DIRS = [
  path.join(__dirname, 'dist'),
  path.join(__dirname, '../dist'),
  path.join(__dirname, '../../dist'),
  path.join(process.cwd(), 'dist'),
];

let staticDir = null;

// 查找静态文件目录
for (const candidate of STATIC_DIRS) {
  try {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      const indexPath = path.join(candidate, 'index.html');
      if (fs.existsSync(indexPath)) {
        staticDir = candidate;
        break;
      }
    }
  } catch {
    // 静默失败，不输出错误日志
  }
}

if (staticDir) {
  app.use(express.static(staticDir, { dotfiles: 'allow' }));
}

// 请求ID & 日志中间件 (简化)
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

// 读取版本
let VERSION = 'dev';

try {
  const localPkgPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(localPkgPath)) {
    const pkgContent = fs.readFileSync(localPkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    if (pkg.version && pkg.version.trim() && pkg.version !== 'dev') {
      VERSION = pkg.version;
    }
  }
} catch {
  // 静默失败
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

// 健康检查接口
app.get('/status', (req, res) => {
  const uptime = process.uptime();
  const uptimeFormatted = formatUptime(uptime);
  const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);

  const env =
    process.env.NODE_ENV ||
    (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME ? 'production' : 'development');

  const data = {
    status: 'ok',
    uptime: uptimeFormatted,
    uptimeMs: Math.round(uptime * 1000),
    memoryMB: mem,
    env,
    version: VERSION,
    port: process.env.PORT || 'N/A (Serverless)',
    metrics: metrics.snapshot(),
  };

  const wantJson = req.query.format === 'json' || req.headers.accept?.includes('application/json');
  if (wantJson) {
    return res.json(data);
  }

  const statusMessage = `✅ Bili-Calendar Service is running here

服务状态:
- 运行时间: ${uptimeFormatted}
- 内存使用: ${mem} MB
- 环境: ${env}
- 版本: ${VERSION}
- 端口: ${process.env.PORT || 'N/A (Serverless)'}
- 请求统计: 总计 ${data.metrics.requests.total}, 成功 ${data.metrics.requests.success}, 错误 ${data.metrics.requests.errors}, 限流 ${data.metrics.requests.rateLimited}
- B站API: 调用 ${data.metrics.api.calls}, 错误 ${data.metrics.api.errors}, 平均耗时 ${data.metrics.api.avgLatencyMs}ms, p95 ${data.metrics.api.p95Ms}ms, p99 ${data.metrics.api.p99Ms}ms`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  res.send(statusMessage);
});

// 简易指标
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

// 根路径返回前端页面
app.get('/', (req, res) => {
  const indexCandidates = staticDir ? [path.join(staticDir, 'index.html')] : [];
  indexCandidates.push(path.join(__dirname, '../../public', 'index.html'));

  const target = indexCandidates.find((candidate) => fs.existsSync(candidate));
  if (target) {
    return res.sendFile(target);
  }
  res.status(500).send('静态首页缺失，请检查构建配置');
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
  try {
    console.log(`🔍 处理UID: ${cleanUid}`);
    const apiStart = Date.now();
    const data = await getBangumiData(cleanUid);
    metrics.onApiCall(Date.now() - apiStart, data && data.code === 0);
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

// 聚合番剧 + 外部 ICS 日程
const handleAggregate = async (req, res, next) => {
  const raw = req.params.uid;
  const cleanUid = raw.replace('.ics', '');

  const sourcesParam = req.query.sources || '';
  const sourceList = sourcesParam
    .split(',')
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean);

  if (sourceList.length > 5) {
    return res
      .status(400)
      .json({ error: 'Too many sources', message: '最多支持 5 个外部 ICS 链接' });
  }

  const invalid = sourceList.find((s) => !/^https?:\/\//i.test(s));
  if (invalid) {
    return res.status(400).json({ error: 'Invalid source', message: '仅支持 http/https 链接' });
  }

  try {
    console.log(`🔀 聚合 UID: ${cleanUid}, 外部源数量: ${sourceList.length}`);

    const apiStart = Date.now();
    const data = await getBangumiData(cleanUid);
    metrics.onApiCall(Date.now() - apiStart, data && data.code === 0);
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
    const externalCalendars = await fetchExternalICS(sourceList);

    const merged = generateMergedICS(bangumiList, cleanUid, externalCalendars);
    if (!merged) {
      return respondWithEmptyCalendar(res, cleanUid, '未找到可用日程');
    }

    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="bili_merge_${cleanUid}.ics"`,
      'Cache-Control': 'public, max-age=600',
    });
    return res.send(merged);
  } catch (err) {
    console.error(`❌ 聚合处理出错:`, err);
    next(err);
  }
};

app.get('/aggregate/:uid(\\d+)\\.ics', rateLimiterMiddleware, handleAggregate);
app.get('/aggregate/:uid(\\d+)', rateLimiterMiddleware, handleAggregate);

// WebPush 实验接口（注意函数无状态，订阅存内存仅本次实例）
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
  pushSubscriptions.add(req.body);
  res.json({ status: 'ok' });
});

if (IS_DEV) {
  app.post('/push/test', async (req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return res.status(501).json({ error: 'push not configured' });
    }
    if (!requirePushAuth(req, res)) return;
    try {
      if (!webpush) {
        webpush = requireFromRoot('web-push');
        webpush.setVapidDetails(
          process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY
        );
      }
    } catch (err) {
      return res.status(501).json({ error: 'web-push module missing', detail: err.message });
    }

    const payload = JSON.stringify({ title: 'Bili-Calendar 推送测试', body: '推送配置已生效' });
    const promises = Array.from(pushSubscriptions).map((sub) =>
      webpush.sendNotification(sub, payload).catch((err) => {
        console.warn('push send failed', err?.statusCode || err?.message);
      })
    );
    await Promise.all(promises);
    res.json({ status: 'sent', count: pushSubscriptions.size });
  });
}

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

// 错误处理中间件（移到所有路由之后）
app.use((err, req, res, _next) => {
  console.error(`❌ 服务器错误:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
  });
});

// 将Express应用包装为serverless函数
exports.handler = serverless(app);
