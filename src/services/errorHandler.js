// @ts-check
/**
 * 错误处理和用户引导系统
 * 提供统一的错误展示、历史记录和新手引导功能
 */

import { escapeHtml } from '../utils/stringUtils.js';
import i18n from './i18n.js';

/**
 * 错误信息定义
 * @typedef {Object} ErrorInfo
 * @property {string} titleKey - 错误标题的 i18n 键
 * @property {string} messageKey - 错误消息的 i18n 键
 * @property {string} solutionKey - 解决方案建议的 i18n 键
 * @property {string} icon - FontAwesome 图标类名
 * @property {'warning'|'error'|'info'} type - 错误类型
 * @property {string} [helpLink] - 可选的帮助链接
 */

/**
 * 错误代码映射表（文案统一走 i18n 字典，保证英/繁/日界面不混中文）
 * @type {Record<string, ErrorInfo>}
 */
const ERROR_CODES = {
  INVALID_UID: {
    titleKey: 'error.invalidUid.title',
    messageKey: 'error.invalidUid.message',
    solutionKey: 'error.invalidUid.solution',
    icon: 'fa-exclamation-triangle',
    type: 'warning',
  },
  USER_NOT_FOUND: {
    titleKey: 'error.userNotFound.title',
    messageKey: 'error.userNotFound.message',
    solutionKey: 'error.userNotFound.solution',
    icon: 'fa-user-times',
    type: 'error',
  },
  PRIVACY_PROTECTED: {
    titleKey: 'error.privacy.title',
    messageKey: 'error.privacy.message',
    solutionKey: 'error.privacy.solution',
    icon: 'fa-lock',
    type: 'error',
    helpLink: 'https://www.bilibili.com/account/privacy',
  },
  RATE_LIMITED: {
    titleKey: 'error.rateLimit.title',
    messageKey: 'error.rateLimit.message',
    solutionKey: 'error.rateLimit.solution',
    icon: 'fa-clock',
    type: 'warning',
  },
  NETWORK_ERROR: {
    titleKey: 'error.network.title',
    messageKey: 'error.network.message',
    solutionKey: 'error.network.solution',
    icon: 'fa-wifi',
    type: 'error',
  },
  SERVER_ERROR: {
    titleKey: 'error.server.title',
    messageKey: 'error.server.message',
    solutionKey: 'error.server.solution',
    icon: 'fa-server',
    type: 'error',
  },
  NO_ANIME_FOUND: {
    titleKey: 'error.noAnime.title',
    messageKey: 'error.noAnime.message',
    solutionKey: 'error.noAnime.solution',
    icon: 'fa-film',
    type: 'info',
  },
};

/**
 * 错误历史记录
 * @typedef {Object} ErrorHistoryItem
 * @property {string} code - 错误代码
 * @property {string|null} message - 自定义错误消息
 * @property {Date} timestamp - 发生时间
 * @property {boolean} resolved - 是否已解决
 */

/**
 * 错误处理器类
 * 负责显示错误弹窗、记录错误历史和分析错误模式
 *
 * @example
 * import { errorHandler } from './services/errorHandler.js'
 *
 * errorHandler.showErrorModal('INVALID_UID')
 * errorHandler.showErrorModal('NETWORK_ERROR', '连接超时')
 */
export class ErrorHandler {
  /**
   * 创建错误处理器实例
   */
  constructor() {
    /**
     * 错误历史记录
     * @type {ErrorHistoryItem[]}
     */
    this.errorHistory = [];

    /**
     * 最大历史记录数
     * @type {number}
     */
    this.maxHistorySize = 10;

    /**
     * 各弹窗的键盘监听（modalId -> handler），关闭时清理
     * @type {Map<string, (event: KeyboardEvent) => void>}
     */
    this._keydownHandlers = new Map();

    /**
     * 打开弹窗前处于焦点的元素，关闭后恢复
     * @type {HTMLElement|null}
     */
    this._lastFocusedElement = null;
  }

  /**
   * 显示错误弹窗
   * 根据错误代码自动显示相应的错误信息和解决方案
   *
   * @param {string} errorCode - 错误代码（来自 ERROR_CODES）
   * @param {string|null} [customMessage=null] - 可选的自定义错误消息
   * @returns {void}
   *
   * @example
   * errorHandler.showErrorModal('INVALID_UID')
   * errorHandler.showErrorModal('NETWORK_ERROR', '连接超时，请稍后再试')
   */
  showErrorModal(errorCode, customMessage = null) {
    const error = ERROR_CODES[errorCode] || ERROR_CODES.SERVER_ERROR;
    if (!error) return;
    const modalId = 'errorModal-' + Date.now();

    // 文案统一从 i18n 字典读取，customMessage 优先覆盖消息正文
    const title = i18n.t(error.titleKey);
    const message = customMessage || i18n.t(error.messageKey);
    const solution = i18n.t(error.solutionKey);
    const closeLabel = escapeHtml(i18n.t('error.close'));
    const helpLinkLabel = escapeHtml(i18n.t('error.helpLink'));

    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'error-modal';
    modal.id = modalId;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', `${modalId}-title`);

    modal.innerHTML = `
      <div class="error-modal-overlay" data-error-modal-action="close"></div>
      <div class="error-modal-content">
        <div class="error-modal-header ${error.type}">
          <i class="fas ${error.icon}"></i>
          <h3 id="${modalId}-title">${escapeHtml(title)}</h3>
          <button class="error-modal-close" data-error-modal-action="close" aria-label="${closeLabel}">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="error-modal-body">
          <p class="error-message">${escapeHtml(message)}</p>
          <div class="error-solution">
            <i class="fas fa-lightbulb"></i>
            <span>${escapeHtml(solution)}</span>
          </div>
          ${
            error.helpLink
              ? `
            <a href="${error.helpLink}" target="_blank" class="error-help-link">
              <i class="fas fa-external-link-alt"></i> ${helpLinkLabel}
            </a>
          `
              : ''
          }
        </div>
        <div class="error-modal-footer">
          <button class="btn-retry" data-error-modal-action="close">
            <i class="fas fa-times"></i> ${closeLabel}
          </button>
        </div>
      </div>
    `;

    this.bindModalEvents(modal, modalId);
    this.bindModalKeyboard(modal, modalId);
    document.body.appendChild(modal);

    // 记住打开前的焦点元素，关闭时恢复（不依赖全局 HTMLElement 构造器）
    const activeElement = /** @type {HTMLElement|null} */ (document.activeElement);
    this._lastFocusedElement =
      activeElement && typeof activeElement.focus === 'function' ? activeElement : null;

    // 添加到历史记录
    this.addToHistory(errorCode, customMessage);

    // 动画显示
    setTimeout(() => {
      modal.classList.add('show');
    }, 10);
  }

  /**
   * 绑定弹窗键盘交互：Escape 关闭、Tab 焦点圈定
   *
   * @param {HTMLElement} modal - 错误弹窗根元素
   * @param {string} modalId - 弹窗 DOM ID
   * @returns {void}
   */
  bindModalKeyboard(modal, modalId) {
    if (!modal || typeof modal.addEventListener !== 'function') return;

    /** @type {(event: KeyboardEvent) => void} */
    const handler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeModal(modalId);
        return;
      }
      if (event.key === 'Tab') {
        this.trapModalFocus(modal, event);
      }
    };

    modal.addEventListener('keydown', handler);
    this._keydownHandlers.set(modalId, handler);
  }

  /**
   * 弹窗内 Tab 焦点圈定：焦点到边界时循环回弹
   *
   * @param {HTMLElement} modal - 错误弹窗根元素
   * @param {KeyboardEvent} event - 键盘事件
   * @returns {void}
   */
  trapModalFocus(modal, event) {
    if (!modal || typeof modal.querySelectorAll !== 'function') return;
    const focusable = modal.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
    if (!focusable || focusable.length === 0) return;
    const first = /** @type {HTMLElement|null} */ (focusable[0] || null);
    const last = /** @type {HTMLElement|null} */ (focusable[focusable.length - 1] || null);
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * 关闭错误弹窗
   * 带动画效果地移除指定的错误弹窗
   *
   * @param {string} modalId - 弹窗的 DOM ID
   * @returns {void}
   *
   * @example
   * errorHandler.closeModal('errorModal-1234567890')
   */
  closeModal(modalId) {
    // 移除键盘监听，避免关闭后仍响应 Escape
    const handler = this._keydownHandlers.get(modalId);
    const modal = document.getElementById(modalId);
    if (modal && handler && typeof modal.removeEventListener === 'function') {
      modal.removeEventListener('keydown', handler);
    }
    this._keydownHandlers.delete(modalId);

    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.remove();
      }, 300);
    }

    // 恢复打开前的焦点
    if (this._lastFocusedElement && typeof this._lastFocusedElement.focus === 'function') {
      this._lastFocusedElement.focus();
    }
    this._lastFocusedElement = null;
  }

  /**
   * 绑定错误弹窗事件委托
   * 避免内联 onclick，统一处理弹窗关闭操作。
   *
   * @param {HTMLElement} modal - 错误弹窗根元素
   * @param {string} modalId - 弹窗 DOM ID
   * @returns {void}
   */
  bindModalEvents(modal, modalId) {
    if (!modal || typeof modal.addEventListener !== 'function') return;

    modal.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const actionEl = target
        ? /** @type {HTMLElement|null} */ (target.closest('[data-error-modal-action]'))
        : null;
      if (!actionEl || actionEl.dataset.errorModalAction !== 'close') return;
      this.closeModal(modalId);
    });
  }

  /**
   * 添加错误到历史记录
   * 将错误记录添加到历史数组并保存到 localStorage
   *
   * @param {string} errorCode - 错误代码
   * @param {string|null} message - 自定义错误消息
   * @returns {void}
   *
   * @example
   * errorHandler.addToHistory('INVALID_UID', null)
   */
  addToHistory(errorCode, message) {
    this.errorHistory.unshift({
      code: errorCode,
      message: message,
      timestamp: new Date(),
      resolved: false,
    });

    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.pop();
    }

    this.saveToLocalStorage();
  }

  /**
   * 保存错误历史到 localStorage
   * 将错误历史记录持久化存储
   *
   * @returns {void}
   *
   * @example
   * errorHandler.saveToLocalStorage()
   */
  saveToLocalStorage() {
    try {
      localStorage.setItem('errorHistory', JSON.stringify(this.errorHistory));
    } catch (e) {
      console.warn('⚠️ 无法保存错误历史:', e);
    }
  }

  /**
   * 从 localStorage 加载错误历史
   * 恢复之前保存的错误记录
   *
   * @returns {void}
   *
   * @example
   * errorHandler.loadFromLocalStorage()
   */
  loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem('errorHistory');
      if (saved) {
        this.errorHistory = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('⚠️ 无法加载错误历史:', e);
    }
  }

  /**
   * 分析错误模式
   * 检测最近是否有相同错误频繁出现
   *
   * @returns {string|null} 返回模式建议或 null
   *
   * @example
   * const advice = errorHandler.analyzeErrorPattern()
   * if (advice) {
   *   console.log('建议:', advice)
   * }
   */
  analyzeErrorPattern() {
    const recentErrors = this.errorHistory.slice(0, 5);
    /** @type {Record<string, number>} */
    const errorCounts = {};

    recentErrors.forEach((error) => {
      errorCounts[error.code] = (errorCounts[error.code] || 0) + 1;
    });

    // 如果同一错误频繁出现，提供额外建议
    for (const [code, count] of Object.entries(errorCounts)) {
      if (count >= 3) {
        return this.getPatternAdvice(code);
      }
    }

    return null;
  }

  /**
   * 获取错误模式建议
   * 根据频繁出现的错误代码提供针对性建议
   *
   * @param {string} errorCode - 错误代码
   * @returns {string|null} 返回建议文本或 null
   *
   * @example
   * const advice = errorHandler.getPatternAdvice('RATE_LIMITED')
   * console.log(advice) // => '您的请求过于频繁...'
   */
  getPatternAdvice(errorCode) {
    /** @type {Record<string, string>} */
    const adviceKeys = {
      RATE_LIMITED: 'error.pattern.rateLimit',
      PRIVACY_PROTECTED: 'error.pattern.privacy',
      NETWORK_ERROR: 'error.pattern.network',
      INVALID_UID: 'error.pattern.invalidUid',
    };

    const key = adviceKeys[errorCode];
    return key ? i18n.t(key) : null;
  }
}

/**
 * 引导步骤定义
 * @typedef {Object} GuideStep
 * @property {string} element - 目标元素的选择器
 * @property {string} title - 步骤标题
 * @property {string} content - 步骤说明内容
 * @property {'top'|'bottom'|'left'|'right'|'bottom-left'} position - 提示框位置
 */

/**
 * 用户引导系统类
 * 提供新手引导功能，帮助用户了解应用的使用方法
 *
 * @example
 * import { userGuide } from './services/errorHandler.js'
 *
 * if (userGuide.shouldShowTour()) {
 *   userGuide.startTour()
 * }
 */
export class UserGuide {
  /**
   * 创建用户引导实例
   */
  constructor() {
    /**
     * 当前步骤索引
     * @type {number}
     */
    this.currentStep = 0;

    /**
     * 引导步骤数组
     * @type {GuideStep[]}
     */
    this.steps = [];

    /**
     * 引导是否激活
     * @type {boolean}
     */
    this.isActive = false;
  }

  /**
   * 初始化引导步骤（推荐版本）
   * 使用正确的选择器初始化引导流程
   *
   * @returns {void}
   *
   * @example
   * userGuide.initTourV2()
   */
  initTourV2() {
    this.steps = [
      {
        element: '#uidInput',
        title: i18n.t('guide.inputUid.title'),
        content: i18n.t('guide.inputUid.content'),
        position: 'bottom',
      },
      {
        element: '.help-text',
        title: i18n.t('guide.findUid.title'),
        content: i18n.t('guide.findUid.content'),
        position: 'top',
      },
      {
        element: '#generateBtn', // Use ID instead of onclick selector
        title: i18n.t('guide.generate.title'),
        content: i18n.t('guide.generate.content'),
        position: 'left',
      },
      {
        element: '.theme-switcher',
        title: i18n.t('guide.theme.title'),
        content: i18n.t('guide.theme.content'),
        position: 'bottom-left',
      },
    ];
  }

  /**
   * 开始引导流程
   * 显示第一个引导步骤并添加遮罩层
   *
   * @returns {void}
   *
   * @example
   * userGuide.startTour()
   */
  startTour() {
    if (this.isActive) return;

    // Re-init steps if needed (call V2)
    this.initTourV2();

    this.isActive = true;
    this.currentStep = 0;
    this.showStep();

    // 添加遮罩
    const overlay = document.createElement('div');
    overlay.className = 'guide-overlay';
    overlay.id = 'guideOverlay';
    document.body.appendChild(overlay);
  }

  /**
   * 显示当前步骤
   * 高亮目标元素并显示提示框
   *
   * @returns {void}
   *
   * @example
   * userGuide.showStep()
   */
  showStep() {
    if (this.currentStep >= this.steps.length) {
      this.endTour();
      return;
    }

    const step = this.steps[this.currentStep];
    if (!step) {
      this.endTour();
      return;
    }
    const element = document.querySelector(step.element);

    if (!element) {
      this.nextStep();
      return;
    }

    // 高亮元素
    element.classList.add('guide-highlight');

    // 创建提示框
    const tooltip = document.createElement('div');
    tooltip.className = 'guide-tooltip';
    tooltip.id = 'guideTooltip';
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-label', i18n.t('guide.step'));

    const stepLabel = escapeHtml(
      i18n.t('guide.stepCount', {
        current: this.currentStep + 1,
        total: this.steps.length,
      })
    );
    const closeLabel = escapeHtml(i18n.t('guide.close'));
    const prevLabel = escapeHtml(i18n.t('guide.prev'));
    const nextLabel = escapeHtml(i18n.t('guide.next'));
    const finishLabel = escapeHtml(i18n.t('guide.finish'));

    tooltip.innerHTML = `
      <div class="guide-tooltip-header">
        <span class="guide-step-number">${stepLabel}</span>
        <button class="guide-close" data-guide-action="end" aria-label="${closeLabel}">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="guide-tooltip-content">
        <h4>${escapeHtml(step.title)}</h4>
        <p>${escapeHtml(step.content)}</p>
      </div>
      <div class="guide-tooltip-footer">
        ${this.currentStep > 0 ? `<button class="guide-prev" data-guide-action="prev">${prevLabel}</button>` : ''}
        ${
          this.currentStep < this.steps.length - 1
            ? `<button class="guide-next" data-guide-action="next">${nextLabel}</button>`
            : `<button class="guide-finish" data-guide-action="end">${finishLabel}</button>`
        }
      </div>
    `;

    this.bindTooltipEvents(tooltip);
    document.body.appendChild(tooltip);

    // 定位提示框
    this.positionTooltip(element, tooltip, step.position);
  }

  /**
   * 定位提示框位置
   * 根据目标元素和指定位置计算提示框坐标
   *
   * @param {Element} element - 目标元素
   * @param {HTMLElement} tooltip - 提示框元素
   * @param {'top'|'bottom'|'left'|'right'|'bottom-left'} position - 提示框位置
   * @returns {void}
   *
   * @example
   * userGuide.positionTooltip(targetElement, tooltipElement, 'bottom')
   */
  positionTooltip(element, tooltip, position) {
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let top, left;

    switch (position) {
      case 'top':
        top = rect.top - tooltipRect.height - 10;
        left = rect.left + (rect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = rect.bottom + 10;
        left = rect.left + (rect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = rect.top + (rect.height - tooltipRect.height) / 2;
        left = rect.left - tooltipRect.width - 10;
        break;
      case 'right':
        top = rect.top + (rect.height - tooltipRect.height) / 2;
        left = rect.right + 10;
        break;
      case 'bottom-left':
        top = rect.bottom + 10;
        left = rect.left;
        break;
      default:
        top = rect.bottom + 10;
        left = rect.left;
    }

    // 确保不超出视口
    top = Math.max(10, Math.min(top, window.innerHeight - tooltipRect.height - 10));
    left = Math.max(10, Math.min(left, window.innerWidth - tooltipRect.width - 10));

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  /**
   * 绑定引导提示框事件委托
   * 根据 data-guide-action 分发引导按钮操作。
   *
   * @param {HTMLElement} tooltip - 引导提示框根元素
   * @returns {void}
   */
  bindTooltipEvents(tooltip) {
    if (!tooltip || typeof tooltip.addEventListener !== 'function') return;

    tooltip.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const actionEl = target
        ? /** @type {HTMLElement|null} */ (target.closest('[data-guide-action]'))
        : null;
      if (!actionEl) return;

      const action = actionEl.dataset.guideAction;
      if (action === 'prev') {
        this.prevStep();
      } else if (action === 'next') {
        this.nextStep();
      } else if (action === 'end') {
        this.endTour();
      }
    });
  }

  /**
   * 显示下一个步骤
   * 清除当前步骤并显示下一个
   *
   * @returns {void}
   *
   * @example
   * userGuide.nextStep()
   */
  nextStep() {
    this.clearStep();
    this.currentStep++;
    this.showStep();
  }

  /**
   * 显示上一个步骤
   * 清除当前步骤并显示上一个
   *
   * @returns {void}
   *
   * @example
   * userGuide.prevStep()
   */
  prevStep() {
    this.clearStep();
    this.currentStep--;
    this.showStep();
  }

  /**
   * 清除当前步骤的UI元素
   * 移除高亮和提示框
   *
   * @returns {void}
   *
   * @example
   * userGuide.clearStep()
   */
  clearStep() {
    // 移除高亮
    document.querySelectorAll('.guide-highlight').forEach((el) => {
      el.classList.remove('guide-highlight');
    });

    // 移除提示框
    const tooltip = document.getElementById('guideTooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }

  /**
   * 结束引导流程
   * 清除所有UI元素并标记引导为已完成
   *
   * @returns {void}
   *
   * @example
   * userGuide.endTour()
   */
  endTour() {
    this.clearStep();
    this.isActive = false;

    // 移除遮罩
    const overlay = document.getElementById('guideOverlay');
    if (overlay) {
      overlay.remove();
    }

    // 记录已完成引导
    localStorage.setItem('tourCompleted', 'true');
  }

  /**
   * 检查是否需要显示引导
   * 基于 localStorage 判断用户是否已完成引导
   *
   * @returns {boolean} 需要显示返回 true，否则返回 false
   *
   * @example
   * if (userGuide.shouldShowTour()) {
   *   userGuide.startTour()
   * }
   */
  shouldShowTour() {
    return !localStorage.getItem('tourCompleted');
  }
}

// 创建全局实例
const errorHandler = new ErrorHandler();
const userGuide = new UserGuide();

export { errorHandler, userGuide };
