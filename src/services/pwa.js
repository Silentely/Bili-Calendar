// @ts-check
/**
 * PWA Service Worker 注册模块
 * 提供 Service Worker 注册功能,支持 PWA 离线缓存
 */

/**
 * 初始化 PWA
 * 在页面加载时注册 Service Worker
 *
 * @returns {void}
 *
 * @example
 * import { initPWA } from './services/pwa.js'
 *
 * // 应用初始化时调用
 * initPWA()
 */
export function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service Worker 注册失败:', err);
      });
    });
  }
}