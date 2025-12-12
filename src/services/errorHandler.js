// @ts-check
/**
 * 错误处理和用户引导系统
 * 提供统一的错误展示、历史记录和新手引导功能
 */

import { escapeHtml } from '../utils/stringUtils.js';

/**
 * 错误信息定义
 * @typedef {Object} ErrorInfo
 * @property {string} title - 错误标题
 * @property {string} message - 错误消息
 * @property {string} solution - 解决方案建议
 * @property {string} icon - FontAwesome 图标类名
 * @property {'warning'|'error'|'info'} type - 错误类型
 * @property {string} [helpLink] - 可选的帮助链接
 */

/**
 * 错误代码映射表
 * @type {Object.<string, ErrorInfo>}
 */
const ERROR_CODES = {
  INVALID_UID: {
    title: 'UID格式错误',
    message: '请输入有效的B站用户ID',
    solution: 'UID应该是纯数字，例如：672328094',
    icon: 'fa-exclamation-triangle',
    type: 'warning',
  },
  USER_NOT_FOUND: {
    title: '用户不存在',
    message: '未找到该用户的B站账号',
    solution: '请检查UID是否正确，可以在B站个人空间网址中找到',
    icon: 'fa-user-times',
    type: 'error',
  },
  PRIVACY_PROTECTED: {
    title: '隐私保护',
    message: '该用户的追番列表设置为隐私',
    solution: '需要用户在B站设置中将追番列表设为公开',
    icon: 'fa-lock',
    type: 'error',
    helpLink: 'https://www.bilibili.com/account/privacy',
  },
  RATE_LIMITED: {
    title: '请求频率限制',
    message: '请求过于频繁，请稍后再试',
    solution: '请等待几分钟后再尝试',
    icon: 'fa-clock',
    type: 'warning',
  },
  NETWORK_ERROR: {
    title: '网络连接错误',
    message: '无法连接到服务器',
    solution: '请检查您的网络连接或稍后再试',
    icon: 'fa-wifi',
    type: 'error',
  },
  SERVER_ERROR: {
    title: '服务器错误',
    message: '服务器处理请求时发生错误',
    solution: '这可能是临时问题，请稍后再试',
    icon: 'fa-server',
    type: 'error',
  },
  NO_ANIME_FOUND: {
    title: '未找到追番记录',
    message: '该用户没有追番记录',
    solution: '请确认用户已在B站追番，或尝试其他UID',
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
    const modalId = 'errorModal-' + Date.now();

    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'error-modal';
    modal.id = modalId;

    modal.innerHTML = `
      <div class="error-modal-overlay" onclick="errorHandler.closeModal('${modalId}')"></div>
      <div class="error-modal-content">
        <div class="error-modal-header ${error.type}">
          <i class="fas ${error.icon}"></i>
          <h3>${escapeHtml(error.title)}</h3>
          <button class="error-modal-close" onclick="errorHandler.closeModal('${modalId}')">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="error-modal-body">
          <p class="error-message">${escapeHtml(customMessage || error.message)}</p>
          <div class="error-solution">
            <i class="fas fa-lightbulb"></i>
            <span>${escapeHtml(error.solution)}</span>
          </div>
          ${
            error.helpLink
              ? `
            <a href="${error.helpLink}" target="_blank" class="error-help-link">
              <i class="fas fa-external-link-alt"></i> 查看帮助文档
            </a>
          `
              : ''
          }
        </div>
        <div class="error-modal-footer">
          <button class="btn-retry" onclick="errorHandler.closeModal('${modalId}')">
            <i class="fas fa-times"></i> 关闭
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 添加到历史记录
    this.addToHistory(errorCode, customMessage);

    // 动画显示
    setTimeout(() => {
      modal.classList.add('show');
    }, 10);
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
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.remove();
      }, 300);
    }
  }

  // 已删除重试操作，现在只保留关闭功能

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
      console.warn('无法保存错误历史:', e);
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
      console.warn('无法加载错误历史:', e);
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
    const advice = {
      RATE_LIMITED: '您的请求过于频繁，建议降低请求频率或联系管理员增加限额',
      PRIVACY_PROTECTED: '多个用户的追番列表都是隐私的，这是B站的默认设置',
      NETWORK_ERROR: '持续的网络错误，请检查防火墙设置或代理配置',
      INVALID_UID: '请确保输入的是数字UID，不是用户名或其他标识',
    };

    return advice[errorCode] || null;
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
   * 初始化引导步骤（旧版本）
   * @deprecated 使用 initTourV2 代替
   * @returns {void}
   */
  initTour() {
    this.steps = [
      {
        element: '#uidInput',
        title: '输入UID',
        content: '在这里输入您的B站用户ID（UID）',
        position: 'bottom',
      },
      {
        element: '.help-text',
        title: '查找UID',
        content: 'UID可以在您的B站个人空间网址中找到',
        position: 'top',
      },
      {
        element: 'button[onclick="handleSubscribe()"]', // This selector might fail if handleSubscribe is not global.
        // But wait, I don't use onclick in HTML for generateBtn. I use id="generateBtn".
        // So I should update this selector.
        title: '生成订阅',
        content: '点击这个按钮生成您的追番日历订阅链接',
        position: 'left',
      },
      {
        element: '.theme-switcher',
        title: '主题切换',
        content: '点击这里可以切换亮色/暗色主题',
        position: 'bottom-left',
      },
    ];
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
        title: '输入UID',
        content: '在这里输入您的B站用户ID（UID）',
        position: 'bottom',
      },
      {
        element: '.help-text',
        title: '查找UID',
        content: 'UID可以在您的B站个人空间网址中找到',
        position: 'top',
      },
      {
        element: '#generateBtn', // Use ID instead of onclick selector
        title: '生成订阅',
        content: '点击这个按钮生成您的追番日历订阅链接',
        position: 'left',
      },
      {
        element: '.theme-switcher',
        title: '主题切换',
        content: '点击这里可以切换亮色/暗色主题',
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

    tooltip.innerHTML = `
      <div class="guide-tooltip-header">
        <span class="guide-step-number">步骤 ${this.currentStep + 1}/${this.steps.length}</span>
        <button class="guide-close" onclick="userGuide.endTour()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="guide-tooltip-content">
        <h4>${escapeHtml(step.title)}</h4>
        <p>${escapeHtml(step.content)}</p>
      </div>
      <div class="guide-tooltip-footer">
        ${this.currentStep > 0 ? '<button class="guide-prev" onclick="userGuide.prevStep()">上一步</button>' : ''}
        ${
          this.currentStep < this.steps.length - 1
            ? '<button class="guide-next" onclick="userGuide.nextStep()">下一步</button>'
            : '<button class="guide-finish" onclick="userGuide.endTour()">完成</button>'
        }
      </div>
    `;

    document.body.appendChild(tooltip);

    // 定位提示框
    this.positionTooltip(element, tooltip, step.position);
  }

  /**
   * 定位提示框位置
   * 根据目标元素和指定位置计算提示框坐标
   *
   * @param {Element} element - 目标元素
   * @param {Element} tooltip - 提示框元素
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
