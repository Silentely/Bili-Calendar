// @ts-check
/**
 * WebPush 推送服务模块
 * 提供浏览器推送通知功能(实验性)
 */

/**
 * 获取服务器的 VAPID 公钥
 *
 * @returns {Promise<string>} VAPID 公钥(base64编码)
 * @throws {Error} 当请求失败或响应无效时抛出错误
 *
 * @example
 * const key = await getPublicKey()
 * // => "Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 */
async function getPublicKey() {
  const res = await fetch('/push/public-key', { cache: 'no-store' });
  if (!res.ok) throw new Error('no-public-key');
  const data = await res.json();
  if (!data.key) throw new Error('empty-key');
  return data.key;
}

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
async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('push-not-supported');
  }

  const reg = await navigator.serviceWorker.ready;
  const key = await getPublicKey();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });

  const resp = await fetch('/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub),
  });
  if (!resp.ok) throw new Error('subscribe-failed');
  return true;
}

export default { registerPush };
