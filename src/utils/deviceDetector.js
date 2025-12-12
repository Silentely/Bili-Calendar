// @ts-check
/**
 * 设备检测工具模块
 * 提供设备类型、浏览器特性检测相关的工具函数
 */

/**
 * 检测是否为移动设备
 *
 * 通过 User-Agent 检测常见的移动设备标识
 *
 * @returns {boolean} 是否为移动设备
 *
 * @example
 * isMobile()
 * // => true (在移动设备上)
 * // => false (在桌面设备上)
 */
export function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * 检测是否为 iOS 设备
 *
 * @returns {boolean} 是否为 iOS 设备
 *
 * @example
 * isIOS()
 * // => true (在 iPhone/iPad 上)
 * // => false (在其他设备上)
 */
export function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * 检测是否为 Android 设备
 *
 * @returns {boolean} 是否为 Android 设备
 *
 * @example
 * isAndroid()
 * // => true (在 Android 设备上)
 * // => false (在其他设备上)
 */
export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

/**
 * 检测是否支持触摸事件
 *
 * @returns {boolean} 是否支持触摸
 *
 * @example
 * isTouchDevice()
 * // => true (在触摸设备上)
 * // => false (在非触摸设备上)
 */
export function isTouchDevice() {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-ignore - msMaxTouchPoints 是 IE 的遗留属性
    navigator.msMaxTouchPoints > 0
  );
}

/**
 * 设备类型
 * @typedef {'mobile' | 'tablet' | 'desktop'} DeviceType
 */

/**
 * 获取设备类型描述
 *
 * @returns {DeviceType} 设备类型
 *
 * @example
 * getDeviceType()
 * // => 'mobile'
 * // => 'tablet'
 * // => 'desktop'
 */
export function getDeviceType() {
  const ua = navigator.userAgent;

  if (/iPad/i.test(ua)) {
    return 'tablet';
  }

  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) {
    return 'tablet';
  }

  if (isMobile()) {
    return 'mobile';
  }

  return 'desktop';
}

export default {
  isMobile,
  isIOS,
  isAndroid,
  isTouchDevice,
  getDeviceType,
};
