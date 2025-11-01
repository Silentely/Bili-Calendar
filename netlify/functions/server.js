// netlify/functions/server.js
const serverless = require('serverless-http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createRateLimiter } = require('../../utils/rate-limiter.cjs');
const { extractClientIP, generateRequestId } = require('../../utils/ip.cjs');

// 复用时间与ICS工具
const { generateICS, respondWithICS, respondWithEmptyCalendar } = require('../../utils/ics.cjs');
const { getBangumiData } = require('../../utils/bangumi.cjs');

// 导入主应用逻辑
const app = express();

// 创建速率限制器实例
const rateLimiter = createRateLimiter();

// 注意：在Netlify函数环境中，因为函数是无状态的，内存存储在每次调用之间不会保留
// 在生产环境中应该考虑使用Redis等外部存储来实现持久化的限流

// 安全头 + CORS
app.use((req, res, next) => {
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  // 安全头
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api.bilibili.com; font-src 'self' data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; manifest-src 'self'"
  );
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

/**
 * 提供静态文件服务（增强版静态目录查找和错误处理）
 * 优先使用打包后的 public，其次回退到仓库根目录
 */
const publicDirCandidates = [
  // 优先级1: 函数构建目录中的 public (netlify/functions-build/public)
  path.join(__dirname, 'public'),
  // 优先级2: 相对于函数目录的 public (netlify/public)
  path.join(__dirname, '../public'),
  // 优先级3: 项目根目录的 public (根目录/public)
  path.join(__dirname, '../../public'),
  // 优先级4: 当前工作目录的 public
  path.join(process.cwd(), 'public'),
  // 优先级5: 上级目录的 public
  path.join(process.cwd(), '../public'),
];

let staticDir = null;
let foundPath = '';

// 详细查找逻辑
for (const candidate of publicDirCandidates) {
  try {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      // 检查是否包含关键的 index.html
      const indexPath = path.join(candidate, 'index.html');
      if (fs.existsSync(indexPath)) {
        staticDir = candidate;
        foundPath = candidate;
        console.log(`✅ 找到静态资源目录: ${staticDir}`);
        break;
      } else {
        console.log(`⚠️ 目录存在但缺少 index.html: ${candidate}`);
      }
    }
  } catch (error) {
    console.log(`❌ 检查目录失败: ${candidate} - ${error.message}`);
  }
}

if (!staticDir) {
  console.error('💥 未找到可用的 public 静态目录');
  console.error('📋 已检查的路径:');
  publicDirCandidates.forEach(dir => {
    const exists = fs.existsSync(dir);
    console.error(`   - ${dir} (存在: ${exists})`);
    if (exists) {
      try {
        const stats = fs.statSync(dir);
        console.error(`     类型: ${stats.isDirectory() ? '目录' : '文件'}`);
        const indexExists = fs.existsSync(path.join(dir, 'index.html'));
        console.error(`     包含index.html: ${indexExists}`);
      } catch (err) {
        console.error(`     状态检查失败: ${err.message}`);
      }
    }
  });
  
  // 提供更详细的错误信息
  console.error('🔧 请检查以下项目:');
  console.error('   1. 确保 public 目录存在且包含 index.html');
  console.error('   2. 检查构建脚本是否正确复制文件');
  console.error('   3. 验证 netlify.toml 配置正确');
  console.error('   4. 确认函数构建目录结构正确');
} else {
  console.log(`📁 使用静态资源目录: ${staticDir}`);
  console.log(`📄 静态文件详情:`);
  try {
    const files = fs.readdirSync(staticDir);
    files.slice(0, 10).forEach(file => {
      console.log(`   - ${file}`);
    });
    if (files.length > 10) {
      console.log(`   ... 以及其他 ${files.length - 10} 个文件`);
    }
  } catch (err) {
    console.log(`   无法读取目录内容: ${err.message}`);
  }
  
  app.use(express.static(staticDir));
}

// 请求ID & 日志中间件 (简化)
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

// 尝试从运行时环境读取版本（备用方案）
try {
  // 尝试从当前目录读取
  const localPkgPath = path.join(process.cwd(), 'package.json');
  if (fs.existsSync(localPkgPath)) {
    const pkgContent = fs.readFileSync(localPkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    if (pkg.version && pkg.version.trim() && pkg.version !== 'dev') {
      VERSION = pkg.version;
      console.log(`✅ 版本信息已从运行时目录读取: ${VERSION}`);
    }
  }
} catch (error) {
  console.log(`⚠️ 运行时版本读取失败，使用硬编码版本: ${VERSION}`);
}

console.log(`📋 最终版本信息: ${VERSION}`);

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
  
  // 智能判断环境类型
  const env = process.env.NODE_ENV ||
              (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME ? 'production' : 'development');
  
  // 使用换行符确保正确的格式显示
  const statusMessage = `✅ Bili-Calendar Service is running here

服务状态:
- 运行时间: ${uptimeFormatted}
- 内存使用: ${mem} MB
- 环境: ${env}
- 端口: ${process.env.PORT || 'N/A (Serverless)'}`;
  
  // 设置正确的响应头以确保换行符被正确处理
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  res.send(statusMessage);
});

// 根路径返回前端页面
app.get('/', (req, res) => {
  const indexCandidates = staticDir
    ? [path.join(staticDir, 'index.html')]
    : [];
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
