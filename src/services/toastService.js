// @ts-check
/**
 * Toast 提示信息服务
 * 提供优雅的消息提示功能，支持多种类型、自动关闭、纵向堆叠与防刷屏去重。
 * Toast 统一挂载到右上角容器内，超出上限时自动淘汰最旧的一条。
 */

import { escapeHtml } from '../utils/stringUtils.js';

/**
 * Toast 类型
 * @typedef {'success' | 'error' | 'warning' | 'info'} ToastType
 */

/** 同时最多展示的 Toast 数量（超出淘汰最旧） */
const MAX_VISIBLE_TOASTS = 5;

/**
 * 可见 Toast 条目
 * @typedef {Object} VisibleToast
 * @property {HTMLElement} element - Toast 元素
 * @property {string} message - 提示消息
 * @property {ToastType} type - 提示类型
 * @property {ReturnType<typeof setTimeout>|undefined} timer - 自动关闭计时器
 */

/**
 * 当前可见 Toast 条目
 * @type {VisibleToast[]}
 */
const _visibleToasts = [];

/** Toast 容器（懒创建，单例） */
/** @type {HTMLElement|null} */
let _toastContainer = null;

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
 * 获取 Toast 容器（不存在时创建并挂到 body）
 * 容器承担 aria-live 声明，辅助技术可感知新提示。
 *
 * @private
 * @returns {HTMLElement} Toast 容器元素
 */
function getToastContainer() {
  if (_toastContainer && _toastContainer.parentNode) return _toastContainer;
  _toastContainer = document.createElement('div');
  _toastContainer.className = 'toast-container';
  if (typeof _toastContainer.setAttribute === 'function') {
    _toastContainer.setAttribute('role', 'status');
    _toastContainer.setAttribute('aria-live', 'polite');
    _toastContainer.setAttribute('aria-atomic', 'false');
  }
  document.body.appendChild(_toastContainer);
  return _toastContainer;
}

/**
 * 淘汰最旧的 Toast，保证同时可见数量不超过上限
 * @private
 */
function enforceMaxToasts() {
  while (_visibleToasts.length > MAX_VISIBLE_TOASTS) {
    const oldest = _visibleToasts.shift();
    if (oldest) hideToast(oldest.element, true);
  }
}

/**
 * 显示 Toast 提示信息
 * 相同「消息 + 类型」的提示在展示期内只保留一条（重新计时，防刷屏）。
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

  // 去重：同消息同类型已可见时，仅重置关闭计时
  const existing = _visibleToasts.find((t) => t.message === message && t.type === type);
  if (existing) {
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => hideToast(existing.element), duration);
    return existing.element;
  }

  const toast = createToastElement(message, type);
  const container = getToastContainer();
  container.appendChild(toast);
  _visibleToasts.push({
    element: toast,
    message,
    type,
    timer: undefined,
  });
  enforceMaxToasts();

  // 触发动画
  setTimeout(() => {
    toast.classList.add('show');
  }, DEFAULT_CONFIG.animationDelay);

  // 自动关闭
  const entry = _visibleToasts.find((t) => t.element === toast);
  if (entry) {
    entry.timer = setTimeout(() => hideToast(toast), duration);
  }

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
  const closeLabel = '关闭';

  toast.innerHTML = `
    <div class="toast-content-enhanced ${type}">
      <i class="fas ${icon} toast-icon" aria-hidden="true"></i>
      <span class="toast-message">${escapeHtml(message)}</span>
      <button type="button" class="toast-close" data-toast-close aria-label="${closeLabel}" title="${closeLabel}">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  `;

  return toast;
}

/**
 * 隐藏 Toast 提示
 *
 * @private
 * @param {HTMLElement} toast - Toast 元素
 * @param {boolean} [immediate=false] - 是否立即移除（用于淘汰最旧，跳过淡出）
 */
function hideToast(toast, immediate = false) {
  const idx = _visibleToasts.findIndex((t) => t.element === toast);
  const entry = idx === -1 ? null : _visibleToasts[idx];
  if (entry) {
    if (entry.timer != null) clearTimeout(entry.timer);
    _visibleToasts.splice(idx, 1);
  }

  toast.classList.remove('show');
  const remove = () => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  };
  if (immediate) {
    remove();
  } else {
    setTimeout(remove, DEFAULT_CONFIG.fadeOutDuration);
  }
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
