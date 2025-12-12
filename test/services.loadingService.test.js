/**
 * loadingService 单元测试
 * 测试加载遮罩管理服务
 *
 * 注意：由于这些函数依赖浏览器 DOM 和定时器，
 * 我们需要在 Node.js 环境中模拟这些对象
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

// 保存原始的环境描述符
let originalDocumentDescriptor;
let originalSetTimeoutDescriptor;

/**
 * 模拟 document 对象
 */
function mockDocument() {
  let isActive = false;
  let loadingText = '处理中...';

  const mockLoadingTextElement = {
    get textContent() {
      return loadingText;
    },
    set textContent(value) {
      loadingText = value;
    },
  };

  const mockOverlay = {
    id: 'loadingOverlay',
    classList: {
      classes: [],
      add(className) {
        if (!this.classes.includes(className)) {
          this.classes.push(className);
          if (className === 'active') {
            isActive = true;
          }
        }
      },
      remove(className) {
        const index = this.classes.indexOf(className);
        if (index > -1) {
          this.classes.splice(index, 1);
          if (className === 'active') {
            isActive = false;
          }
        }
      },
      contains(className) {
        return this.classes.includes(className);
      },
    },
    querySelector(selector) {
      if (selector === '.loading-text') {
        return mockLoadingTextElement;
      }
      return null;
    },
  };

  const mockDoc = {
    getElementById(id) {
      if (id === 'loadingOverlay') {
        return mockOverlay;
      }
      return null;
    },
  };

  Object.defineProperty(globalThis, 'document', {
    writable: true,
    configurable: true,
    value: mockDoc,
  });

  return {
    mockDoc,
    mockOverlay,
    mockLoadingTextElement,
    getLoadingText: () => loadingText,
    isActive: () => isActive,
  };
}

/**
 * 模拟 setTimeout - 立即执行以避免异步问题
 */
function mockSetTimeout() {
  Object.defineProperty(globalThis, 'setTimeout', {
    writable: true,
    configurable: true,
    value: (callback, _delay) => {
      // 立即执行，避免异步问题
      callback();
      return 0;
    },
  });
}

/**
 * 恢复原始环境
 */
function restoreEnvironment() {
  if (originalDocumentDescriptor) {
    Object.defineProperty(globalThis, 'document', originalDocumentDescriptor);
  } else {
    delete globalThis.document;
  }

  if (originalSetTimeoutDescriptor) {
    Object.defineProperty(globalThis, 'setTimeout', originalSetTimeoutDescriptor);
  } else {
    delete globalThis.setTimeout;
  }
}

describe('loadingService', () => {
  let mocks;

  beforeEach(() => {
    // 保存原始描述符
    originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    originalSetTimeoutDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');

    // 模拟环境
    mocks = mockDocument();
    mockSetTimeout();
  });

  afterEach(() => {
    // 恢复原始环境
    restoreEnvironment();
  });

  describe('showLoadingOverlay', () => {
    it('应该显示加载遮罩并返回控制器', async () => {
      const { showLoadingOverlay } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      const controller = showLoadingOverlay('正在加载...');

      assert.ok(controller, '应该返回控制器');
      assert.strictEqual(typeof controller.hide, 'function', '应该有 hide 方法');
      assert.strictEqual(typeof controller.updateText, 'function', '应该有 updateText 方法');
      assert.strictEqual(mocks.isActive(), true, '加载遮罩应该被激活');
      assert.strictEqual(mocks.getLoadingText(), '正在加载...', '应该设置加载文本');
    });

    it('应该使用默认文本', async () => {
      const { showLoadingOverlay } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      const controller = showLoadingOverlay();

      assert.ok(controller);
      assert.strictEqual(mocks.getLoadingText(), '处理中...', '应该使用默认文本');
    });

    it('应该在元素不存在时返回空控制器', async () => {
      // Mock getElementById 返回 null
      mocks.mockDoc.getElementById = () => null;

      const { showLoadingOverlay } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      const controller = showLoadingOverlay('测试文本');

      assert.ok(controller, '应该返回控制器');
      assert.strictEqual(typeof controller.hide, 'function');
      assert.strictEqual(typeof controller.updateText, 'function');

      // 空控制器不应该抛出错误
      controller.hide();
      controller.updateText('新文本');
    });

    it('应该在 .loading-text 不存在时返回空控制器', async () => {
      // Mock querySelector 返回 null
      mocks.mockOverlay.querySelector = () => null;

      const { showLoadingOverlay } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      const controller = showLoadingOverlay('测试文本');

      assert.ok(controller, '应该返回控制器');
      controller.hide();
      controller.updateText('新文本');
    });
  });

  describe('controller.hide', () => {
    it('应该隐藏加载遮罩', async () => {
      const { showLoadingOverlay } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      const controller = showLoadingOverlay('测试文本');
      assert.strictEqual(mocks.isActive(), true, '加载遮罩应该是激活的');

      controller.hide();
      assert.strictEqual(mocks.isActive(), false, '加载遮罩应该被隐藏');
    });
  });

  describe('controller.updateText', () => {
    it('应该更新加载文本', async () => {
      const { showLoadingOverlay } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      const controller = showLoadingOverlay('初始文本');
      assert.strictEqual(mocks.getLoadingText(), '初始文本');

      controller.updateText('更新后的文本');
      assert.strictEqual(mocks.getLoadingText(), '更新后的文本', '文本应该被更新');

      controller.updateText('第二次更新');
      assert.strictEqual(mocks.getLoadingText(), '第二次更新', '文本应该可以多次更新');
    });
  });

  describe('hideLoading', () => {
    it('应该直接隐藏加载遮罩', async () => {
      const { showLoadingOverlay, hideLoading } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      showLoadingOverlay('测试文本');
      assert.strictEqual(mocks.isActive(), true, '加载遮罩应该是激活的');

      hideLoading();
      assert.strictEqual(mocks.isActive(), false, '加载遮罩应该被隐藏');
    });

    it('应该在元素不存在时不抛出错误', async () => {
      mocks.mockDoc.getElementById = () => null;

      const { hideLoading } = await import('../src/services/loadingService.js?t=' + Date.now());

      // 不应该抛出错误
      hideLoading();
    });
  });

  describe('showLoadingWithTimeout', () => {
    it('应该显示加载遮罩并自动隐藏', async () => {
      const { showLoadingWithTimeout } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      const controller = showLoadingWithTimeout('自动隐藏测试', 1000);

      assert.ok(controller, '应该返回控制器');
      assert.strictEqual(mocks.getLoadingText(), '自动隐藏测试');

      // 由于 mock setTimeout 立即执行，加载遮罩应该已经被隐藏
      assert.strictEqual(mocks.isActive(), false, '加载遮罩应该被自动隐藏');
    });

    it('应该使用默认 duration', async () => {
      const { showLoadingWithTimeout } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      const controller = showLoadingWithTimeout('默认时长测试');

      assert.ok(controller, '应该返回控制器');
      // 由于 mock setTimeout 立即执行，加载遮罩应该已经被隐藏
      assert.strictEqual(mocks.isActive(), false);
    });
  });

  describe('isLoadingVisible', () => {
    it('应该正确检测加载遮罩的显示状态', async () => {
      const { showLoadingOverlay, isLoadingVisible } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      // 初始状态：不可见
      assert.strictEqual(isLoadingVisible(), false, '加载遮罩应该是不可见的');

      // 显示加载遮罩
      const controller = showLoadingOverlay('测试文本');
      assert.strictEqual(isLoadingVisible(), true, '加载遮罩应该是可见的');

      // 隐藏加载遮罩
      controller.hide();
      assert.strictEqual(isLoadingVisible(), false, '加载遮罩应该是不可见的');
    });

    it('应该在元素不存在时返回 false', async () => {
      mocks.mockDoc.getElementById = () => null;

      const { isLoadingVisible } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      assert.strictEqual(isLoadingVisible(), false, '应该返回 false');
    });
  });

  describe('边界条件测试', () => {
    it('应该正确处理多次显示和隐藏', async () => {
      const { showLoadingOverlay, hideLoading } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      // 第一次显示
      const controller1 = showLoadingOverlay('第一次');
      assert.strictEqual(mocks.isActive(), true);

      // 隐藏
      controller1.hide();
      assert.strictEqual(mocks.isActive(), false);

      // 第二次显示
      const controller2 = showLoadingOverlay('第二次');
      assert.strictEqual(mocks.isActive(), true);
      assert.strictEqual(mocks.getLoadingText(), '第二次');

      // 使用全局方法隐藏
      hideLoading();
      assert.strictEqual(mocks.isActive(), false);
    });

    it('应该处理连续的文本更新', async () => {
      const { showLoadingOverlay } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      const controller = showLoadingOverlay('初始');

      const updates = ['更新1', '更新2', '更新3', '更新4', '更新5'];
      updates.forEach((text) => {
        controller.updateText(text);
        assert.strictEqual(mocks.getLoadingText(), text, `文本应该被更新为 ${text}`);
      });
    });

    it('应该处理隐藏后再次调用 hide', async () => {
      const { showLoadingOverlay } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      const controller = showLoadingOverlay('测试');

      controller.hide();
      assert.strictEqual(mocks.isActive(), false);

      // 再次调用 hide 不应该抛出错误
      controller.hide();
      assert.strictEqual(mocks.isActive(), false);
    });

    it('应该处理空字符串文本', async () => {
      const { showLoadingOverlay } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      const controller = showLoadingOverlay('');
      assert.strictEqual(mocks.getLoadingText(), '', '应该接受空字符串');

      controller.updateText('');
      assert.strictEqual(mocks.getLoadingText(), '', '应该可以更新为空字符串');
    });

    it('应该处理特殊字符文本', async () => {
      const { showLoadingOverlay } = await import(
        '../src/services/loadingService.js?t=' + Date.now()
      );

      const specialText = '测试 <>&"\'\\n\\t 特殊字符';
      const controller = showLoadingOverlay(specialText);

      assert.strictEqual(mocks.getLoadingText(), specialText, '应该正确处理特殊字符');
    });
  });
});
