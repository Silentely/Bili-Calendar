# Bili-Calendar 项目文档

> **最后更新**: 2025-11-22 15:49:27 UTC
> **版本**: v1.1.7
> **项目类型**: Node.js Web 应用 (Express + Vanilla JS)

---

## 📋 项目概览

**Bili-Calendar** 是一个将 B站追番列表转换为日历订阅的 Web 服务，支持 iCal/ICS 格式，兼容 Apple/Google/Outlook 等主流日历应用。

### 核心价值

- 📅 自动同步 B站追番列表到日历应用
- 🕒 精确解析番剧更新时间，支持时区转换
- 🔁 智能处理连载/完结番剧的重复规则
- 🔒 隐私保护：服务端不存储用户数据
- 🚀 简单易用：仅需 B站 UID 即可生成订阅

### 技术栈

- **后端**: Node.js 18+ / Express.js
- **前端**: Vanilla JavaScript (无框架)
- **部署**: Netlify Functions / Docker / 自托管
- **测试**: Node.js 内置测试框架

---

## 🏗️ 项目架构

```mermaid
graph TB
    subgraph "前端层 (public/)"
        A[index.html] --> B[app.js]
        B --> C[i18n.js 多语言]
        B --> D[cache-manager.js 缓存]
        B --> E[error-handler.js 错误处理]
        B --> F[anime-preview.js 番剧预览]
        G[sw.js Service Worker] --> H[PWA 离线支持]
    end

    subgraph "服务层 (server.js)"
        I[Express 服务器] --> J[路由处理]
        J --> K[/api/:uid ICS生成]
        J --> L[/preview/:uid 预览API]
        J --> M[静态文件服务]
    end

    subgraph "工具层 (utils/)"
        N[bangumi.cjs] --> O[B站API调用]
        P[ics.cjs] --> Q[ICS文件生成]
        R[rate-limiter.cjs] --> S[请求限流]
        T[request-dedup.cjs] --> U[请求去重]
        V[time.cjs] --> W[时间处理]
        X[http.cjs] --> Y[HTTP工具]
    end

    subgraph "Serverless (netlify/)"
        Z[functions/api.mjs] --> AA[Netlify Functions]
        AB[functions-build/] --> AC[构建产物]
    end

    B --> I
    K --> N
    K --> P
    I --> R
    I --> T
    N --> X
    P --> V
    Z --> I

    style A fill:#e1f5ff
    style I fill:#fff3e0
    style N fill:#f3e5f5
    style Z fill:#e8f5e9
```

---

## 📁 目录结构

```
Bili-Calendar/
├── 📄 server.js                 # Express 主服务器
├── 📄 package.json              # 项目配置与依赖
├── 📄 README.md                 # 中文文档
├── 📄 README.en.md              # 英文文档
├── 📄 Dockerfile                # Docker 镜像构建
├── 📄 docker-compose.yml        # Docker Compose 配置
├── 📄 netlify.toml              # Netlify 部署配置
├── 📄 eslint.config.js          # ESLint 配置
├── 📄 .prettierrc.json          # Prettier 配置
│
├── 📂 public/                   # 前端静态资源
│   ├── index.html               # 主页面
│   ├── app.js                   # 主应用逻辑
│   ├── i18n.js                  # 国际化支持
│   ├── cache-manager.js         # 缓存管理
│   ├── error-handler.js         # 错误处理
│   ├── anime-preview.js         # 番剧预览
│   ├── sw.js                    # Service Worker
│   ├── pwa-init.js              # PWA 初始化
│   ├── styles.css               # 主样式
│   ├── styles-dark.css          # 暗黑模式样式
│   ├── manifest.webmanifest     # PWA 清单
│   └── icons/                   # 应用图标
│
├── 📂 utils/                    # 后端工具模块 (CommonJS)
│   ├── bangumi.cjs              # B站番剧数据获取
│   ├── ics.cjs                  # ICS 日历文件生成
│   ├── rate-limiter.cjs         # 请求速率限制
│   ├── request-dedup.cjs        # 请求去重
│   ├── time.cjs                 # 时间处理工具
│   ├── http.cjs                 # HTTP 请求工具
│   ├── constants.cjs            # 常量定义
│   └── ip.cjs                   # IP 提取工具
│
├── 📂 utils-es/                 # ES Module 版本工具 (Netlify)
│   ├── bangumi.js
│   ├── ics.js
│   ├── time.js
│   └── ...
│
├── 📂 netlify/                  # Netlify 部署相关
│   ├── functions/               # Serverless 函数源码
│   │   └── api.mjs              # API 函数入口
│   └── functions-build/         # 构建后的函数
│
├── 📂 test/                     # 测试文件
│   ├── utils.ics.test.js
│   ├── utils.time.test.js
│   ├── utils.rate-limiter.test.js
│   └── utils.request-dedup.test.js
│
├── 📂 scripts/                  # 构建脚本
│   ├── build-netlify.mjs        # Netlify 构建脚本
│   └── update-readme-year.js    # README 年份更新
│
└── 📂 assets/                   # 文档资源
    ├── light-mode.jpg
    ├── dark-mode.jpg
    └── ...
```

---

## 🔑 核心模块索引

### 1. 服务层 (`server.js`)
- **职责**: Express 服务器主入口
- **关键功能**:
  - 路由定义 (`/api/:uid`, `/preview/:uid`)
  - 静态文件服务
  - 请求限流与去重
  - 响应压缩 (gzip/brotli)
  - 安全响应头配置
- **依赖**: `utils/bangumi.cjs`, `utils/ics.cjs`, `utils/rate-limiter.cjs`
- **详细文档**: [server/CLAUDE.md](./server/CLAUDE.md) *(待生成)*

### 2. 前端应用 (`public/`)
- **职责**: 用户界面与交互逻辑
- **关键功能**:
  - UID 输入与验证
  - 订阅链接生成
  - 番剧预览
  - 历史记录管理
  - 多语言切换
  - PWA 支持
  - 暗黑模式
- **详细文档**: [public/CLAUDE.md](./public/CLAUDE.md)

### 3. 工具模块 (`utils/`)
- **职责**: 后端核心业务逻辑
- **关键模块**:
  - `bangumi.cjs`: B站 API 调用与数据解析
  - `ics.cjs`: ICS 日历文件生成
  - `rate-limiter.cjs`: 基于 IP 的请求限流
  - `request-dedup.cjs`: 相同请求去重
  - `time.cjs`: 时间解析与格式化
  - `http.cjs`: HTTP 请求封装
- **详细文档**: [utils/CLAUDE.md](./utils/CLAUDE.md)

### 4. Serverless 函数 (`netlify/`)
- **职责**: Netlify Functions 部署
- **关键功能**:
  - 将 Express 应用包装为 Serverless 函数
  - 自动构建与部署
- **详细文档**: [netlify/CLAUDE.md](./netlify/CLAUDE.md) *(待生成)*

### 5. 测试套件 (`test/`)
- **职责**: 单元测试与集成测试
- **覆盖范围**:
  - ICS 生成逻辑
  - 时间处理函数
  - 请求限流器
  - 请求去重器
- **详细文档**: [test/CLAUDE.md](./test/CLAUDE.md) *(待生成)*

---

## 🚀 快速开始

### 本地开发

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
```

### Docker 部署

```bash
# 构建镜像
docker build -t bili-calendar .

# 运行容器
docker run -p 3000:3000 bili-calendar

# 使用 Docker Compose
docker-compose up -d
```

### Netlify 部署

```bash
# 构建 Netlify Functions
npm run build

# 部署到 Netlify
# (通过 Git 推送自动触发)
```

---

## 🔧 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务器端口 | `3000` |
| `NODE_ENV` | 运行环境 | `development` |

### 安全配置

- **CSP (Content Security Policy)**: 基线策略，同源为主
- **CORS**: 允许所有来源 (`Access-Control-Allow-Origin: *`)
- **HSTS**: 强制 HTTPS (生产环境)
- **X-Frame-Options**: 防止点击劫持
- **X-Content-Type-Options**: 防止 MIME 类型嗅探

### 限流配置

- **窗口时间**: 15 分钟
- **最大请求数**: 100 次/IP
- **清理间隔**: 每小时

---

## 📊 项目统计

- **总文件数**: 98
- **代码行数**: ~15,000 行 (估算)
- **模块数量**: 4 个主要模块
- **测试覆盖**: 核心工具函数已覆盖
- **支持语言**: 中文、英文

---

## 🛠️ 开发规范

### 代码风格

- **JavaScript**: ESLint + Prettier
- **模块系统**: CommonJS (后端) / ES Module (前端)
- **命名规范**: camelCase (变量/函数), PascalCase (类)
- **注释**: JSDoc 风格

### Git 工作流

- **主分支**: `main`
- **提交规范**: Conventional Commits
- **版本管理**: Semantic Versioning

### 测试策略

- **单元测试**: Node.js 内置测试框架
- **测试命令**: `npm test`
- **覆盖目标**: 核心业务逻辑 > 80%

---

## 🔗 相关链接

- **在线服务**: https://calendar.cosr.eu.org
- **GitHub 仓库**: https://github.com/Silentely/Bili-Calendar
- **Docker 镜像**: ghcr.io/silentely/bili-calendar
- **问题反馈**: https://github.com/Silentely/Bili-Calendar/issues

---

## 📝 更新日志

### v1.1.7 (最新)
- 🌙 新增暗黑模式
- 👁️ 新增番剧预览功能
- 💾 新增本地缓存
- 📝 新增历史记录
- 🌍 新增多语言支持
- 📱 新增 PWA 支持
- 🔐 增强安全配置

---

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE)

---

## 🙏 致谢

感谢所有贡献者和使用者的支持！

---

**注意**: 本文档由 AI 辅助生成，旨在为开发者提供项目全局视图。各模块的详细文档请参考对应的 `CLAUDE.md` 文件。
