// @ts-check
/**
 * Toast 提示信息服务
 * 提供优雅的消息提示功能，支持多种类型和自动关闭
 */

import { escapeHtml } from '../utils/stringUtils.js';

/**
 * Toast 类型
 * @typedef {'success' | 'error' | 'warning' | 'info'} ToastType
 */

/**
 * 事件委托：关闭按钮点击处理（延迟绑定，避免测试环境报错）
 * @private
 */
let _closeListenerBound = false;
function ensureCloseListener() {
  if (_closeListenerBound) return;
  if (typeof document === 'undefined' || !document.addEventListener) return;
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const closeBtn = target ? target.closest('[data-toast-close]') : null;
    if (closeBtn) {
      const toast = closeBtn.closest('.toast-notification-enhanced');
      if (toast instanceof HTMLElement) hideToast(toast);
    }
  });
  _closeListenerBound = true;
}

/**
 * Toast 图标映射
 * @private
 */
const TOAST_ICONS = {
  success: 'fa-check-circle',
  error: 'fa-times-circle',
  warning: 'fa-exclamation-triangle',
  info: 'fa-info-circle',
};

/**
 * 默认配置
 * @private
 */
const DEFAULT_CONFIG = {
  duration: 3000, // 默认显示时间: 3秒
  animationDelay: 10, // 动画延迟: 10ms
  fadeOutDuration: 300, // 淡出动画时长: 300ms
};

/**
 * 显示 Toast 提示信息
 *
 * @param {string} message - 提示消息内容
 * @param {ToastType} [type='info'] - 提示类型
 * @param {number} [duration] - 显示时长 (毫秒)，默认 3000ms
 * @returns {HTMLElement} Toast DOM 元素
 *
 * @example
 * showToast('操作成功！', 'success')
 * showToast('发生错误', 'error', 5000)
 * showToast('请注意', 'warning')
 * showToast('提示信息', 'info')
 */
export function showToast(message, type = 'info', duration = DEFAULT_CONFIG.duration) {
  ensureCloseListener();
  const toast = createToastElement(message, type);

  document.body.appendChild(toast);

  // 触发动画
  setTimeout(() => {
    toast.classList.add('show');
  }, DEFAULT_CONFIG.animationDelay);

  // 自动关闭
  setTimeout(() => {
    hideToast(toast);
  }, duration);

  return toast;
}

/**
 * 创建 Toast DOM 元素
 *
 * @private
 * @param {string} message - 提示消息
 * @param {ToastType} type - 提示类型
 * @returns {HTMLElement} Toast 元素
 */
function createToastElement(message, type) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification-enhanced';

  const icon = TOAST_ICONS[type] || TOAST_ICONS.info;

  toast.innerHTML = `
    <div class="toast-content-enhanced ${type}">
      <i class="fas ${icon} toast-icon"></i>
      <span class="toast-message">${escapeHtml(message)}</span>
      <i class="fas fa-times toast-close" data-toast-close></i>
    </div>
  `;

  return toast;
}

/**
 * 隐藏 Toast 提示
 *
 * @private
 * @param {HTMLElement} toast - Toast 元素
 */
function hideToast(toast) {
  toast.classList.remove('show');
  setTimeout(() => {
    if (toast.parentNode) {
      document.body.removeChild(toast);
    }
  }, DEFAULT_CONFIG.fadeOutDuration);
}

/**
 * 显示成功提示
 *
 * @param {string} message - 提示消息
 * @param {number} [duration] - 显示时长
 * @returns {HTMLElement} Toast DOM 元素
 *
 * @example
 * showSuccess('操作成功！')
 */
export function showSuccess(message, duration) {
  return showToast(message, 'success', duration);
}

/**
 * 显示错误提示
 *
 * @param {string} message - 错误消息
 * @param {number} [duration] - 显示时长
 * @returns {HTMLElement} Toast DOM 元素
 *
 * @example
 * showError('操作失败！')
 */
export function showError(message, duration) {
  return showToast(message, 'error', duration);
}

/**
 * 显示警告提示
 *
 * @param {string} message - 警告消息
 * @param {number} [duration] - 显示时长
 * @returns {HTMLElement} Toast DOM 元素
 *
 * @example
 * showWarning('请注意！')
 */
export function showWarning(message, duration) {
  return showToast(message, 'warning', duration);
}

/**
 * 显示信息提示
 *
 * @param {string} message - 信息消息
 * @param {number} [duration] - 显示时长
 * @returns {HTMLElement} Toast DOM 元素
 *
 * @example
 * showInfo('提示信息')
 */
export function showInfo(message, duration) {
  return showToast(message, 'info', duration);
}

export default {
  showToast,
  showSuccess,
  showError,
  showWarning,
  showInfo,
};
