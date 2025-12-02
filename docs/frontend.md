# Public 模块文档

> **导航**: [根目录](../CLAUDE.md) > **public (前端应用层)**

---

## 变更记录 (Changelog)

### 2025-11-30
- **[导航增强]** 添加面包屑导航，便于模块间跳转
- **[索引更新]** 更新模块索引，与根文档保持一致

### 2025-11-22
- 初始文档创建，详细记录前端架构与功能实现

---

## 模块概览

**Public** 模块是 Bili-Calendar 的前端应用层，负责用户界面展示、交互逻辑、PWA 支持和多语言国际化。采用 Vanilla JavaScript 实现，无框架依赖，轻量高效。

### 核心职责

- 用户界面渲染与交互
- 多语言支持 (中文/英文)
- 本地缓存与历史记录管理
- PWA 支持与离线访问
- 暗黑模式切换
- 番剧预览功能
- 错误处理与用户引导

---

## 文件结构

```
public/
├── index.html                # 主页面 (HTML 结构)
├── app.js                    # 主应用逻辑 (核心控制器)
├── i18n.js                   # 国际化支持 (中英文切换)
├── cache-manager.js          # 缓存管理 (LocalStorage)
├── error-handler.js          # 错误处理 (友好提示)
├── anime-preview.js          # 番剧预览 (模态框)
├── sw.js                     # Service Worker (PWA)
├── pwa-init.js               # PWA 初始化
├── styles.css                # 主样式 (浅色模式)
├── styles-dark.css           # 暗黑模式样式
├── loading-animations.css    # 加载动画
├── anime-preview.css         # 番剧预览样式
├── cache-history.css         # 缓存历史样式
├── error-guide.css           # 错误引导样式
├── mobile-enhancements.css   # 移动端优化
├── manifest.webmanifest      # PWA 清单
├── favicon.ico               # 网站图标
└── icons/                    # PWA 应用图标
    ├── icon-192x192.png
    └── icon-512x512.png
```

---

## 核心文件详解

### 1. `index.html` - 主页面

**职责**: HTML 结构定义，包含所有 UI 元素

**关键元素**:
```html
<!-- UID 输入区域 -->
<input id="uid-input" type="text" placeholder="请输入B站UID">
<button id="generate-btn">生成订阅</button>
<button id="preview-btn">预览番剧</button>

<!-- 结果展示区域 -->
<div id="result-container">
  <input id="calendar-url" readonly>
  <button id="copy-btn">复制链接</button>
</div>

<!-- 历史记录 -->
<div id="history-container"></div>

<!-- 番剧预览模态框 -->
<div id="preview-modal"></div>

<!-- 错误提示 -->
<div id="error-container"></div>
```

**特性**:
- 响应式布局 (Flexbox + Grid)
- 语义化 HTML5 标签
- 无障碍支持 (ARIA 属性)
- PWA 元标签配置

---

### 2. `app.js` - 主应用逻辑

**职责**: 核心控制器，协调各模块交互

**主要功能**:

#### 2.1 初始化流程
```javascript
// 页面加载时执行
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  loadHistory();
  setupEventListeners();
  initTheme();
  initLanguage();
});
```

#### 2.2 订阅生成
```javascript
async function generateSubscription(uid) {
  // 1. 验证 UID
  if (!validateUID(uid)) {
    showError('UID 格式错误');
    return;
  }

  // 2. 检查缓存
  const cached = cacheManager.get(uid);
  if (cached) {
    displayResult(cached);
    return;
  }

  // 3. 调用 API
  const url = `/api/${uid}`;
  const response = await fetch(url);

  // 4. 处理响应
  if (response.ok) {
    displayResult(url);
    cacheManager.set(uid, url);
    addToHistory(uid);
  } else {
    handleError(response);
  }
}
```

#### 2.3 事件监听
```javascript
// 生成按钮点击
generateBtn.addEventListener('click', () => {
  const uid = uidInput.value.trim();
  generateSubscription(uid);
});

// 回车键快捷操作
uidInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    generateBtn.click();
  }
});

// 复制按钮
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(calendarUrl.value);
  showToast('链接已复制');
});
```

#### 2.4 主题切换
```javascript
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);

  // 更新图标
  updateThemeIcon(newTheme);
}
```

**依赖模块**:
- `i18n.js` - 多语言支持
- `cache-manager.js` - 缓存管理
- `error-handler.js` - 错误处理
- `anime-preview.js` - 番剧预览

---

### 3. `i18n.js` - 国际化支持

**职责**: 多语言文本管理与切换

**语言定义**:
```javascript
const translations = {
  'zh-CN': {
    'app.title': 'B站追番日历',
    'input.placeholder': '请输入B站UID',
    'button.generate': '生成订阅',
    'button.preview': '预览番剧',
    'error.invalid_uid': 'UID 格式错误',
    // ... 更多翻译
  },
  'en-US': {
    'app.title': 'Bilibili Anime Calendar',
    'input.placeholder': 'Enter Bilibili UID',
    'button.generate': 'Generate',
    'button.preview': 'Preview',
    'error.invalid_uid': 'Invalid UID format',
    // ... more translations
  }
};
```

**API**:
```javascript
// 获取翻译文本
i18n.t('app.title'); // => 'B站追番日历'

// 切换语言
i18n.setLanguage('en-US');

// 获取当前语言
i18n.getCurrentLanguage(); // => 'zh-CN'

// 自动检测浏览器语言
i18n.detectLanguage();
```

**实现细节**:
- 支持嵌套键 (如 `error.network.timeout`)
- 支持变量插值 (如 `Hello, {name}!`)
- 自动保存用户选择到 LocalStorage
- 语言切换时自动更新页面文本

---

### 4. `cache-manager.js` - 缓存管理

**职责**: 本地缓存与历史记录管理

**缓存策略**:
```javascript
class CacheManager {
  constructor() {
    this.CACHE_KEY = 'bili-calendar-cache';
    this.HISTORY_KEY = 'bili-calendar-history';
    this.MAX_HISTORY = 10; // 最多保存 10 条历史
    this.CACHE_TTL = 24 * 60 * 60 * 1000; // 24 小时过期
  }

  // 设置缓存
  set(uid, data) {
    const cache = this.getAll();
    cache[uid] = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
  }

  // 获取缓存
  get(uid) {
    const cache = this.getAll();
    const item = cache[uid];

    if (!item) return null;

    // 检查是否过期
    if (Date.now() - item.timestamp > this.CACHE_TTL) {
      this.delete(uid);
      return null;
    }

    return item.data;
  }

  // 添加到历史记录
  addHistory(uid) {
    let history = this.getHistory();

    // 去重
    history = history.filter(item => item !== uid);

    // 添加到开头
    history.unshift(uid);

    // 限制数量
    if (history.length > this.MAX_HISTORY) {
      history = history.slice(0, this.MAX_HISTORY);
    }

    localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
  }

  // 获取历史记录
  getHistory() {
    const data = localStorage.getItem(this.HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  }

  // 清理过期缓存
  cleanup() {
    const cache = this.getAll();
    const now = Date.now();

    Object.keys(cache).forEach(uid => {
      if (now - cache[uid].timestamp > this.CACHE_TTL) {
        delete cache[uid];
      }
    });

    localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
  }
}
```

**使用示例**:
```javascript
const cacheManager = new CacheManager();

// 设置缓存
cacheManager.set('614500', { url: 'https://...' });

// 获取缓存
const cached = cacheManager.get('614500');

// 添加历史
cacheManager.addHistory('614500');

// 获取历史
const history = cacheManager.getHistory();

// 清理过期缓存
cacheManager.cleanup();
```

---

### 5. `error-handler.js` - 错误处理

**职责**: 统一错误处理与用户友好提示

**错误类型**:
```javascript
const ERROR_TYPES = {
  INVALID_UID: {
    code: 'INVALID_UID',
    message: 'UID 格式错误',
    solution: '请输入正确的 B站 UID (纯数字)',
    icon: '⚠️'
  },
  NETWORK_ERROR: {
    code: 'NETWORK_ERROR',
    message: '网络连接失败',
    solution: '请检查网络连接后重试',
    icon: '🌐'
  },
  API_ERROR: {
    code: 'API_ERROR',
    message: 'API 请求失败',
    solution: '服务暂时不可用，请稍后重试',
    icon: '🔧'
  },
  RATE_LIMIT: {
    code: 'RATE_LIMIT',
    message: '请求过于频繁',
    solution: '请稍后再试 (15分钟内最多100次)',
    icon: '⏱️'
  },
  NO_BANGUMI: {
    code: 'NO_BANGUMI',
    message: '未找到追番数据',
    solution: '请确认该账号已追番或追番列表为公开',
    icon: '📭'
  }
};
```

**错误处理流程**:
```javascript
function handleError(error) {
  // 1. 识别错误类型
  const errorType = identifyError(error);

  // 2. 显示错误提示
  showErrorMessage(errorType);

  // 3. 记录错误日志 (可选)
  logError(error);

  // 4. 提供解决方案
  showSolution(errorType.solution);
}

function showErrorMessage(errorType) {
  const errorContainer = document.getElementById('error-container');

  errorContainer.innerHTML = `
    <div class="error-card">
      <div class="error-icon">${errorType.icon}</div>
      <div class="error-message">${errorType.message}</div>
      <div class="error-solution">${errorType.solution}</div>
      <button class="error-close">关闭</button>
    </div>
  `;

  errorContainer.classList.add('show');

  // 自动隐藏 (5秒后)
  setTimeout(() => {
    errorContainer.classList.remove('show');
  }, 5000);
}
```

---

### 6. `anime-preview.js` - 番剧预览

**职责**: 番剧列表预览模态框

**功能特性**:
- 显示所有追番列表
- 显示更新时间与状态
- 支持搜索与筛选
- 响应式布局

**API 调用**:
```javascript
async function fetchAnimeList(uid) {
  const response = await fetch(`/preview/${uid}`);

  if (!response.ok) {
    throw new Error('Failed to fetch anime list');
  }

  const data = await response.json();
  return data.bangumi_list;
}
```

**渲染逻辑**:
```javascript
function renderAnimeList(animeList) {
  const container = document.getElementById('anime-list');

  container.innerHTML = animeList.map(anime => `
    <div class="anime-card">
      <img src="${anime.cover}" alt="${anime.title}">
      <div class="anime-info">
        <h3>${anime.title}</h3>
        <p class="anime-time">更新时间: ${anime.pub_time}</p>
        <p class="anime-status">${anime.is_finish ? '已完结' : '连载中'}</p>
      </div>
    </div>
  `).join('');
}
```

---

### 7. `sw.js` - Service Worker

**职责**: PWA 支持与离线缓存

**缓存策略**:
```javascript
const CACHE_NAME = 'bili-calendar-v1.1.8';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/styles-dark.css',
  '/i18n.js',
  '/cache-manager.js',
  '/error-handler.js',
  '/anime-preview.js',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// 安装时缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// 拦截请求，优先使用缓存
self.addEventListener('fetch', (event) => {
  // 仅拦截同源请求
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
```

---

## 样式系统

### 主题变量

**浅色模式** (`styles.css`):
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

**暗黑模式** (`styles-dark.css`):
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

### 响应式断点

```css
/* 移动端 */
@media (max-width: 768px) {
  .container {
    padding: 1rem;
  }
}

/* 平板 */
@media (min-width: 769px) and (max-width: 1024px) {
  .container {
    padding: 2rem;
  }
}

/* 桌面端 */
@media (min-width: 1025px) {
  .container {
    padding: 3rem;
  }
}
```

---

## 配置与常量

### PWA 配置 (`manifest.webmanifest`)

```json
{
  "name": "Bili-Calendar",
  "short_name": "B站日历",
  "description": "将B站追番列表转换为日历订阅",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#00a1d6",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 性能优化

### 1. 资源加载优化
- 使用 `defer` 加载非关键 JS
- 图片懒加载 (`loading="lazy"`)
- 字体预加载 (`<link rel="preload">`)

### 2. 缓存策略
- Service Worker 缓存静态资源
- LocalStorage 缓存 API 响应
- 24 小时缓存过期时间

### 3. 代码优化
- 事件委托减少监听器数量
- 防抖/节流处理高频事件
- 虚拟滚动优化长列表

---

## 测试建议

### 功能测试
- [ ] UID 输入验证
- [ ] 订阅链接生成
- [ ] 番剧预览加载
- [ ] 历史记录保存
- [ ] 多语言切换
- [ ] 主题切换
- [ ] 离线访问

### 兼容性测试
- [ ] Chrome/Edge (最新版)
- [ ] Firefox (最新版)
- [ ] Safari (iOS/macOS)
- [ ] 移动端浏览器

---

## 相关链接

- [根目录](../CLAUDE.md)
- [工具模块文档](../utils/CLAUDE.md)
- [测试文档](../test/CLAUDE.md)

---

**最后更新**: 2025-11-30
