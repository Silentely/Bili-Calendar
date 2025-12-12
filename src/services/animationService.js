// @ts-check
/**
 * 结果动画服务
 * 提供成功/失败动画的显示功能
 */

/**
 * 动画配置
 * @private
 */
const ANIMATION_CONFIG = {
  duration: 1500, // 动画显示时长: 1.5秒
  className: 'result-animation',
};

/**
 * 显示结果动画 (成功或失败)
 *
 * @param {boolean} success - 是否为成功动画
 * @returns {HTMLElement} 动画元素
 *
 * @example
 * import { showResultAnimation } from './services/animationService.js'
 *
 * // 显示成功动画
 * showResultAnimation(true)
 *
 * // 显示失败动画
 * showResultAnimation(false)
 */
export function showResultAnimation(success = true) {
  const animation = createAnimationElement(success);

  document.body.appendChild(animation);

  // 自动移除
  setTimeout(() => {
    if (animation.parentNode) {
      animation.remove();
    }
  }, ANIMATION_CONFIG.duration);

  return animation;
}

/**
 * 创建动画 DOM 元素
 *
 * @private
 * @param {boolean} success - 是否为成功动画
 * @returns {HTMLElement} 动画元素
 */
function createAnimationElement(success) {
  const animation = document.createElement('div');
  animation.className = ANIMATION_CONFIG.className;

  if (success) {
    animation.innerHTML = '<div class="success-checkmark"></div>';
  } else {
    animation.innerHTML = '<div class="error-cross"></div>';
  }

  return animation;
}

/**
 * 显示成功动画
 *
 * @returns {HTMLElement} 动画元素
 *
 * @example
 * showSuccessAnimation()
 */
export function showSuccessAnimation() {
  return showResultAnimation(true);
}

/**
 * 显示失败动画
 *
 * @returns {HTMLElement} 动画元素
 *
 * @example
 * showErrorAnimation()
 */
export function showErrorAnimation() {
  return showResultAnimation(false);
}

/**
 * 显示自定义动画
 *
 * @param {string} html - 动画 HTML 内容
 * @param {number} duration - 显示时长 (毫秒)
 * @returns {HTMLElement} 动画元素
 *
 * @example
 * showCustomAnimation('<div class="custom-icon">⭐</div>', 2000)
 */
export function showCustomAnimation(html, duration = ANIMATION_CONFIG.duration) {
  const animation = document.createElement('div');
  animation.className = ANIMATION_CONFIG.className;
  animation.innerHTML = html;

  document.body.appendChild(animation);

  setTimeout(() => {
    if (animation.parentNode) {
      animation.remove();
    }
  }, duration);

  return animation;
}

/**
 * 清除所有正在显示的动画
 *
 * @example
 * clearAllAnimations()
 */
export function clearAllAnimations() {
  const animations = document.querySelectorAll(`.${ANIMATION_CONFIG.className}`);
  animations.forEach((animation) => animation.remove());
}

/**
 * 显示加载中的圆圈动画 (实验性功能)
 *
 * @param {number} [duration] - 显示时长 (毫秒)，不指定则持续显示直到手动清除
 * @returns {() => void} 清除函数
 *
 * @example
 * const clear = showLoadingAnimation()
 *
 * // 手动清除
 * setTimeout(() => {
 *   clear()
 * }, 3000)
 */
export function showLoadingAnimation(duration) {
  const animation = document.createElement('div');
  animation.className = `${ANIMATION_CONFIG.className} loading-spinner`;
  animation.innerHTML = '<div class="spinner"></div>';

  document.body.appendChild(animation);

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timeoutId;
  if (duration) {
    timeoutId = setTimeout(() => {
      if (animation.parentNode) {
        animation.remove();
      }
    }, duration);
  }

  // 返回清除函数
  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (animation.parentNode) {
      animation.remove();
    }
  };
}

export default {
  showResultAnimation,
  showSuccessAnimation,
  showErrorAnimation,
  showCustomAnimation,
  clearAllAnimations,
  showLoadingAnimation,
};
