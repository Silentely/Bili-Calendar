// @ts-check
/**
 * WebPush 推送服务模块
 *
 * 限制说明：
 * - 需要服务端配置 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 * - 自托管 + 文件/持久化 push-store 时可用
 * - Netlify Functions 无状态，内存订阅无法跨实例/冷启动保留，故生产公共站默认不可用
 */

/**
 * 将 URL-safe Base64 字符串转换为 Uint8Array
 * 用于将 VAPID 公钥转换为 PushManager.subscribe 所需的格式
 *
 * @param {string} base64String - URL-safe Base64 编码的字符串
 * @returns {Uint8Array} 转换后的字节数组
 *
 * @example
 * const arr = urlBase64ToUint8Array('Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
 * // => Uint8Array(65) [ 5, ... ]
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * 注册浏览器推送服务
 * 需要用户授予通知权限,并且服务器配置 VAPID 密钥
 *
 * @returns {Promise<boolean>} 注册成功返回 true
 * @throws {Error} 当不支持推送或注册失败时抛出错误
 *
 * @example
 * try {
 *   await registerPush()
 *   console.log('推送已启用')
 * } catch (err) {
 *   if (err.message === 'push-not-supported') {
 *     console.log('浏览器不支持推送')
 *   }
 * }
 */
/**
 * 探测推送是否可用（公钥是否存在）
 * @returns {Promise<{available: boolean, reason?: string, key?: string}>}
 */
async function probePushAvailability() {
  try {
    const res = await fetch('/push/public-key', { cache: 'no-store' });
    if (res.status === 404 || res.status === 501) {
      return { available: false, reason: 'not-configured' };
    }
    if (!res.ok) {
      return { available: false, reason: 'probe-failed' };
    }
    const data = await res.json();
    if (!data.key) return { available: false, reason: 'empty-key' };
    return { available: true, key: data.key };
  } catch {
    return { available: false, reason: 'network' };
  }
}

async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('push-not-supported');
  }

  const probe = await probePushAvailability();
  if (!probe.available || !probe.key) {
    const err = new Error('push-unavailable');
    // @ts-ignore
    err.reason = probe.reason || 'not-configured';
    throw err;
  }

  const reg = await navigator.serviceWorker.ready;
  // 复用探测阶段拿到的公钥，避免二次请求 /push/public-key
  const key = probe.key;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: /** @type {BufferSource} */ (
      /** @type {unknown} */ (urlBase64ToUint8Array(key))
    ),
  });

  const resp = await fetch('/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  });
  if (!resp.ok) throw new Error('subscribe-failed');
  return true;
}

export default { registerPush, probePushAvailability };
