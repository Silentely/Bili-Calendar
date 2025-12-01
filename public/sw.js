/* 简易PWA Service Worker，缓存关键静态资源与离线回退 */
const VERSION = '1.1.7';
const CACHE_NAME = `bili-calendar-v${VERSION}`;
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

async function loadViteAssets() {
  try {
    // Vite 默认将 manifest 输出到 .vite/manifest.json
    const resp = await fetch('/.vite/manifest.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('manifest fetch failed: ' + resp.status);
    const manifest = await resp.json();
    const assets = new Set();

    Object.values(manifest).forEach((entry) => {
      if (entry.file) assets.add(withLeadingSlash(entry.file));
      if (Array.isArray(entry.css)) entry.css.forEach((css) => assets.add(withLeadingSlash(css)));
      if (Array.isArray(entry.assets))
        entry.assets.forEach((asset) => assets.add(withLeadingSlash(asset)));
    });

    return Array.from(assets);
  } catch (err) {
    console.warn('[SW] 读取 Vite manifest 失败，离线预缓存将跳过构建资源:', err);
    return [];
  }
}

function withLeadingSlash(file) {
  if (!file) return file;
  return file.startsWith('/') ? file : '/' + file;
}

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const viteAssets = await loadViteAssets();
      const assetsToCache = [...new Set([...CORE_ASSETS, ...viteAssets])];
      await cache.addAll(assetsToCache);
      await self.skipWaiting();
    })()
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())))
      )
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

// 网络优先用于API，缓存优先用于静态资源
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 仅处理同源请求，避免对外链请求使用 fetch() 触发 connect-src 限制
  if (url.origin !== location.origin) {
    return; // 不拦截，交由浏览器默认处理（受 style-src / img-src 等策略控制）
  }

  if (isApiRequest(url)) {
    // API：网络优先，失败回退缓存（若有）
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
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
