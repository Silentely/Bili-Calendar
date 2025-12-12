// @ts-check
/**
 * 进度条服务
 * 提供进度条显示、模拟进度、完成与错误状态管理
 */

/**
 * 进度条配置
 * @private
 */
const PROGRESS_CONFIG = {
  simulationInterval: 300, // 模拟进度更新间隔: 300ms
  maxSimulatedProgress: 90, // 模拟进度最大值: 90%
  minProgressStep: 0, // 最小进度增量
  maxProgressStep: 30, // 最大进度增量
  completeDelay: 500, // 完成后隐藏延迟: 500ms
};

/**
 * 进度条控制器接口
 * @typedef {Object} ProgressController
 * @property {() => void} complete - 完成进度条
 * @property {() => void} error - 进度条错误状态
 * @property {(percent: number) => void} setProgress - 手动设置进度
 */

/**
 * 显示进度条并开始模拟进度
 *
 * @returns {ProgressController} 进度条控制器
 *
 * @example
 * const progress = showProgressBar()
 *
 * // 请求成功后完成进度条
 * setTimeout(() => {
 *   progress.complete()
 * }, 2000)
 *
 * // 或者在出错时显示错误状态
 * setTimeout(() => {
 *   progress.error()
 * }, 2000)
 */
export function showProgressBar() {
  const progressBar = document.getElementById('progressBar');
  const progressFill = /** @type {HTMLElement | null} */ (
    progressBar?.querySelector('.progress-bar')
  );

  if (!progressBar || !progressFill) {
    console.warn('[ProgressService] 未找到进度条元素 #progressBar 或 .progress-bar');
    return createDummyController();
  }

  // 显示进度条
  progressBar.classList.add('active');
  progressFill.style.width = '0%';

  // 启动进度模拟
  const intervalId = startProgressSimulation(progressFill);

  // 返回控制器
  return {
    complete: () => completeProgressBar(progressFill, progressBar, intervalId),
    error: () => errorProgressBar(progressBar, intervalId),
    setProgress: (percent) => setProgress(progressFill, percent),
  };
}

/**
 * 开始模拟进度 (自动增长)
 *
 * @private
 * @param {HTMLElement} progressFill - 进度条填充元素
 * @returns {ReturnType<typeof setInterval>} 定时器 ID
 */
function startProgressSimulation(progressFill) {
  let progress = 0;

  return setInterval(() => {
    // 随机增量 (0-30)
    const increment =
      Math.random() *
      (PROGRESS_CONFIG.maxProgressStep - PROGRESS_CONFIG.minProgressStep) +
      PROGRESS_CONFIG.minProgressStep;

    progress += increment;

    // 限制最大进度为 90%
    if (progress > PROGRESS_CONFIG.maxSimulatedProgress) {
      progress = PROGRESS_CONFIG.maxSimulatedProgress;
    }

    progressFill.style.width = `${progress}%`;
  }, PROGRESS_CONFIG.simulationInterval);
}

/**
 * 完成进度条 (设置为 100% 并隐藏)
 *
 * @private
 * @param {HTMLElement} progressFill - 进度条填充元素
 * @param {HTMLElement} progressBar - 进度条容器
 * @param {ReturnType<typeof setInterval> | null} intervalId - 定时器 ID
 */
function completeProgressBar(progressFill, progressBar, intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
  }

  // 设置为 100%
  progressFill.style.width = '100%';

  // 延迟隐藏
  setTimeout(() => {
    progressBar.classList.remove('active');
  }, PROGRESS_CONFIG.completeDelay);
}

/**
 * 进度条错误状态 (立即隐藏)
 *
 * @private
 * @param {HTMLElement} progressBar - 进度条容器
 * @param {ReturnType<typeof setInterval> | null} intervalId - 定时器 ID
 */
function errorProgressBar(progressBar, intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
  }
  progressBar.classList.remove('active');
}

/**
 * 手动设置进度
 *
 * @private
 * @param {HTMLElement} progressFill - 进度条填充元素
 * @param {number} percent - 进度百分比 (0-100)
 */
function setProgress(progressFill, percent) {
  const validPercent = Math.max(0, Math.min(100, percent));
  progressFill.style.width = `${validPercent}%`;
}

/**
 * 创建空的控制器 (当元素不存在时)
 *
 * @private
 * @returns {ProgressController} 空控制器
 */
function createDummyController() {
  return {
    complete: () => {},
    error: () => {},
    setProgress: () => {},
  };
}

/**
 * 显示确定的进度条 (不自动增长)
 *
 * @returns {ProgressController} 进度条控制器
 *
 * @example
 * const progress = showDeterminateProgress()
 *
 * // 手动更新进度
 * progress.setProgress(25)
 * progress.setProgress(50)
 * progress.setProgress(75)
 * progress.setProgress(100)
 *
 * // 完成
 * progress.complete()
 */
export function showDeterminateProgress() {
  const progressBar = document.getElementById('progressBar');
  const progressFill = /** @type {HTMLElement | null} */ (
    progressBar?.querySelector('.progress-bar')
  );

  if (!progressBar || !progressFill) {
    console.warn('[ProgressService] 未找到进度条元素 #progressBar 或 .progress-bar');
    return createDummyController();
  }

  // 显示进度条
  progressBar.classList.add('active');
  progressFill.style.width = '0%';

  // 返回控制器 (不启动自动模拟)
  return {
    complete: () => completeProgressBar(progressFill, progressBar, null),
    error: () => errorProgressBar(progressBar, null),
    setProgress: (percent) => setProgress(progressFill, percent),
  };
}

/**
 * 隐藏进度条
 *
 * @example
 * hideProgressBar()
 */
export function hideProgressBar() {
  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    progressBar.classList.remove('active');
  }
}

export default {
  showProgressBar,
  showDeterminateProgress,
  hideProgressBar,
};
