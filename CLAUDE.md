# Bili-Calendar 项目指导文件

> **最后更新**: 2026-05-03
> **版本**: v1.1.8
> **项目类型**: Node.js Web 应用 (Express + Vite + Vanilla JS)

---

## 变更记录 (Changelog)

### 2026-05-03
- **[文档审查]** 完成全量 CLAUDE.md 一致性审查与修复
- **[文档重写]** 重写 `docs/frontend.md`、`test/CLAUDE.md`、`utils/CLAUDE.md` 三个模块文档
- **[计数修正]** 修正测试文件数：26 -> 25（移除非测试文件误计）
- **[计数修正]** 修正前端服务模块数：16 -> 12（与实际 src/services/ 文件数对齐）
- **[索引更新]** 更新 `.claude/index.json` 扫描时间戳至 2026-05-03
- **[一致性验证]** 确认根文档与所有模块文档的交叉引用、模块列表、覆盖率数据一致

### 2026-04-28
- **[架构扫描]** 完成全仓重新扫描，验证模块完整性与文件结构
- **[文档同步]** 更新技术栈文档与模块索引
- **[测试覆盖]** 确认 25 个测试文件覆盖前端服务和后端工具层
- **[模块映射]** 验证 13 个后端工具模块、12 个前端服务模块、1 个组件模块
- **[覆盖率报告]** 整体覆盖率 88%，识别出 2 个主要缺口

### 2026-01-04
- **[运行时升级]** Node.js 版本要求从 >=18.0.0 升级到 **>=22.0.0**
- **[架构扫描]** 重新扫描项目结构，验证模块完整性
- **[文档同步]** 更新技术栈文档，反映最新的 Node.js 版本要求
- **[测试覆盖]** 确认 25 个测试文件覆盖前端服务和后端工具层
- **[模块映射]** 验证 13 个后端工具模块、12 个前端服务模块
- **[深度补扫]** 完成 netlify/functions、scripts、src/components 详细扫描
- **[覆盖率提升]** 整体覆盖率从 78% 提升至 **88%**

### 2025-12-12
- **[架构扫描]** 完成项目全仓扫描，生成 `.claude/index.json` 项目索引
- **[覆盖率报告]** 整体覆盖率 78%，识别出 4 个主要缺口
- **[模块映射]** 识别出 9 个主要模块，89 个源文件
- **[依赖分析]** 完成模块依赖关系梳理
- **[测试状态]** 确认 85% 测试覆盖率，待补充 Mock 测试

### 2025-12-01
- **[架构重构]** 从传统静态文件迁移到 Vite 构建系统
- **[前端工程化]** 引入 ES Module、SCSS、组件化开发
- **[构建优化]** 添加 Vite 7.x 构建工具，支持热重载和代码分割
- **[部署修复]** 更新 Dockerfile 和 netlify.toml 配置
- **[文档更新]** 同步更新项目架构文档，反映新的目录结构
- **[监控 & 推送]** 新增 Prometheus `/metrics/prometheus`，提醒支持自定义提前时间与实验 WebPush（需 VAPID）

### 2025-11-30
- **[架构师初始化]** 自动生成项目索引与模块结构图
- **[文档增强]** 添加 Mermaid 模块可视化图表
- **[元数据]** 生成 `.claude/index.json` 项目索引文件
- **[导航优化]** 为各模块文档添加面包屑导航

### 2025-11-23
- 重构项目文档结构，统一命名规范
- 移除 Mermaid 图表和 emoji 装饰
- 更新代码规范、日志规范、异常处理指南

---

## 项目概览

**Bili-Calendar** 是一个将 B站追番列表转换为日历订阅的 Web 服务，支持 iCal/ICS 格式，兼容 Apple/Google/Outlook 等主流日历应用。

### 核心功能

- 自动同步 B站追番列表到日历应用
- 精确解析番剧更新时间，支持时区转换
- 智能处理连载/完结番剧的重复规则
- 隐私保护：服务端不存储用户数据
- 外部ICS聚合：合并最多 5 个外部日历源

---

## 项目架构

```
+---------------------------------------------------------------------+
|                    客户端 (Vite 开发/构建)                              |
|  +----------+  +----------+  +----------+  +----------+            |
|  | main.js  |  | i18n.js  |  | cache    |  | error    |            |
|  | (入口)    |  | (多语言) |  | Manager  |  | Handler  |            |
|  +----+-----+  +----------+  +----------+  +----------+            |
|       | Vite Build -> dist/                                         |
+-------+-------------------------------------------------------------+
        | HTTP Request
        v
+---------------------------------------------------------------------+
|                      服务器 (server.js)                               |
|  +------------------------------------------------------------+     |
|  | Express 中间件: compression -> security -> rate-limit       |     |
|  +------------------------------------------------------------+     |
|          |                                                          |
|          v                                                          |
|  +--------------+    +--------------+    +--------------+           |
|  | /api/:uid    |    | /preview/:uid|    | 静态文件服务  |           |
|  | (ICS生成)    |    | (番剧预览)   |    | (dist/)      |           |
|  +------+-------+    +--------------+    +--------------+           |
+---------+-----------------------------------------------------------+
          |
          v
+---------------------------------------------------------------------+
|                       工具层 (utils/)                                 |
|  +------------+  +---------+  +-------------+  +------------+       |
|  | bangumi.cjs|  | ics.cjs |  |rate-limiter |  |request-dedup|      |
|  | (B站API)   |  |(ICS生成)|  |  (限流)      |  |  (去重)     |      |
|  +------------+  +---------+  +-------------+  +------------+       |
+---------------------------------------------------------------------+
```

---

## 模块结构图

```mermaid
graph TD
    Root["(根) Bili-Calendar"] --> Server["server.js<br/>Express服务器"]
    Root --> Src["src/<br/>前端源代码"]
    Root --> Public["public/<br/>静态资源"]
    Root --> Utils["utils/<br/>后端工具层<br/>(CommonJS)"]
    Root --> UtilsES["utils-es/<br/>后端工具层<br/>(ES Module)"]
    Root --> Test["test/<br/>测试套件"]
    Root --> Netlify["netlify/<br/>Serverless部署"]
    Root --> Scripts["scripts/<br/>构建脚本"]
    Root --> Claude[".claude/<br/>AI索引"]

    Src --> SrcMain["main.js<br/>入口"]
    Src --> SrcComponents["components/<br/>AnimePreview"]
    Src --> SrcServices["services/<br/>12个服务模块"]
    Src --> SrcStyles["styles/<br/>SCSS样式"]
    Src --> SrcUtils["utils/<br/>工具函数"]

    Utils --> Bangumi["bangumi.cjs<br/>B站API"]
    Utils --> Ics["ics.cjs<br/>ICS生成"]
    Utils --> RateLimiter["rate-limiter.cjs<br/>限流"]
    Utils --> RequestDedup["request-dedup.cjs<br/>去重"]

    Test --> TestFiles["25个测试文件"]

    UtilsCLAUDE["CLAUDE.md"] -.-> Utils
    TestCLAUDE["CLAUDE.md"] -.-> Test

    click Utils "./utils/CLAUDE.md" "查看工具层文档"
    click Test "./test/CLAUDE.md" "查看测试文档"
```

---

## 项目技术栈

| 层级 | 技术 | 版本要求 |
|------|------|----------|
| **运行时** | Node.js | **>= 22.0.0** |
| **后端框架** | Express.js | ^5.2.1 |
| **HTTP 客户端** | Axios | ^1.15.0 |
| **前端框架** | Vanilla JavaScript | ES2022+ |
| **构建工具** | Vite | ^7.3.2 |
| **样式预处理** | SCSS/Sass | ^1.97.1 |
| **部署** | Docker / Netlify Functions | - |
| **测试** | Node.js 内置测试框架 | - |
| **代码检查** | ESLint + Prettier | ESLint 9.x |

---

## 项目模块划分

### 文件与文件夹布局

```
Bili-Calendar/
├── server.js                    # [入口] Express 主服务器
├── package.json                 # 项目配置与依赖
├── vite.config.js               # Vite 构建配置
├── index.html                   # 前端入口 HTML
│
├── src/                         # [前端] 源代码目录
│   ├── main.js                  # 前端入口文件
│   ├── components/              # 组件目录
│   │   └── AnimePreview.js      # 番剧预览组件 (889行)
│   ├── services/                # 服务模块
│   │   ├── i18n.js              # 国际化支持
│   │   ├── cacheManager.js      # 缓存管理
│   │   ├── errorHandler.js      # 错误处理
│   │   ├── pwa.js               # PWA 初始化
│   │   ├── push.js              # 推送服务
│   │   ├── notifier.js          # 通知管理
│   │   ├── animationService.js  # 动画服务
│   │   ├── clipboardService.js  # 剪贴板服务
│   │   ├── loadingService.js    # 加载状态
│   │   ├── progressService.js   # 进度条
│   │   ├── themeService.js      # 主题切换
│   │   └── toastService.js      # 提示消息
│   ├── styles/                  # 样式目录 (SCSS)
│   │   ├── app.scss             # 主样式入口
│   │   ├── main.scss            # 样式入口（备用）
│   │   ├── _modules.scss        # 模块化样式
│   │   ├── _preview.scss        # 预览样式
│   │   ├── _loading.scss        # 加载动画
│   │   ├── _error.scss          # 错误样式
│   │   ├── _dark.scss           # 暗黑模式
│   │   └── _history.scss        # 历史记录样式
│   └── utils/                   # 前端工具函数
│       ├── deviceDetector.js    # 设备检测
│       └── stringUtils.js       # 字符串工具
│
├── dist/                        # [构建产物] Vite 打包输出 (不提交到 Git)
│
├── public/                      # [静态资源] 直接复制到 dist/
│   ├── favicon.ico              # 网站图标
│   ├── manifest.webmanifest     # PWA 清单
│   ├── sw.js                    # Service Worker
│   ├── icons/                   # 应用图标
│   └── admin/                   # 管理后台
│       └── metrics.js           # 性能指标查看器
│
├── utils/                       # [后端] 工具模块 (CommonJS)
│   ├── bangumi.cjs              # B站番剧数据获取
│   ├── ics.cjs                  # ICS 日历文件生成
│   ├── ics-merge.cjs            # 外部ICS聚合
│   ├── rate-limiter.cjs         # 请求速率限制
│   ├── request-dedup.cjs        # 请求去重
│   ├── time.cjs                 # 时间处理工具
│   ├── http.cjs                 # HTTP 请求工具
│   ├── constants.cjs            # 常量定义
│   ├── ip.cjs                   # IP 提取工具
│   ├── security.cjs             # 安全校验
│   ├── validation.cjs           # 参数验证
│   ├── metrics.cjs              # 性能指标
│   ├── push-store.cjs           # WebPush存储
│   └── CLAUDE.md                # 工具模块文档
│
├── utils-es/                    # [后端] ES Module 版本 (Netlify)
│
├── netlify/                     # [部署] Netlify Functions
│   ├── functions/               # Serverless 函数源码
│   │   └── server.js            # API 函数入口 (612行)
│   └── functions-build/         # 构建产物
│
├── test/                        # [测试] 单元测试
│   ├── utils.*.test.js          # 工具层测试
│   ├── services.*.test.js       # 服务层测试
│   ├── ics-merge.test.js        # ICS聚合测试
│   ├── metrics.test.js          # 指标测试
│   └── CLAUDE.md                # 测试模块文档
│
├── scripts/                     # [构建] 构建脚本
│   ├── build-netlify.mjs        # Netlify构建
│   ├── update-readme-year.js    # README年份更新
│   ├── check-dist.js            # 构建产物检查
│   └── generate-vapid.js        # VAPID密钥生成
│
├── docs/                        # [文档] 模块文档
│   └── frontend.md              # 前端模块文档
│
└── .claude/                     # [元数据] AI上下文索引
    └── index.json               # 项目索引文件
```

---

## 模块索引

| 模块名称 | 路径 | 职责描述 | 覆盖率 | 文档链接 |
|---------|------|---------|--------|---------|
| **服务器入口** | `server.js` | Express服务器、路由、中间件、API端点 | 95% | - |
| **前端源代码** | `src/` | 用户界面、交互逻辑、组件、样式（Vite构建） | 90% | [查看文档](./docs/frontend.md) |
| **静态资源** | `public/` | 图标、PWA清单、Service Worker、管理后台 | 0% | - |
| **后端工具层 (CommonJS)** | `utils/` | B站API、ICS生成、限流、去重、时间处理 | 85% | [查看文档](./utils/CLAUDE.md) |
| **后端工具层 (ES Module)** | `utils-es/` | Netlify Serverless环境专用 | 75% | - |
| **测试套件** | `test/` | 单元测试、集成测试 | 90% | [查看文档](./test/CLAUDE.md) |
| **Serverless 部署** | `netlify/` | Netlify Functions配置与构建产物 | 85% | - |
| **构建脚本** | `scripts/` | Netlify构建、README更新、VAPID生成 | 80% | - |
| **Vite 配置** | `vite.config.js` | 前端构建与开发服务器配置 | 100% | - |

---

## 项目业务模块

### 核心业务流程

1. **订阅生成流程**
   - 用户输入 B站 UID
   - 调用 `/api/bangumi/:uid` 预检频控
   - 后端从 B站 API 获取追番数据
   - 过滤正在播出的番剧
   - 生成 ICS 日历文件
   - 返回日历文件或订阅链接

2. **番剧预览流程**
   - 用户点击预览按钮
   - 调用 `/api/bangumi/:uid` 获取数据
   - 前端渲染预览弹窗
   - 显示番剧卡片、更新状态、提醒设置

3. **外部ICS聚合流程**
   - 用户启用聚合功能
   - 输入最多 5 个外部 ICS 链接
   - 调用 `/aggregate/:uid.ics?sources=...`
   - 后端并发拉取外部源
   - 合并番剧事件与外部事件
   - 返回聚合后的 ICS 文件

### 关键模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| **B站 API** | `utils/bangumi.cjs` | 获取用户追番列表，过滤连载番剧 |
| **ICS 生成** | `utils/ics.cjs` | 将番剧数据转换为 ICS 格式 |
| **ICS 聚合** | `utils/ics-merge.cjs` | 拉取并合并外部 ICS 源 |
| **限流器** | `utils/rate-limiter.cjs` | 基于 IP 的请求速率限制 |
| **去重器** | `utils/request-dedup.cjs` | 防止相同请求并发执行 |
| **时间处理** | `utils/time.cjs` | 解析播出时间，计算下次更新 |
| **性能指标** | `utils/metrics.cjs` | 收集性能数据，Prometheus导出 |

---

## 项目代码风格与规范

### 命名约定

| 类型 | 约定 | 示例 |
|------|------|------|
| **变量** | camelCase | `rateLimiter`, `bangumiData` |
| **函数** | camelCase | `getBangumiData()`, `generateICS()` |
| **常量** | SCREAMING_SNAKE_CASE | `BILIBILI_API_BASE_URL`, `CACHE_TTL` |
| **类** | PascalCase | `RateLimiter`, `CacheManager` |
| **文件 (后端)** | kebab-case + .cjs | `rate-limiter.cjs`, `request-dedup.cjs` |
| **文件 (前端)** | kebab-case + .js | `cache-manager.js`, `error-handler.js` |
| **CSS 类** | kebab-case | `.error-container`, `.anime-card` |
| **HTML ID** | kebab-case | `uid-input`, `generate-btn` |

### 代码风格

项目使用 **ESLint + Prettier** 进行代码规范检查：

```json
// .prettierrc.json
{
  "printWidth": 100,
  "singleQuote": true,
  "semi": true,
  "trailingComma": "es5"
}
```

#### Import 规则

**后端 (utils/*.cjs) - CommonJS**:
```javascript
// 1. Node.js 内置模块
const { createRequire } = require('module');
const path = require('path');

// 2. 第三方依赖
const axios = require('axios');

// 3. 本地模块
const { httpClient } = require('./http.cjs');
const { parseBroadcastTime } = require('./time.cjs');
```

**前端 (src/*.js) - ES Module**:
```javascript
// ES Module 导入
import './styles/app.scss';
import i18n from './services/i18n';
import { errorHandler } from './services/errorHandler';
```

**服务器入口 (server.js) - ES Module + CommonJS 混合**:
```javascript
// ES Module 导入
import express from 'express';
import compression from 'compression';

// CommonJS 桥接（用于 .cjs 模块）
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getBangumiData } = require('./utils/bangumi.cjs');
```

#### 日志规范

项目使用 **console + emoji** 进行日志记录：

```javascript
// 信息日志
console.log(`📥 ${req.method} ${req.originalUrl} - IP: ${ip}`);

// 成功日志
console.log(`✅ ${req.method} ${req.originalUrl} - ${statusCode} - ${duration}ms`);

// 警告日志
console.warn(`⚠️ B站API返回业务错误: code=${code}, message=${message}`);

// 错误日志
console.error(`❌ 请求失败: ${error.message}`);

// 统计日志
console.log(`📊 [UID:${uid}] 总共 ${total} 部番剧，过滤后 ${filtered} 部`);
```

**日志级别规范**:
| 级别 | 方法 | 用途 | Emoji |
|------|------|------|-------|
| INFO | `console.log` | 正常流程、统计信息 | 📥 ✅ 📊 🔍 |
| WARN | `console.warn` | 业务警告、非致命错误 | ⚠️ |
| ERROR | `console.error` | 系统错误、异常 | ❌ |

#### 异常处理

**后端异常处理模式**:
```javascript
async function getBangumiData(uid) {
  try {
    const response = await httpClient.get(url);

    // 业务错误处理
    if (response.data.code !== 0) {
      return {
        error: 'API Error',
        message: response.data.message,
        code: response.data.code
      };
    }

    return response.data;
  } catch (error) {
    // 网络/系统错误
    console.error(`❌ 获取番剧数据失败: ${error.message}`);
    return null;
  }
}
```

**前端异常处理模式**:
```javascript
async function generateSubscription(uid) {
  try {
    const response = await fetch(`/api/${uid}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    showError(identifyError(error));
    return null;
  }
}
```

#### 参数校验

**UID 校验**:
```javascript
// 纯数字，长度 1-20
function validateUID(uid) {
  const trimmed = String(uid).trim();
  if (!/^\d{1,20}$/.test(trimmed)) {
    return { valid: false, error: 'UID必须是1-20位纯数字' };
  }
  return { valid: true, sanitized: trimmed };
}
```

#### 其他规范

1. **注释语言**: 中文注释（与代码库保持一致）
2. **注释风格**: JSDoc 风格
3. **缩进**: 2 空格
4. **行尾**: LF (Unix)
5. **文件编码**: UTF-8

---

## 测试与质量

### 单元测试

**测试框架**: Node.js 内置测试框架 (`node:test`)

**测试文件命名**: `{模块名}.test.js`

**测试示例**:
```javascript
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('utils/ics.cjs', () => {
  it('generateICS: basic calendar structure', () => {
    const sample = [{ title: '测试番', season_id: 123 }];
    const ics = generateICS(sample, '614500');

    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /END:VCALENDAR/);
  });
});
```

### 测试覆盖范围

| 模块 | 覆盖率 | 文件 | 状态 |
|------|--------|------|------|
| `ics.cjs` | 85% | `utils.ics.test.js` | ✅ 已测试 |
| `time.cjs` | 90% | `utils.time.test.js` | ✅ 已测试 |
| `rate-limiter.cjs` | 95% | `utils.rate-limiter.test.js` | ✅ 已测试 |
| `request-dedup.cjs` | 95% | `utils.request-dedup.test.js` | ✅ 已测试 |
| `ics-merge.cjs` | 80% | `ics-merge.test.js` | ✅ 已测试 |
| `metrics.cjs` | 85% | `metrics.test.js` | ✅ 已测试 |
| `validation.cjs` | 90% | `utils.validation.test.js` | ✅ 已测试 |
| `security.cjs` | 90% | `utils.security.test.js` | ✅ 已测试 |
| `ip.cjs` | 90% | `utils.ip-validation.test.js` | ✅ 已测试 |
| `bangumi.cjs` | 60% | - | ⚠️ 需要 Mock |
| `http.cjs` | 50% | - | ⚠️ 需要集成测试 |
| **前端服务** | 100% | `services.*.test.js` | ✅ 已覆盖 |

### 待补充测试

- [ ] `bangumi.cjs` - B站 API 调用 (需要 Mock)
- [ ] `http.cjs` - HTTP 客户端 (需要集成测试)
- [ ] `netlify/functions/` - Serverless 函数测试
- [ ] `scripts/` - 构建脚本测试
- [ ] **E2E 测试** - 主要用户流程

---

## 项目构建、测试与运行

### 环境与配置

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `PORT` | 服务器端口 | `3000` |
| `NODE_ENV` | 运行环境 (`development` / `production`) | `development` |
| `TRUST_PROXY` | 代理信任设置 | `undefined` |
| `VAPID_PUBLIC_KEY` | WebPush 公钥 | - |
| `VAPID_PRIVATE_KEY` | WebPush 私钥 | - |
| `VAPID_SUBJECT` | WebPush 联系邮箱 | `mailto:admin@example.com` |
| `PUSH_ADMIN_TOKEN` | 推送管理令牌 | - |
| `BILIBILI_COOKIE` | B站 Cookie (提高API成功率) | 空 |
| `API_RATE_LIMIT` | API调用速率限制 | `3` |
| `API_RATE_WINDOW` | 速率限制时间窗口 (ms) | `3600000` |
| `HTTP_TIMEOUT_MS` | HTTP请求超时 (ms) | `10000` |
| `HTTP_RETRY_MAX` | HTTP最大重试次数 | `2` |

### 常用命令

```bash
# 安装依赖
npm install

# 开发模式 (热重载)
npm run dev

# 生产模式
npm start

# 运行测试
npm test

# 代码检查
npm run lint

# 代码格式化
npm run format:write

# 构建 Netlify Functions
npm run build

# 类型检查
npm run type-check

# 生成 VAPID 密钥
node scripts/generate-vapid.js
```

### Docker 部署

```bash
# 构建镜像
docker build -t bili-calendar .

# 运行容器
docker run -p 3000:3000 bili-calendar

# Docker Compose
docker-compose up -d
```

---

## API 接口

### 获取用户追番日历

```
GET /:uid
```

参数：
- `uid`: B站用户 UID

返回：ICS 格式的日历文件

### 获取用户追番数据（JSON）

```
GET /api/bangumi/:uid
```

参数：
- `uid`: B站用户 UID

返回：B站追番列表的 JSON 数据

### 聚合订阅

```
GET /aggregate/:uid.ics?sources=<url1>,<url2>
```

参数：
- `uid`：B站用户 UID
- `sources`：可选，额外外部 ICS 链接，需 URL 编码
  - 最多 5 个外部源，超出会返回 `400`

返回：合并 B站追番与外部 ICS 的日历文件

### 健康检查

```
GET /status
```

返回：服务状态信息

### 性能指标

```
GET /metrics          # JSON 格式
GET /metrics/prometheus  # Prometheus 文本格式
```

---

## Git 工作流程

### 分支策略

| 分支 | 用途 |
|------|------|
| `main` | 主分支，稳定版本 |
| `feature/*` | 功能开发分支 |
| `fix/*` | Bug 修复分支 |
| `docs/*` | 文档更新分支 |

### 提交规范

遵循 **Conventional Commits** 规范：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**类型 (type)**:
| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档更新 |
| `style` | 代码格式 (不影响逻辑) |
| `refactor` | 重构 |
| `test` | 测试相关 |
| `chore` | 构建/工具链 |

---

## 覆盖率报告

### 整体统计

- **总文件数**: ~180
- **已扫描文件**: 110
- **忽略文件**: ~70 (node_modules, dist, .git 等)
- **整体覆盖率**: 88%

### 模块覆盖率

| 模块 | 文件数 | 覆盖率 | 缺口 |
|------|--------|--------|------|
| `server.js` | 1 | 95% | - |
| `src/` | 20 | 90% | - |
| `utils/` | 14 | 85% | bangumi.cjs, http.cjs |
| `utils-es/` | 7 | 75% | 同 utils/ |
| `test/` | 25 | 90% | - |
| `netlify/` | 1 | 85% | 缺少测试 |
| `scripts/` | 4 | 80% | 缺少测试 |
| `public/` | 8 | 0% | 静态资源 |
| `dist/` | - | N/A | 构建产物 |

### 主要缺口

1. **utils/bangumi.cjs** - 需要 Mock B站 API 进行测试
2. **utils/http.cjs** - 需要集成测试验证 HTTP 封装

### 下一步建议

**优先补扫**:
1. 补充 `bangumi.cjs` 的 Mock 测试
2. 补充 `http.cjs` 的集成测试

**长期规划**:
1. 添加 E2E 测试覆盖主要用户流程
2. 补充 `netlify/functions/` Serverless 函数测试
3. 补充 `scripts/` 构建脚本测试

---

## 文档目录

### 文档存储规范

```
项目根目录/
├── CLAUDE.md                    # [根] 项目指导文件（本文件）
├── README.md                    # 中文用户文档
├── README.en.md                 # 英文用户文档
│
├── docs/
│   └── frontend.md              # 前端模块文档
│
├── utils/
│   └── CLAUDE.md                # 工具模块文档
│
├── test/
│   └── CLAUDE.md                # 测试模块文档
│
└── .claude/
    └── index.json               # AI上下文索引
```

### 文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| **项目指导** | `/CLAUDE.md` | 项目整体架构与规范（本文件） |
| **前端模块** | `/docs/frontend.md` | 前端源代码详细文档 |
| **工具模块** | `/utils/CLAUDE.md` | 后端工具层详细文档 |
| **测试模块** | `/test/CLAUDE.md` | 测试套件详细文档 |
| **项目索引** | `/.claude/index.json` | AI上下文元数据 |
| **用户文档** | `/README.md` | 面向用户的使用说明 |

---

## 相关链接

- **在线服务**: https://calendar.cosr.eu.org
- **GitHub 仓库**: https://github.com/Silentely/Bili-Calendar
- **Docker 镜像**: ghcr.io/silentely/bili-calendar
- **问题反馈**: https://github.com/Silentely/Bili-Calendar/issues

---

## 许可证

MIT License - 详见 [LICENSE](./LICENSE)
