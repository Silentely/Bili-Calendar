// @ts-check
/**
 * 剪贴板服务
 * 提供文本复制到剪贴板的功能,支持现代异步 API 和传统回退方案
 */

/**
 * 剪贴板操作选项
 * @typedef {Object} ClipboardOptions
 * @property {() => void} [onSuccess] - 成功回调
 * @property {() => void} [onError] - 失败回调
 */

/**
 * 复制文本到剪贴板
 *
 * @param {string} text - 要复制的文本
 * @param {ClipboardOptions} [options] - 选项配置
 * @returns {Promise<boolean>} 是否复制成功
 *
 * @example
 * import { copyToClipboard } from './services/clipboardService.js'
 *
 * await copyToClipboard('https://example.com', {
 *   onSuccess: () => console.log('复制成功！'),
 *   onError: () => console.log('复制失败！')
 * })
 */
export async function copyToClipboard(text, options = {}) {
  const { onSuccess, onError } = options;

  if (!text || typeof text !== 'string') {
    console.warn('[ClipboardService] 复制的内容无效');
    onError?.();
    return false;
  }

  // 优先使用现代异步剪贴板 API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      onSuccess?.();
      return true;
    } catch (error) {
      console.warn('[ClipboardService] 异步剪贴板 API 失败，尝试回退方案:', error);
      return fallbackCopy(text, onSuccess, onError);
    }
  }

  // 回退到传统方案
  return fallbackCopy(text, onSuccess, onError);
}

/**
 * 传统的剪贴板复制方案 (回退方案)
 *
 * @private
 * @param {string} text - 要复制的文本
 * @param {(() => void) | undefined} onSuccess - 成功回调
 * @param {(() => void) | undefined} onError - 失败回调
 * @returns {boolean} 是否复制成功
 */
function fallbackCopy(text, onSuccess, onError) {
  try {
    // 创建临时 input 元素
    const tmp = document.createElement('input');
    tmp.value = text;
    tmp.style.position = 'absolute';
    tmp.style.left = '-9999px';
    tmp.style.top = '-9999px';

    document.body.appendChild(tmp);

    // 选中并复制
    tmp.select();
    tmp.setSelectionRange(0, text.length); // 兼容移动设备

    const success = document.execCommand('copy');

    // 清理
    document.body.removeChild(tmp);

    if (success) {
      onSuccess?.();
      return true;
    } else {
      throw new Error('execCommand 复制失败');
    }
  } catch (error) {
    console.error('[ClipboardService] 回退方案也失败:', error);
    onError?.();
    return false;
  }
}

/**
 * 从 DOM 元素复制文本到剪贴板
 *
 * @param {string} elementId - 元素 ID
 * @param {ClipboardOptions} [options] - 选项配置
 * @returns {Promise<boolean>} 是否复制成功
 *
 * @example
 * await copyFromElement('subscribeUrl', {
 *   onSuccess: () => showToast('复制成功！', 'success'),
 *   onError: () => showToast('复制失败', 'error')
 * })
 */
export async function copyFromElement(elementId, options = {}) {
  const element = document.getElementById(elementId);

  if (!element) {
    console.warn(`[ClipboardService] 未找到元素 #${elementId}`);
    options.onError?.();
    return false;
  }

  const text = element.textContent || /** @type {any} */(element).value || '';
  return copyToClipboard(text, options);
}

/**
 * 检查剪贴板 API 是否可用
 *
 * @returns {boolean} 是否支持剪贴板 API
 *
 * @example
 * if (isClipboardSupported()) {
 *   console.log('支持剪贴板 API')
 * }
 */
export function isClipboardSupported() {
  return (
    (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') ||
    typeof document.execCommand === 'function'
  );
}

/**
 * 检查是否支持异步剪贴板 API
 *
 * @returns {boolean} 是否支持异步剪贴板 API
 *
 * @example
 * if (isAsyncClipboardSupported()) {
 *   console.log('支持现代异步剪贴板 API')
 * }
 */
export function isAsyncClipboardSupported() {
  return Boolean(
    navigator.clipboard && typeof navigator.clipboard.writeText === 'function'
  );
}

/**
 * 读取剪贴板内容 (需要用户权限)
 *
 * @returns {Promise<string|null>} 剪贴板文本内容
 *
 * @example
 * const text = await readFromClipboard()
 * if (text) {
 *   console.log('剪贴板内容:', text)
 * }
 */
export async function readFromClipboard() {
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
    console.warn('[ClipboardService] 不支持读取剪贴板');
    return null;
  }

  try {
    const text = await navigator.clipboard.readText();
    return text;
  } catch (error) {
    console.error('[ClipboardService] 读取剪贴板失败:', error);
    return null;
  }
}

/**
 * 创建一个带有回调的复制函数
 *
 * @param {() => void} onSuccess - 成功回调
 * @param {() => void} onError - 失败回调
 * @returns {(text: string) => Promise<boolean>} 复制函数
 *
 * @example
 * const copyWithToast = createCopyHandler(
 *   () => showToast('复制成功！', 'success'),
 *   () => showToast('复制失败', 'error')
 * )
 *
 * // 使用
 * await copyWithToast('https://example.com')
 */
export function createCopyHandler(onSuccess, onError) {
  return (text) => copyToClipboard(text, { onSuccess, onError });
}

export default {
  copyToClipboard,
  copyFromElement,
  isClipboardSupported,
  isAsyncClipboardSupported,
  readFromClipboard,
  createCopyHandler,
};
