/* 简易PWA Service Worker，缓存关键静态资源与离线回退 */
const CACHE_NAME = 'bili-calendar-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/styles-dark.css',
  '/loading-animations.css',
  '/error-guide.css',
  '/anime-preview.css',
  '/cache-history.css',
  '/app.js',
  '/error-handler.js',
  '/anime-preview.js',
  '/cache-manager.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())))
    ).then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

// 网络优先用于API，缓存优先用于静态资源
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (isApiRequest(url)) {
    // API：网络优先，失败回退缓存（若有）
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 静态资源：缓存优先，回退网络；若都失败，给离线页占位
  event.respondWith(
    caches.match(event.request).then((cacheResp) => {
      return (
        cacheResp ||
        fetch(event.request)
          .then((resp) => {
            // 仅缓存GET且同源资源
            if (event.request.method === 'GET' && url.origin === location.origin) {
              const clone = resp.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return resp;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') {
              // 简易离线回退
              return new Response(
                '<!doctype html><meta charset="utf-8"><title>离线</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fafafa;color:#333} .card{background:#fff;border:1px solid #eee;border-radius:12px;padding:24px;box-shadow:0 6px 24px rgba(0,0,0,.06);max-width:420px;text-align:center} h1{font-size:22px;margin:0 0 10px} p{margin:6px 0 0;color:#666}</style><div class="card"><h1>当前处于离线状态</h1><p>已缓存的页面和资源仍可使用。</p></div>',
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
              );
            }
            return new Response(''); // 其他资源静默失败
          })
      );
    })
  );
});