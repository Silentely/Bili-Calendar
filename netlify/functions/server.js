// netlify/functions/server.js
import serverless from 'serverless-http';
import express from 'express';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRateLimiter } from '../../utils-es/rate-limiter.js';
import metrics from '../../utils-es/metrics.js';
import { handleBangumiApi, handleCalendar, handleAggregate } from '../../server/lib/handlers.js';
import {
  securityAndCorsMiddleware,
  requestLogMiddleware,
  createRateLimiterMiddleware,
  formatUptime,
} from '../../server/lib/middleware.js';
import { registerMetricsRoutes } from '../../server/lib/metrics-routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
// Netlify Functions 默认信任 1 层代理，使 req.ip / X-Forwarded-For 可用；
// 仍可通过 TRUST_PROXY 显式覆盖（含 false 关闭）
const trustProxySetting = resolveTrustProxySetting(
  process.env.TRUST_PROXY != null && String(process.env.TRUST_PROXY).trim() !== ''
    ? process.env.TRUST_PROXY
    : '1'
);
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

app.use(securityAndCorsMiddleware);

// 限流中间件
const rateLimiterMiddleware = createRateLimiterMiddleware(rateLimiter);

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
  app.use(express.static(staticDir, { dotfiles: 'ignore' }));
}

// 请求ID & 日志中间件
app.use(requestLogMiddleware);

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
registerMetricsRoutes(app);

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

app.get('/api/bangumi/:uid', rateLimiterMiddleware, handleBangumiApi);

// 日历与聚合 Handler（与主服务一致，含限流）
app.get('/:uid.ics', rateLimiterMiddleware, handleCalendar);
app.get('/:uid', rateLimiterMiddleware, handleCalendar);
app.get('/aggregate/:uid.ics', rateLimiterMiddleware, handleAggregate);
app.get('/aggregate/:uid', rateLimiterMiddleware, handleAggregate);

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
        const mod = await import('web-push');
        webpush = mod.default;
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
export const handler = serverless(app);
