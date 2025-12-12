// @ts-check
/**
 * 加载遮罩服务
 * 提供全屏加载遮罩显示、文本更新和隐藏功能
 */

/**
 * 加载遮罩控制器接口
 * @typedef {Object} LoadingController
 * @property {() => void} hide - 隐藏加载遮罩
 * @property {(text: string) => void} updateText - 更新加载文本
 */

/**
 * 显示加载遮罩
 *
 * @param {string} text - 加载文本，默认使用国际化文本
 * @returns {LoadingController} 加载遮罩控制器
 *
 * @example
 * import { showLoadingOverlay } from './services/loadingService.js'
 *
 * const loading = showLoadingOverlay('正在处理...')
 *
 * // 更新文本
 * loading.updateText('正在生成日历文件...')
 *
 * // 隐藏
 * loading.hide()
 */
export function showLoadingOverlay(text = '处理中...') {
  const overlay = document.getElementById('loadingOverlay');

  if (!overlay) {
    console.warn('[LoadingService] 未找到加载遮罩元素 #loadingOverlay');
    return createDummyController();
  }

  const loadingText = /** @type {HTMLElement | null} */ (
    overlay.querySelector('.loading-text')
  );

  if (!loadingText) {
    console.warn('[LoadingService] 未找到加载文本元素 .loading-text');
    return createDummyController();
  }

  // 设置文本并显示
  loadingText.textContent = text;
  overlay.classList.add('active');

  // 返回控制器
  return {
    hide: () => hideLoadingOverlay(overlay),
    updateText: (newText) => updateLoadingText(loadingText, newText),
  };
}

/**
 * 隐藏加载遮罩
 *
 * @private
 * @param {HTMLElement} overlay - 加载遮罩元素
 */
function hideLoadingOverlay(overlay) {
  overlay.classList.remove('active');
}

/**
 * 更新加载文本
 *
 * @private
 * @param {HTMLElement} textElement - 文本元素
 * @param {string} text - 新文本
 */
function updateLoadingText(textElement, text) {
  textElement.textContent = text;
}

/**
 * 创建空的控制器 (当元素不存在时)
 *
 * @private
 * @returns {LoadingController} 空控制器
 */
function createDummyController() {
  return {
    hide: () => {},
    updateText: () => {},
  };
}

/**
 * 直接隐藏加载遮罩 (不需要控制器)
 *
 * @example
 * hideLoading()
 */
export function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

/**
 * 显示带有自动隐藏的加载遮罩
 *
 * @param {string} text - 加载文本
 * @param {number} duration - 显示时长 (毫秒)
 * @returns {LoadingController} 加载遮罩控制器
 *
 * @example
 * showLoadingWithTimeout('正在加载...', 3000)
 * // 3秒后自动隐藏
 */
export function showLoadingWithTimeout(text, duration = 3000) {
  const controller = showLoadingOverlay(text);

  setTimeout(() => {
    controller.hide();
  }, duration);

  return controller;
}

/**
 * 检查加载遮罩是否正在显示
 *
 * @returns {boolean} 是否正在显示
 *
 * @example
 * if (isLoadingVisible()) {
 *   console.log('加载遮罩正在显示')
 * }
 */
export function isLoadingVisible() {
  const overlay = document.getElementById('loadingOverlay');
  return overlay ? overlay.classList.contains('active') : false;
}

export default {
  showLoadingOverlay,
  hideLoading,
  showLoadingWithTimeout,
  isLoadingVisible,
};
