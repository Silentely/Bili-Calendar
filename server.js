// server.js
import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRateLimiter } from './utils-es/rate-limiter.js';
import metrics from './utils-es/metrics.js';
import createPushStore from './utils-es/push-store.js';
import { handleBangumiApi, handleCalendar, handleAggregate } from './server/lib/handlers.js';
import {
  securityAndCorsMiddleware,
  requestLogMiddleware,
  createRateLimiterMiddleware,
  formatUptime,
} from './server/lib/middleware.js';
import { registerMetricsRoutes } from './server/lib/metrics-routes.js';

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 * @typedef {{setVapidDetails(subject?: string, publicKey?: string, privateKey?: string): void, sendNotification(subscription: unknown, payload?: string): Promise<unknown>}} WebPushClient
 * @typedef {{code?: number, message?: string, error?: string, data?: {list?: unknown[]}} & Record<string, unknown>} BangumiData
 */

const pushStore = createPushStore(process.env.PUSH_STORE_FILE);
const PUSH_ADMIN_TOKEN = process.env.PUSH_ADMIN_TOKEN || '';
const IS_DEV = (process.env.NODE_ENV || 'development') === 'development';
/** @type {WebPushClient|null} */
let webpushInstance = null;

/**
 * @param {string|number|boolean|undefined} rawValue - trust proxy 原始配置
 * @returns {boolean|number|string|undefined}
 */
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
// 创建速率限制器实例
const rateLimiter = createRateLimiter();
/**
 * @param {Request} req - Express 请求
 * @param {Response} res - Express 响应
 * @returns {boolean}
 */
const requirePushAuth = (req, res) => {
  if (!PUSH_ADMIN_TOKEN) return true;
  const header = req.headers['authorization'] || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.query.token;
  if (token === PUSH_ADMIN_TOKEN) return true;
  res.status(401).json({ error: 'Unauthorized', message: '缺少推送管理令牌' });
  return false;
};

/**
 * @returns {Promise<WebPushClient>}
 */
async function getWebpush() {
  if (!webpushInstance) {
    const mod = await import('web-push');
    webpushInstance = /** @type {WebPushClient} */ (mod.default);
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

app.use(securityAndCorsMiddleware);

/** Link 响应头（RFC 8288）— 用于 Agent 发现 */
app.use((_req, res, next) => {
  const links = [
    '</sitemap.xml>; rel="sitemap"',
    '</.well-known/api-catalog>; rel="api-catalog"',
    '</.well-known/agent-skills/index.json>; rel="service-desc"',
  ];
  res.setHeader('Link', links.join(', '));
  next();
});

// 提供静态文件服务
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Markdown 协商中间件 — 在静态文件之前拦截 Agent 请求
app.use((req, res, next) => {
  const accept = req.headers.accept || '';
  if (!accept.includes('text/markdown')) return next();

  if (req.path === '/') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.send(buildHomeMarkdown());
  }

  if (req.path === '/status') {
    const uptime = process.uptime();
    const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.send(
      buildStatusMarkdown({
        uptimeFormatted: formatUptime(uptime),
        memoryMB: mem,
        env: process.env.NODE_ENV || 'development',
        version: VERSION,
        port: PORT,
        metrics: metrics.snapshot(),
      })
    );
  }

  next();
});

app.use(express.static(path.join(__dirname, 'dist'), { dotfiles: 'ignore' }));
// 开发环境备用：dist/ 不存在时从 public/ 提供静态文件
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'ignore' }));

// 请求ID & 日志中间件
app.use(requestLogMiddleware);

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
  const message = err instanceof Error ? err.message : String(err);
  console.warn('⚠️ 无法读取版本信息:', message);
}

const rateLimiterMiddleware = createRateLimiterMiddleware(rateLimiter);

/**
 * 生成首页 Markdown 描述（供 text/markdown 内容协商与 Agent 使用）
 * @returns {string}
 */
function buildHomeMarkdown() {
  return `# Bili-Calendar — B站追番日历订阅

将B站追番列表转换为ICS日历订阅，兼容Apple/Google/Outlook等主流日历应用。

## API 端点

- **GET /api/bangumi/:uid** — 获取用户追番数据（JSON）
- **GET /:uid.ics** — 获取用户追番日历（ICS格式）
- **GET /aggregate/:uid.ics?sources=...** — 聚合外部ICS日历
- **GET /status** — 服务健康状态
- **GET /metrics** — 性能指标（JSON）

## 使用方法

1. 输入B站用户UID（纯数字，1-20位）
2. 获取ICS日历订阅链接
3. 添加到Apple日历/Google日历/Outlook

## 链接

- [GitHub 仓库](https://github.com/Silentely/Bili-Calendar)
- [API 目录](/.well-known/api-catalog)
- [站点地图](/sitemap.xml)
`;
}

/**
 * 生成状态页 Markdown 描述
 * @param {{uptimeFormatted: string, memoryMB: number, env: string, version: string, port: string|number, metrics: {requests: {total?: number, success?: number, errors?: number, rateLimited?: number}, api: {calls?: number, errors?: number, avgLatencyMs?: number, maxLatencyMs?: number}}}} data - 状态数据
 * @returns {string}
 */
function buildStatusMarkdown({ uptimeFormatted, memoryMB, env, version, port, metrics }) {
  return `# Bili-Calendar 服务状态

- **状态**: ok
- **运行时间**: ${uptimeFormatted}
- **内存使用**: ${memoryMB} MB
- **环境**: ${env}
- **版本**: ${version}
- **端口**: ${port}
- **请求统计**: 总计 ${metrics.requests.total}, 成功 ${metrics.requests.success}, 错误 ${metrics.requests.errors}, 限流 ${metrics.requests.rateLimited}
- **B站API**: 调用 ${metrics.api.calls}, 错误 ${metrics.api.errors}, 平均耗时 ${metrics.api.avgLatencyMs}ms, 最大耗时 ${metrics.api.maxLatencyMs}ms
`;
}

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

  const accept = req.headers.accept || '';
  const wantJson = req.query.format === 'json' || accept.includes('application/json');
  const wantMarkdown = accept.includes('text/markdown');
  if (wantJson) {
    res.json(data);
  } else if (wantMarkdown) {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(
      buildStatusMarkdown({
        uptimeFormatted: data.uptime,
        memoryMB: data.memoryMB,
        env: data.env,
        version: data.version,
        port: data.port,
        metrics: data.metrics,
      })
    );
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

// 简易指标 API（JSON + Prometheus）
registerMetricsRoutes(app);

// WebPush 实验接口
app.get('/push/public-key', (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(404).json({ error: 'missing key' });
  return res.json({ key });
});

app.post('/push/subscribe', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    res.status(501).json({ error: 'push not configured' });
    return;
  }
  if (!req.body || !req.body.endpoint) {
    res.status(400).json({ error: 'invalid subscription' });
    return;
  }
  pushStore.add(req.body);
  res.json({ status: 'ok', stored: pushStore.list().length });
});

if (IS_DEV) {
  app.post('/push/test', async (req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      res.status(501).json({ error: 'push not configured' });
      return;
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
      const detail = err instanceof Error ? err.message : String(err);
      res.status(501).json({ error: 'web-push module missing', detail });
    }
  });
}

// 根路径返回前端页面（Vite 构建产物）— 支持 Markdown 协商
app.get('/', (req, res) => {
  const accept = req.headers.accept || '';
  if (accept.includes('text/markdown')) {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(buildHomeMarkdown());
    return;
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// 获取 B站追番数据（实现见 server/lib/handlers.js）
app.get('/api/bangumi/:uid', rateLimiterMiddleware, handleBangumiApi);

// 日历与聚合 Handler 见 server/lib/handlers.js

// 显式路由：robots.txt、sitemap.xml、openapi.json（避免被 /:uid 参数路由捕获）
app.get('/robots.txt', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'robots.txt'));
});
app.get('/sitemap.xml', (_req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

/** MPP OpenAPI — Machine Payment Protocol 支付发现 */
app.get('/openapi.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    openapi: '3.0.3',
    info: {
      title: 'Bili-Calendar API',
      description: 'B站追番日历订阅服务 API — 将B站追番列表转换为 ICS 日历格式',
      version: VERSION,
      contact: { name: 'Bili-Calendar', url: 'https://github.com/Silentely/Bili-Calendar' },
    },
    servers: [{ url: 'https://calendar.cosr.eu.org', description: '生产环境' }],
    paths: {
      '/api/bangumi/{uid}': {
        get: {
          operationId: 'getBangumi',
          summary: '获取用户追番数据',
          description: '根据B站用户UID获取追番列表的JSON数据',
          tags: ['bangumi'],
          parameters: [
            {
              name: 'uid',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^\\d{1,20}$' },
              description: 'B站用户UID',
            },
          ],
          responses: {
            200: { description: '追番数据 JSON' },
            400: { description: 'UID 格式无效' },
            429: { description: '请求过于频繁' },
          },
        },
      },
      '/{uid}.ics': {
        get: {
          operationId: 'getCalendar',
          summary: '获取追番日历',
          description: '根据B站用户UID生成 ICS 格式的日历订阅文件',
          tags: ['calendar'],
          parameters: [
            {
              name: 'uid',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^\\d{1,20}$' },
              description: 'B站用户UID',
            },
          ],
          responses: {
            200: {
              description: 'ICS 日历文件',
              content: { 'text/calendar': { schema: { type: 'string', format: 'binary' } } },
            },
          },
        },
      },
      '/aggregate/{uid}.ics': {
        get: {
          operationId: 'getAggregatedCalendar',
          summary: '获取聚合日历',
          description: '合并B站追番与外部 ICS 源的聚合日历',
          tags: ['calendar', 'aggregate'],
          parameters: [
            {
              name: 'uid',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'B站用户UID',
            },
            {
              name: 'sources',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: '外部ICS链接（URL编码，逗号分隔，最多5个）',
            },
          ],
          responses: {
            200: { description: '聚合 ICS 日历文件' },
            400: { description: '参数错误' },
          },
        },
      },
      '/status': {
        get: {
          operationId: 'getStatus',
          summary: '服务健康状态',
          tags: ['system'],
          responses: { 200: { description: '服务状态信息' } },
        },
      },
    },
    tags: [
      { name: 'bangumi', description: 'B站追番数据' },
      { name: 'calendar', description: '日历订阅' },
      { name: 'aggregate', description: '外部日历聚合' },
      { name: 'system', description: '系统状态' },
    ],
  });
});

app.get('/:uid.ics', rateLimiterMiddleware, handleCalendar);
app.get('/:uid', rateLimiterMiddleware, handleCalendar);
app.get('/aggregate/:uid.ics', rateLimiterMiddleware, handleAggregate);
app.get('/aggregate/:uid', rateLimiterMiddleware, handleAggregate);

// ===== .well-known Agent 发现端点 =====

/** RFC 9727 — API 目录 */
app.get('/.well-known/api-catalog', (_req, res) => {
  res.setHeader('Content-Type', 'application/linkset+json; charset=utf-8');
  res.json({
    linkset: [
      {
        anchor: `https://calendar.cosr.eu.org/api/bangumi/:uid`,
        item: [
          { rel: 'service-desc', href: 'https://calendar.cosr.eu.org/status', type: 'text/plain' },
          { rel: 'status', href: 'https://calendar.cosr.eu.org/status', type: 'application/json' },
        ],
      },
      {
        anchor: 'https://calendar.cosr.eu.org/:uid.ics',
        item: [
          { rel: 'service-desc', href: 'https://calendar.cosr.eu.org/status', type: 'text/plain' },
        ],
      },
      {
        anchor: 'https://calendar.cosr.eu.org/aggregate/:uid.ics',
        item: [
          { rel: 'service-desc', href: 'https://calendar.cosr.eu.org/status', type: 'text/plain' },
        ],
      },
    ],
  });
});

/** RFC 9728 — OAuth Protected Resource Metadata */
app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    resource: 'https://calendar.cosr.eu.org',
    authorization_servers: [],
    scopes_supported: [],
    bearer_methods_supported: ['header', 'query'],
    resource_documentation: 'https://github.com/Silentely/Bili-Calendar',
  });
});

/** MCP Server Card (SEP-1649) */
app.get('/.well-known/mcp/server-card.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    schema: 'https://modelcontextprotocol.io/schemas/2025-03-26/server-card',
    name: 'Bili-Calendar',
    description: '将B站追番列表转换为ICS日历订阅的服务',
    version: VERSION,
    homepage: 'https://calendar.cosr.eu.org',
    transport: {
      type: 'http',
      url: 'https://calendar.cosr.eu.org',
    },
    capabilities: {
      tools: [
        {
          name: 'generate-subscription',
          description: '根据B站UID生成ICS日历订阅链接',
        },
        {
          name: 'preview-anime',
          description: '预览用户的B站追番列表',
        },
      ],
    },
  });
});

/** Agent Skills 发现索引 */
app.get('/.well-known/agent-skills/index.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    $schema: 'https://agentskills.io/schemas/v0.2.0/index.json',
    name: 'Bili-Calendar',
    description: 'B站追番日历订阅服务的Agent能力发现',
    skills: [
      {
        name: 'generate-subscription',
        type: 'action',
        description: '根据B站用户UID生成ICS日历订阅链接，支持单用户和聚合模式',
        url: 'https://calendar.cosr.eu.org',
        sha256: '',
      },
      {
        name: 'preview-anime',
        type: 'query',
        description: '查询B站用户的追番列表，返回番剧名称、更新时间、封面等信息',
        url: 'https://calendar.cosr.eu.org',
        sha256: '',
      },
      {
        name: 'service-status',
        type: 'query',
        description: '查询服务运行状态、内存使用、请求统计等信息',
        url: 'https://calendar.cosr.eu.org/status',
        sha256: '',
      },
    ],
  });
});

/** OpenID Connect 发现（声明无受保护端点） */
app.get('/.well-known/openid-configuration', (_req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    issuer: 'https://calendar.cosr.eu.org',
    authorization_endpoint: '',
    token_endpoint: '',
    jwks_uri: '',
    grant_types_supported: [],
    response_types_supported: [],
    subject_types_supported: [],
    id_token_signing_alg_values_supported: [],
    scopes_supported: [],
    claims_supported: [],
    service_documentation: 'https://github.com/Silentely/Bili-Calendar',
    note: '此服务无需认证，所有API端点均为公开访问',
  });
});

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
            /* 暗黑模式适配：跟随系统偏好，避免夜间访问刺眼 */
            @media (prefers-color-scheme: dark) {
              body { background-color: #1a1a1a; }
              .container { background: #2a2a2a; box-shadow: 0 2px 10px rgba(0,0,0,0.4); }
              h1 { color: #ff6b6b; }
              p { color: #bbb; }
              a { color: #64b5f6; }
              .error-code { color: #444; }
              .footer { border-top-color: #333; color: #777; }
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

/**
 * 全局错误处理中间件（放在所有路由之后确保正确捕获）。
 * @type {(err: unknown, _req: Request, res: Response, _next: NextFunction) => void}
 */
const errorMiddleware = (err, _req, res, _next) => {
  console.error(`❌ 服务器错误:`, err);
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : message,
  });
};

app.use(errorMiddleware);

app.listen(PORT, () => {
  console.log(`🚀 Bili-Calendar service running on port ${PORT}`);
});
