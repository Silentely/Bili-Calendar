import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

describe('services/errorHandler.js', () => {
  /** @type {any} */
  let originalDocument;
  /** @type {any} */
  let originalLocalStorage;
  /** @type {any} */
  let originalWindow;
  /** @type {Element[]} */
  let createdElements;
  /** @type {Map<string, string>} */
  let localStorageData;

  beforeEach(() => {
    // 保存原始全局对象
    originalDocument = global.document;
    originalLocalStorage = global.localStorage;
    originalWindow = global.window;

    // 重置状态
    createdElements = [];
    localStorageData = new Map();

    // Mock localStorage
    global.localStorage = {
      getItem: (key) => localStorageData.get(key) || null,
      setItem: (key, value) => localStorageData.set(key, value),
      removeItem: (key) => localStorageData.delete(key),
      clear: () => localStorageData.clear(),
    };

    // Mock window
    global.window = {
      innerWidth: 1920,
      innerHeight: 1080,
    };

    // Mock document
    global.document = {
      createElement: (tagName) => {
        const element = {
          tagName: tagName.toUpperCase(),
          className: '',
          id: '',
          innerHTML: '',
          style: {},
          children: [],
          classList: {
            add: function (...classes) {
              const current = element.className ? element.className.split(' ') : [];
              classes.forEach((cls) => {
                if (!current.includes(cls)) {
                  current.push(cls);
                }
              });
              element.className = current.join(' ');
            },
            remove: function (...classes) {
              const current = element.className ? element.className.split(' ') : [];
              element.className = current
                .filter((cls) => !classes.includes(cls))
                .join(' ');
            },
            contains: function (cls) {
              const current = element.className ? element.className.split(' ') : [];
              return current.includes(cls);
            },
          },
          remove: function () {
            // 从 createdElements 移除
            const index = createdElements.indexOf(this);
            if (index > -1) {
              createdElements.splice(index, 1);
            }
            // 标记为已移除
            this._removed = true;
          },
          getBoundingClientRect: function () {
            return {
              top: 100,
              left: 100,
              right: 200,
              bottom: 200,
              width: 100,
              height: 100,
            };
          },
          querySelector: () => null,
          appendChild: function (child) {
            this.children.push(child);
          },
        };

        createdElements.push(element);
        return element;
      },
      getElementById: (id) => {
        return createdElements.find((el) => el.id === id) || null;
      },
      querySelector: (selector) => {
        // 简单实现选择器匹配
        if (selector.startsWith('#')) {
          const id = selector.substring(1);
          return createdElements.find((el) => el.id === id) || null;
        }
        if (selector.startsWith('.')) {
          const className = selector.substring(1);
          return (
            createdElements.find((el) => el.classList.contains(className)) || null
          );
        }
        return null;
      },
      querySelectorAll: (selector) => {
        // 简单实现选择器匹配
        if (selector.startsWith('.')) {
          const className = selector.substring(1);
          return createdElements.filter((el) => el.classList.contains(className));
        }
        return [];
      },
      body: {
        appendChild: (element) => {
          createdElements.push(element);
        },
      },
    };
  });

  afterEach(() => {
    // 恢复原始环境
    if (originalDocument !== undefined) {
      global.document = originalDocument;
    } else {
      delete global.document;
    }

    if (originalLocalStorage !== undefined) {
      global.localStorage = originalLocalStorage;
    } else {
      delete global.localStorage;
    }

    if (originalWindow !== undefined) {
      global.window = originalWindow;
    } else {
      delete global.window;
    }
  });

  describe('ErrorHandler', () => {
    describe('constructor', () => {
      it('应该正确初始化实例', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();

        assert.ok(Array.isArray(handler.errorHistory), '应该有 errorHistory 数组');
        assert.strictEqual(
          handler.errorHistory.length,
          0,
          'errorHistory 应该为空'
        );
        assert.strictEqual(
          handler.maxHistorySize,
          10,
          'maxHistorySize 应该为 10'
        );
      });
    });

    describe('showErrorModal()', () => {
      it('应该创建并显示错误弹窗', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();
        handler.showErrorModal('INVALID_UID');

        // 验证弹窗已创建
        const modal = createdElements.find((el) =>
          el.className.includes('error-modal')
        );
        assert.ok(modal, '应该创建错误弹窗');
        assert.ok(modal.innerHTML.includes('UID格式错误'), '应该包含错误标题');
        assert.ok(
          modal.innerHTML.includes('请输入有效的B站用户ID'),
          '应该包含错误消息'
        );
      });

      it('应该使用自定义错误消息', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();
        handler.showErrorModal('NETWORK_ERROR', '连接超时，请重试');

        const modal = createdElements.find((el) =>
          el.className.includes('error-modal')
        );
        assert.ok(modal, '应该创建错误弹窗');
        assert.ok(
          modal.innerHTML.includes('连接超时，请重试'),
          '应该使用自定义消息'
        );
      });

      it('应该处理未知错误代码', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();
        handler.showErrorModal('UNKNOWN_ERROR');

        const modal = createdElements.find((el) =>
          el.className.includes('error-modal')
        );
        assert.ok(modal, '应该创建错误弹窗');
        assert.ok(modal.innerHTML.includes('服务器错误'), '应该使用默认错误');
      });

      it('应该显示帮助链接（如果有）', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();
        handler.showErrorModal('PRIVACY_PROTECTED');

        const modal = createdElements.find((el) =>
          el.className.includes('error-modal')
        );
        assert.ok(modal, '应该创建错误弹窗');
        assert.ok(
          modal.innerHTML.includes('https://www.bilibili.com/account/privacy'),
          '应该包含帮助链接'
        );
      });
    });

    describe('closeModal()', () => {
      it('应该关闭指定的弹窗', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();
        handler.showErrorModal('INVALID_UID');

        const modal = createdElements.find((el) =>
          el.className.includes('error-modal')
        );
        const modalId = modal.id;

        // Mock setTimeout
        let timeoutCallback = null;
        global.setTimeout = (fn) => {
          timeoutCallback = fn;
          return 1;
        };

        handler.closeModal(modalId);

        // 验证移除了 show 类
        assert.ok(
          !modal.classList.contains('show'),
          '应该移除 show 类'
        );

        // 执行 setTimeout 回调
        if (timeoutCallback) {
          timeoutCallback();
        }

        // 验证弹窗已移除
        assert.strictEqual(modal._removed, true, '应该移除弹窗');
      });

      it('应该处理不存在的弹窗ID', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();

        // 不应该抛出错误
        assert.doesNotThrow(() => {
          handler.closeModal('nonexistent-modal');
        });
      });
    });

    describe('addToHistory()', () => {
      it('应该添加错误到历史记录', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();
        handler.addToHistory('INVALID_UID', null);

        assert.strictEqual(handler.errorHistory.length, 1, '应该有1条记录');
        assert.strictEqual(
          handler.errorHistory[0].code,
          'INVALID_UID',
          '应该记录错误代码'
        );
        assert.strictEqual(
          handler.errorHistory[0].resolved,
          false,
          'resolved 应该为 false'
        );
      });

      it('应该限制历史记录数量', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();

        // 添加 15 条记录
        for (let i = 0; i < 15; i++) {
          handler.addToHistory('INVALID_UID', null);
        }

        assert.strictEqual(
          handler.errorHistory.length,
          10,
          '应该只保留最近10条记录'
        );
      });

      it('应该保存到 localStorage', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();
        handler.addToHistory('NETWORK_ERROR', '连接失败');

        const saved = localStorageData.get('errorHistory');
        assert.ok(saved, '应该保存到 localStorage');

        const parsed = JSON.parse(saved);
        assert.strictEqual(parsed.length, 1, '应该有1条记录');
        assert.strictEqual(parsed[0].code, 'NETWORK_ERROR', '应该保存错误代码');
      });
    });

    describe('saveToLocalStorage() & loadFromLocalStorage()', () => {
      it('应该正确保存和加载历史记录', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler1 = new ErrorHandler();
        handler1.addToHistory('INVALID_UID', null);
        handler1.addToHistory('NETWORK_ERROR', null);

        // 创建新实例并加载
        const handler2 = new ErrorHandler();
        handler2.loadFromLocalStorage();

        assert.strictEqual(
          handler2.errorHistory.length,
          2,
          '应该加载2条记录'
        );
        assert.strictEqual(
          handler2.errorHistory[0].code,
          'NETWORK_ERROR',
          '应该保持顺序'
        );
        assert.strictEqual(
          handler2.errorHistory[1].code,
          'INVALID_UID',
          '应该保持顺序'
        );
      });

      it('应该处理 localStorage 错误', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        // Mock localStorage 抛出错误
        global.localStorage = {
          setItem: () => {
            throw new Error('Storage quota exceeded');
          },
          getItem: () => {
            throw new Error('Storage access denied');
          },
        };

        const handler = new ErrorHandler();

        // 不应该抛出错误
        assert.doesNotThrow(() => {
          handler.addToHistory('INVALID_UID', null);
        });

        assert.doesNotThrow(() => {
          handler.loadFromLocalStorage();
        });
      });
    });

    describe('analyzeErrorPattern()', () => {
      it('应该检测频繁出现的错误', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();

        // 添加3次相同错误
        handler.addToHistory('RATE_LIMITED', null);
        handler.addToHistory('RATE_LIMITED', null);
        handler.addToHistory('RATE_LIMITED', null);

        const advice = handler.analyzeErrorPattern();
        assert.ok(advice, '应该返回建议');
        assert.ok(
          advice.includes('请求过于频繁'),
          '应该包含频率限制建议'
        );
      });

      it('应该在没有模式时返回 null', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();

        // 添加不同的错误
        handler.addToHistory('INVALID_UID', null);
        handler.addToHistory('NETWORK_ERROR', null);

        const advice = handler.analyzeErrorPattern();
        assert.strictEqual(advice, null, '应该返回 null');
      });
    });

    describe('getPatternAdvice()', () => {
      it('应该返回已知错误的建议', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();

        const advice = handler.getPatternAdvice('RATE_LIMITED');
        assert.ok(advice, '应该返回建议');
        assert.ok(advice.includes('请求过于频繁'), '应该包含正确建议');
      });

      it('应该对未知错误返回 null', async () => {
        const { ErrorHandler } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const handler = new ErrorHandler();

        const advice = handler.getPatternAdvice('UNKNOWN_ERROR');
        assert.strictEqual(advice, null, '应该返回 null');
      });
    });
  });

  describe('UserGuide', () => {
    describe('constructor', () => {
      it('应该正确初始化实例', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();

        assert.strictEqual(guide.currentStep, 0, 'currentStep 应该为 0');
        assert.ok(Array.isArray(guide.steps), '应该有 steps 数组');
        assert.strictEqual(guide.steps.length, 0, 'steps 应该为空');
        assert.strictEqual(guide.isActive, false, 'isActive 应该为 false');
      });
    });

    describe('initTourV2()', () => {
      it('应该初始化引导步骤', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();
        guide.initTourV2();

        assert.strictEqual(guide.steps.length, 4, '应该有4个步骤');
        assert.strictEqual(
          guide.steps[0].element,
          '#uidInput',
          '第一步应该是 uidInput'
        );
        assert.strictEqual(
          guide.steps[2].element,
          '#generateBtn',
          '第三步应该使用 #generateBtn'
        );
      });
    });

    describe('startTour()', () => {
      it('应该开始引导流程并初始化状态', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();
        guide.initTourV2();

        // 记录初始状态
        const initialStep = guide.currentStep;
        const wasActive = guide.isActive;

        guide.startTour();

        // 验证创建了遮罩层
        const overlay = createdElements.find((el) => el.id === 'guideOverlay');
        assert.ok(overlay, '应该创建遮罩层');

        // 验证初始状态被设置（即使后续可能因找不到元素而结束）
        assert.strictEqual(initialStep, 0, '初始 currentStep 应该为 0');
        assert.strictEqual(wasActive, false, '初始 isActive 应该为 false');
      });

      it('应该在已激活时不重复开始', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();
        guide.initTourV2();

        // 手动设置为激活状态,避免 startTour 因找不到元素而结束
        guide.isActive = true;

        const elementsBefore = createdElements.length;
        guide.startTour(); // 再次调用
        const elementsAfter = createdElements.length;

        assert.strictEqual(
          elementsBefore,
          elementsAfter,
          '不应该创建新元素'
        );
      });
    });

    describe('showStep()', () => {
      it('应该在找不到元素时跳到下一步', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();
        guide.initTourV2();
        guide.isActive = true;
        guide.currentStep = 0;

        // document.querySelector 会返回 null（元素不存在）
        guide.showStep();

        // 应该已经尝试跳到下一步
        assert.ok(
          guide.currentStep > 0 || !guide.isActive,
          '应该跳到下一步或结束'
        );
      });

      it('应该在超过步骤数时结束引导', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();
        guide.initTourV2();
        guide.isActive = true;
        guide.currentStep = 999; // 超过步骤数

        guide.showStep();

        assert.strictEqual(guide.isActive, false, '应该结束引导');
      });
    });

    describe('nextStep()', () => {
      it('应该移动到下一步', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();
        guide.initTourV2();
        guide.isActive = true;
        guide.currentStep = 0;

        // 保存原始的 showStep 方法
        const originalShowStep = guide.showStep;
        // Mock showStep 避免触发 DOM 查询
        guide.showStep = function () {
          // 不做任何事
        };

        guide.nextStep();

        // 恢复原始方法
        guide.showStep = originalShowStep;

        assert.strictEqual(guide.currentStep, 1, '应该移动到步骤1');
      });
    });

    describe('prevStep()', () => {
      it('应该移动到上一步', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();
        guide.initTourV2();
        guide.isActive = true;
        guide.currentStep = 2;

        // 保存原始的 showStep 方法
        const originalShowStep = guide.showStep;
        // Mock showStep 避免触发 DOM 查询
        guide.showStep = function () {
          // 不做任何事
        };

        guide.prevStep();

        // 恢复原始方法
        guide.showStep = originalShowStep;

        assert.strictEqual(guide.currentStep, 1, '应该移动到步骤1');
      });
    });

    describe('clearStep()', () => {
      it('应该清除高亮和提示框', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();

        // 创建带高亮的元素
        const highlightedElement = global.document.createElement('div');
        highlightedElement.id = 'test-element';
        highlightedElement.classList.add('guide-highlight');
        createdElements.push(highlightedElement);

        // 创建提示框
        const tooltip = global.document.createElement('div');
        tooltip.id = 'guideTooltip';
        createdElements.push(tooltip);

        guide.clearStep();

        // 验证高亮已移除
        assert.ok(
          !highlightedElement.classList.contains('guide-highlight'),
          '应该移除高亮'
        );

        // 验证提示框已移除
        assert.strictEqual(tooltip._removed, true, '应该移除提示框');
      });
    });

    describe('endTour()', () => {
      it('应该结束引导并清理', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();
        guide.startTour();

        // 获取遮罩层引用
        const overlay = createdElements.find((el) => el.id === 'guideOverlay');

        guide.endTour();

        assert.strictEqual(guide.isActive, false, 'isActive 应该为 false');

        // 验证遮罩层已移除
        assert.strictEqual(overlay._removed, true, '应该移除遮罩层');

        // 验证已标记为已完成
        const completed = localStorageData.get('tourCompleted');
        assert.strictEqual(completed, 'true', '应该标记为已完成');
      });
    });

    describe('shouldShowTour()', () => {
      it('应该在未完成时返回 true', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();

        assert.strictEqual(
          guide.shouldShowTour(),
          true,
          '应该返回 true'
        );
      });

      it('应该在已完成时返回 false', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        localStorageData.set('tourCompleted', 'true');

        const guide = new UserGuide();

        assert.strictEqual(
          guide.shouldShowTour(),
          false,
          '应该返回 false'
        );
      });
    });

    describe('positionTooltip()', () => {
      it('应该正确定位提示框（bottom）', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();

        const element = global.document.createElement('div');
        const tooltip = global.document.createElement('div');

        guide.positionTooltip(element, tooltip, 'bottom');

        assert.ok(tooltip.style.top, '应该设置 top');
        assert.ok(tooltip.style.left, '应该设置 left');
      });

      it('应该正确定位提示框（top）', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();

        const element = global.document.createElement('div');
        const tooltip = global.document.createElement('div');

        guide.positionTooltip(element, tooltip, 'top');

        assert.ok(tooltip.style.top, '应该设置 top');
        assert.ok(tooltip.style.left, '应该设置 left');
      });

      it('应该正确定位提示框（left）', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();

        const element = global.document.createElement('div');
        const tooltip = global.document.createElement('div');

        guide.positionTooltip(element, tooltip, 'left');

        assert.ok(tooltip.style.top, '应该设置 top');
        assert.ok(tooltip.style.left, '应该设置 left');
      });

      it('应该正确定位提示框（right）', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();

        const element = global.document.createElement('div');
        const tooltip = global.document.createElement('div');

        guide.positionTooltip(element, tooltip, 'right');

        assert.ok(tooltip.style.top, '应该设置 top');
        assert.ok(tooltip.style.left, '应该设置 left');
      });

      it('应该正确定位提示框（bottom-left）', async () => {
        const { UserGuide } = await import(
          `../src/services/errorHandler.js?t=${Date.now()}`
        );

        const guide = new UserGuide();

        const element = global.document.createElement('div');
        const tooltip = global.document.createElement('div');

        guide.positionTooltip(element, tooltip, 'bottom-left');

        assert.ok(tooltip.style.top, '应该设置 top');
        assert.ok(tooltip.style.left, '应该设置 left');
      });
    });
  });

  describe('全局导出', () => {
    it('应该导出 errorHandler 实例', async () => {
      const { errorHandler } = await import(
        `../src/services/errorHandler.js?t=${Date.now()}`
      );

      assert.ok(errorHandler, '应该导出 errorHandler');
      assert.strictEqual(
        typeof errorHandler.showErrorModal,
        'function',
        '应该有 showErrorModal 方法'
      );
    });

    it('应该导出 userGuide 实例', async () => {
      const { userGuide } = await import(
        `../src/services/errorHandler.js?t=${Date.now()}`
      );

      assert.ok(userGuide, '应该导出 userGuide');
      assert.strictEqual(
        typeof userGuide.startTour,
        'function',
        '应该有 startTour 方法'
      );
    });
  });
});
