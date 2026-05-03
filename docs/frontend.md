# 前端模块文档

> **导航**: [根目录](../CLAUDE.md) > **src (前端源代码)**

---

## 变更记录 (Changelog)

### 2026-05-03
- **[全面重写]** 基于 Vite 迁移后的实际目录结构完全重写文档
- **[结构对齐]** 文件结构、代码示例、导入方式均对齐 `src/` 目录
- **[链接修复]** 修复失效的面包屑导航链接

### 2025-11-30
- **[导航增强]** 添加面包屑导航，便于模块间跳转
- **[索引更新]** 更新模块索引，与根文档保持一致

### 2025-11-22
- 初始文档创建，详细记录前端架构与功能实现

---

## 模块概览

**前端源代码** 模块是 Bili-Calendar 的客户端层，负责用户界面展示、交互逻辑、PWA 支持和多语言国际化。采用 Vanilla JavaScript + ES Module 实现，通过 Vite 构建，无框架依赖。

### 核心职责

- 用户界面渲染与交互
- 多语言支持 (中文/英文)
- 本地缓存与历史记录管理
- PWA 支持与离线访问
- 暗黑模式切换
- 番剧预览功能
- 错误处理与用户引导
- 推送通知与提醒

### 构建方式

前端代码位于 `src/` 目录，通过 Vite 构建后输出到 `dist/`。`index.html` 位于项目根目录，作为 Vite 的入口文件，直接引用 `src/main.js`：

```html
<script type="module" src="/src/main.js"></script>
```

Vite 开发服务器通过 `vite.config.js` 配置代理，将 `/api` 请求转发到后端：

```javascript
// vite.config.js
export default defineConfig({
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/status': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    manifest: true,
  },
});
```

---

## 文件结构

```
src/
├── main.js                    # 前端入口文件 (导入所有模块并初始化)
│
├── components/                # 组件目录
│   └── AnimePreview.js        # 番剧预览组件 (模态框、搜索筛选、卡片渲染)
│
├── services/                  # 服务模块
│   ├── i18n.js                # 国际化支持 (中英文切换、参数化翻译)
│   ├── cacheManager.js        # 缓存管理 (LocalStorage、历史记录、自动建议)
│   ├── errorHandler.js        # 错误处理 (友好提示、新手引导)
│   ├── pwa.js                 # PWA 初始化 (Service Worker 注册)
│   ├── push.js                # 推送服务 (WebPush 订阅，实验性)
│   ├── notifier.js            # 通知管理 (浏览器原生通知、定时提醒)
│   ├── animationService.js    # 动画服务 (成功/失败结果动画)
│   ├── clipboardService.js    # 剪贴板服务 (异步复制、回退方案)
│   ├── loadingService.js      # 加载遮罩 (全屏加载状态)
│   ├── progressService.js     # 进度条 (模拟进度、完成状态)
│   ├── themeService.js        # 主题切换 (明暗模式、持久化)
│   └── toastService.js        # 提示消息 (Toast 通知)
│
├── styles/                    # 样式目录 (SCSS)
│   ├── app.scss               # 主样式入口 (@use "./modules")
│   ├── main.scss              # 样式入口（备用）
│   ├── _modules.scss          # 模块聚合 (@forward 各子模块)
│   ├── _preview.scss          # 预览样式
│   ├── _loading.scss          # 加载动画样式
│   ├── _error.scss            # 错误提示样式
│   ├── _dark.scss             # 暗黑模式样式
│   └── _history.scss          # 历史记录样式
│
└── utils/                     # 前端工具函数
    ├── deviceDetector.js      # 设备检测 (移动端识别)
    └── stringUtils.js         # 字符串工具 (全角转半角、HTML转义)
```

---

## 核心文件详解

### 1. `main.js` - 前端入口

**职责**: 应用初始化，导入并协调所有模块

**导入结构**:

```javascript
// 样式
import './styles/app.scss';

// 服务模块
import i18n from './services/i18n';
import { errorHandler, userGuide } from './services/errorHandler';
import cacheManager from './services/cacheManager';
import { initPWA } from './services/pwa';
import notifier from './services/notifier';
import pushService from './services/push';

// 组件
import animePreview from './components/AnimePreview';

// 工具函数
import { toHalfWidth } from './utils/stringUtils';
import { isMobile } from './utils/deviceDetector';

// UI 服务
import { showToast } from './services/toastService';
import { toggleTheme, initTheme } from './services/themeService';
import { showProgressBar } from './services/progressService';
import { showLoadingOverlay } from './services/loadingService';
import { showResultAnimation } from './services/animationService';
import { copyFromElement } from './services/clipboardService';
```

**初始化流程**:

```javascript
// 初始化 PWA
initPWA();

// 将模块挂载到 window (向后兼容 HTML 内联事件处理)
window.i18n = i18n;
window.errorHandler = errorHandler;
window.userGuide = userGuide;
window.cacheManager = cacheManager;
window.animePreview = animePreview;
window.notifier = notifier;
window.pushService = pushService;
window.showToast = showToast;
window.toggleTheme = toggleTheme;
```

**聚合配置管理**: `main.js` 中还包含外部 ICS 聚合功能的配置逻辑，支持用户输入最多 5 个外部 ICS 链接，生成聚合订阅地址。

---

### 2. `components/AnimePreview.js` - 番剧预览组件

**职责**: 番剧列表预览模态框，显示追番数据、状态筛选与搜索

**导出**: `AnimePreview` 类（通过 `main.js` 中 `animePreview` 单例使用）

**关键特性**:

- 模态框展示，支持焦点捕获与无障碍操作
- 状态筛选 (全部/连载中/已完结/未开播)
- 卡片式布局，显示封面、标题、更新时间与状态
- 响应式设计，适配移动端

```javascript
import i18n from '../services/i18n';

// 状态颜色映射
const STATUS_COLORS = {
  watching: '#00a1d6',
  finished: '#999999',
  completed: '#4caf50',
  'not-started': '#ff9800',
};

export class AnimePreview {
  constructor() {
    this.animeData = [];
    this.modalId = 'animePreviewModal';
    this.isLoading = false;
    this.activeFilter = 'all';
  }
  // ...
}
```

---

### 3. `services/i18n.js` - 国际化支持

**职责**: 多语言文本管理与切换，支持参数化翻译

**导出**: `I18n` 类实例（默认导出）

**支持的语言**: `zh-CN`（中文）、`en-US`（英文）

**API**:

```javascript
import i18n from './services/i18n';

// 获取翻译文本
i18n.t('app.title'); // => 'B站追番日历'

// 带参数的翻译
i18n.t('aggregate.errorTooMany', { count: 5 });

// 切换语言
i18n.setLanguage('en-US');

// 获取当前语言
i18n.currentLang; // => 'zh-CN'
```

**实现细节**:

- 通过 `navigator.language` 自动检测浏览器语言
- 用户选择持久化到 LocalStorage
- 语言切换时自动更新页面中所有 `data-i18n` 标记的元素
- 支持 `data-i18n-aria-label` 等无障碍属性翻译

---

### 4. `services/cacheManager.js` - 缓存管理

**职责**: 本地缓存管理、历史记录管理、输入自动建议

**导出**: `cacheManager` 单例对象

**依赖**: `stringUtils.js`（HTML 转义）、`i18n.js`（国际化文本）

```javascript
import { escapeHtml } from '../utils/stringUtils.js';
import i18n from './i18n.js';
```

**数据结构**:

```javascript
// 缓存数据
// { data: any, timestamp: number, version: string }

// 历史记录项
// { uid: string, username: string|null, timestamp: number, visitCount: number }
```

**功能**:

- 带过期时间的本地缓存（24 小时 TTL）
- 历史记录管理（去重、按访问频率排序）
- 输入自动建议（基于历史记录匹配）
- 缓存统计（大小、数量、最旧项时间）

---

### 5. `services/errorHandler.js` - 错误处理

**职责**: 统一错误展示、历史记录、新手引导

**导出**: `errorHandler`、`userGuide` 两个单例

**依赖**: `stringUtils.js`（HTML 转义）

**错误代码映射**:

```javascript
const ERROR_CODES = {
  INVALID_UID:     { title: 'UID格式错误', type: 'warning' },
  USER_NOT_FOUND:  { title: '用户不存在', type: 'error' },
  PRIVACY_PROTECTED: { title: '隐私保护', type: 'warning' },
  NO_BANGUMI:      { title: '未找到追番数据', type: 'info' },
  NETWORK_ERROR:   { title: '网络连接失败', type: 'error' },
  RATE_LIMIT:      { title: '请求过于频繁', type: 'warning' },
  // ...
};
```

**处理流程**:

1. 识别错误类型（基于 HTTP 状态码或响应内容）
2. 匹配对应错误代码，生成错误卡片
3. 显示友好提示与解决方案
4. 记录到历史记录（可选）

---

### 6. `services/pwa.js` - PWA 初始化

**职责**: 注册 Service Worker，启用 PWA 离线缓存

**导出**: `initPWA` 函数

```javascript
export function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service Worker 注册失败:', err);
      });
    });
  }
}
```

---

### 7. `services/themeService.js` - 主题切换

**职责**: 明暗模式切换与持久化

**导出**: `toggleTheme`、`initTheme` 函数

```javascript
const THEME_CONFIG = {
  storageKey: 'theme',
  defaultTheme: 'light',
  themes: {
    light: { icon: 'fa-moon', nextTheme: 'dark' },
    dark: { icon: 'fa-sun', nextTheme: 'light' },
  },
};
```

**实现**: 通过 `data-theme` 属性控制 `<html>` 元素，配合 `_dark.scss` 中的 CSS 变量实现主题切换。用户选择持久化到 LocalStorage。

---

### 8. `services/push.js` - 推送服务

**职责**: WebPush 推送订阅（实验性功能）

**导出**: `pushService` 单例对象

**功能**:

- 获取服务端 VAPID 公钥
- 请求浏览器推送权限
- 创建 PushSubscription 并发送到服务端
- 支持推送通知的显示

**依赖**: 需要服务端配置 `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` 环境变量。

---

### 9. `services/notifier.js` - 通知管理

**职责**: 浏览器原生通知，番剧更新定时提醒

**导出**: `notifier` 单例对象

**功能**:

- 请求浏览器通知权限
- 安排定时通知（默认提前 5 分钟提醒）
- 取消所有已安排的提醒 (`clearTimers`)

---

### 10. UI 服务模块

以下模块提供独立的 UI 功能，均通过 `main.js` 导入并挂载到 `window`：

| 模块 | 文件 | 导出 | 功能 |
|------|------|------|------|
| **Toast 提示** | `toastService.js` | `showToast` | 多类型消息提示（success/error/warning/info），自动关闭 |
| **加载遮罩** | `loadingService.js` | `showLoadingOverlay` | 全屏加载遮罩，支持文本更新与隐藏控制 |
| **进度条** | `progressService.js` | `showProgressBar` | 模拟进度条，支持完成与错误状态 |
| **结果动画** | `animationService.js` | `showResultAnimation` | 成功/失败结果动画（1.5 秒） |
| **剪贴板** | `clipboardService.js` | `copyFromElement` | 文本复制，支持现代异步 API 与传统回退方案 |

---

### 11. `utils/` - 前端工具函数

| 文件 | 导出 | 功能 |
|------|------|------|
| `stringUtils.js` | `toHalfWidth`、`escapeHtml` | 全角转半角数字、HTML 实体转义 |
| `deviceDetector.js` | `isMobile` | 基于 User-Agent 检测移动端设备 |

---

### 12. `public/sw.js` - Service Worker

**职责**: PWA 离线缓存与资源预缓存

**位置**: `public/sw.js`（静态资源，直接部署到根目录）

**缓存策略**:

```javascript
const VERSION = '1.1.8';
const CACHE_NAME = `bili-calendar-v${VERSION}`;

// 核心资源 (安装时预缓存)
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];
```

**Vite 构建资源集成**: Service Worker 运行时动态读取 `/.vite/manifest.json`，将 Vite 构建产物（JS/CSS/静态资源）加入缓存列表，确保构建后的资源也能离线访问。

---

## 样式系统

### 架构

样式基于 SCSS 模块化组织，通过 `@forward` 实现聚合：

```scss
// src/styles/app.scss — 主入口
@use "./modules";

// src/styles/_modules.scss — 模块聚合
@forward './main';
@forward './dark';
@forward './loading';
@forward './error';
@forward './preview';
@forward './history';
```

Vite 在构建时将 SCSS 编译为 CSS 并注入到页面。

### 样式文件说明

| 文件 | 职责 |
|------|------|
| `app.scss` | 主样式入口，`@use` 引入 `_modules.scss` |
| `main.scss` | 基础布局、主题变量、通用组件样式 |
| `_dark.scss` | 暗黑模式覆盖样式 |
| `_loading.scss` | 加载动画样式 |
| `_error.scss` | 错误提示卡片样式 |
| `_preview.scss` | 番剧预览模态框与卡片样式 |
| `_history.scss` | 历史记录列表样式 |

### 主题变量

**浅色模式** (`main.scss`):

```css
:root {
  --primary-color: #00a1d6;
  --secondary-color: #fb7299;
  --background-color: #ffffff;
  --text-color: #333333;
  --border-color: #e0e0e0;
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```

**暗黑模式** (`_dark.scss`):

```css
[data-theme="dark"] {
  --primary-color: #00a1d6;
  --secondary-color: #fb7299;
  --background-color: #1a1a1a;
  --text-color: #e0e0e0;
  --border-color: #333333;
  --shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
```

### 外部依赖

`index.html` 引入以下 CDN 资源：

- **Bootstrap 5.3.0** — 栅格系统与基础组件
- **Font Awesome 6.4.0** — 图标库（用于主题切换、状态指示等）

---

## 配置与常量

### PWA 配置 (`public/manifest.webmanifest`)

```json
{
  "name": "Bili-Calendar",
  "short_name": "B站日历",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#00a1d6",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### HTML 入口 (`index.html`)

- 通过 `data-i18n` 属性标记可翻译元素
- 通过 `data-i18n-aria-label` 标记无障碍翻译
- 内联事件处理委托到 `window` 上挂载的模块方法
- 使用 `type="module"` 加载 `src/main.js`

---

## 模块依赖关系

```
main.js
├── styles/app.scss (SCSS 编译)
├── services/i18n.js
├── services/errorHandler.js
│   └── utils/stringUtils.js
├── services/cacheManager.js
│   ├── utils/stringUtils.js
│   └── services/i18n.js
├── components/AnimePreview.js
│   └── services/i18n.js
├── services/pwa.js
├── services/notifier.js
├── services/push.js
├── services/toastService.js
├── services/themeService.js
├── services/progressService.js
├── services/loadingService.js
├── services/animationService.js
├── services/clipboardService.js
├── utils/stringUtils.js
└── utils/deviceDetector.js
```

---

## 性能优化

### 1. 构建优化

- Vite 自动代码分割，按需加载模块
- SCSS 编译为最小化 CSS
- 构建产物输出到 `dist/`，支持 Gzip 压缩（服务端 `compression` 中间件）

### 2. 缓存策略

- Service Worker 缓存核心资源与 Vite 构建产物
- LocalStorage 缓存 API 响应（24 小时过期）
- 静态资源使用 Vite 内容哈希命名，支持长期缓存

### 3. 运行时优化

- 事件委托减少 DOM 监听器数量
- 全角数字自动转半角（`toHalfWidth`），避免用户输入错误
- 设备检测（`isMobile`）适配移动端交互差异

---

## 测试覆盖

前端服务模块已有对应的单元测试文件，位于 `test/` 目录：

| 模块 | 测试文件 | 覆盖率 |
|------|---------|--------|
| `i18n.js` | `services.i18n.test.js` | 100% |
| `cacheManager.js` | `services.cacheManager.test.js` | 100% |
| `errorHandler.js` | `services.errorHandler.test.js` | 100% |
| `themeService.js` | `services.themeService.test.js` | 100% |
| `toastService.js` | `services.toastService.test.js` | 100% |
| `loadingService.js` | `services.loadingService.test.js` | 100% |
| `progressService.js` | `services.progressService.test.js` | 100% |
| `animationService.js` | `services.animationService.test.js` | 100% |
| `clipboardService.js` | `services.clipboardService.test.js` | 100% |
| `notifier.js` | `services.notifier.test.js` | 100% |
| `deviceDetector.js` | `utils.deviceDetector.test.js` | 100% |
| `stringUtils.js` | `utils.stringUtils.test.js` | 100% |

---

## 相关链接

- [根目录](../CLAUDE.md)
- [工具模块文档](../utils/CLAUDE.md)
- [测试文档](../test/CLAUDE.md)

---

**最后更新**: 2026-05-03
