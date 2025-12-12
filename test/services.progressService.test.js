/**
 * progressService 单元测试
 * 测试进度条管理服务
 *
 * 注意：由于这些函数依赖浏览器 DOM 和定时器，
 * 我们需要在 Node.js 环境中模拟这些对象
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

// 保存原始的环境描述符
let originalDocumentDescriptor;
let originalSetIntervalDescriptor;
let originalClearIntervalDescriptor;
let originalSetTimeoutDescriptor;

/**
 * 模拟 document 对象
 */
function mockDocument() {
  let isActive = false;
  let progressWidth = '0%';
  const mockProgressFill = {
    style: {
      get width() {
        return progressWidth;
      },
      set width(value) {
        progressWidth = value;
      },
    },
  };

  const mockProgressBar = {
    id: 'progressBar',
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
      if (selector === '.progress-bar') {
        return mockProgressFill;
      }
      return null;
    },
  };

  const mockDoc = {
    getElementById(id) {
      if (id === 'progressBar') {
        return mockProgressBar;
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
    mockProgressBar,
    mockProgressFill,
    getProgressWidth: () => progressWidth,
    isActive: () => isActive,
  };
}

/**
 * 模拟 setInterval - 返回一个可追踪的 ID
 */
function mockTimers() {
  let intervalId = 0;
  const intervals = new Map();
  let timeoutId = 0;
  const timeouts = new Map();

  Object.defineProperty(globalThis, 'setInterval', {
    writable: true,
    configurable: true,
    value: (callback, delay) => {
      const id = ++intervalId;
      intervals.set(id, { callback, delay, cleared: false });
      return id;
    },
  });

  Object.defineProperty(globalThis, 'clearInterval', {
    writable: true,
    configurable: true,
    value: (id) => {
      const interval = intervals.get(id);
      if (interval) {
        interval.cleared = true;
      }
    },
  });

  Object.defineProperty(globalThis, 'setTimeout', {
    writable: true,
    configurable: true,
    value: (callback, delay) => {
      const id = ++timeoutId;
      timeouts.set(id, { callback, delay, cleared: false });
      // 立即执行以避免异步问题
      callback();
      return id;
    },
  });

  return {
    intervals,
    timeouts,
    triggerInterval: (id) => {
      const interval = intervals.get(id);
      if (interval && !interval.cleared) {
        interval.callback();
        return true;
      }
      return false;
    },
    isIntervalCleared: (id) => {
      const interval = intervals.get(id);
      return interval ? interval.cleared : true;
    },
  };
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

  if (originalSetIntervalDescriptor) {
    Object.defineProperty(globalThis, 'setInterval', originalSetIntervalDescriptor);
  } else {
    delete globalThis.setInterval;
  }

  if (originalClearIntervalDescriptor) {
    Object.defineProperty(globalThis, 'clearInterval', originalClearIntervalDescriptor);
  } else {
    delete globalThis.clearInterval;
  }

  if (originalSetTimeoutDescriptor) {
    Object.defineProperty(globalThis, 'setTimeout', originalSetTimeoutDescriptor);
  } else {
    delete globalThis.setTimeout;
  }
}

describe('progressService', () => {
  let mocks;
  let timers;

  beforeEach(() => {
    // 保存原始描述符
    originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    originalSetIntervalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setInterval');
    originalClearIntervalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'clearInterval'
    );
    originalSetTimeoutDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');

    // 模拟环境
    mocks = mockDocument();
    timers = mockTimers();
  });

  afterEach(() => {
    // 恢复原始环境
    restoreEnvironment();
  });

  describe('showProgressBar', () => {
    it('应该显示进度条并返回控制器', async () => {
      const { showProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showProgressBar();

      assert.ok(controller, '应该返回控制器');
      assert.strictEqual(typeof controller.complete, 'function', '应该有 complete 方法');
      assert.strictEqual(typeof controller.error, 'function', '应该有 error 方法');
      assert.strictEqual(typeof controller.setProgress, 'function', '应该有 setProgress 方法');
      assert.strictEqual(mocks.isActive(), true, '进度条应该被激活');
      assert.strictEqual(mocks.getProgressWidth(), '0%', '初始进度应该是 0%');
    });

    it('应该启动进度模拟', async () => {
      const { showProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      showProgressBar();

      // 验证 setInterval 被调用
      assert.strictEqual(timers.intervals.size, 1, '应该启动一个定时器');
      const intervalId = Array.from(timers.intervals.keys())[0];

      // 模拟几次定时器触发
      timers.triggerInterval(intervalId);
      const progress1 = parseFloat(mocks.getProgressWidth());
      assert.ok(progress1 > 0 && progress1 <= 90, '进度应该在 0-90 之间');

      timers.triggerInterval(intervalId);
      const progress2 = parseFloat(mocks.getProgressWidth());
      assert.ok(progress2 >= progress1, '进度应该递增');
    });

    it('应该在元素不存在时返回空控制器', async () => {
      // Mock getElementById 返回 null
      mocks.mockDoc.getElementById = () => null;

      const { showProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showProgressBar();

      assert.ok(controller, '应该返回控制器');
      assert.strictEqual(typeof controller.complete, 'function');
      assert.strictEqual(typeof controller.error, 'function');
      assert.strictEqual(typeof controller.setProgress, 'function');

      // 空控制器不应该抛出错误
      controller.complete();
      controller.error();
      controller.setProgress(50);
    });

    it('应该在 .progress-bar 不存在时返回空控制器', async () => {
      // Mock querySelector 返回 null
      mocks.mockProgressBar.querySelector = () => null;

      const { showProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showProgressBar();

      assert.ok(controller, '应该返回控制器');
      // 空控制器不应该抛出错误
      controller.complete();
      controller.error();
      controller.setProgress(50);
    });
  });

  describe('controller.complete', () => {
    it('应该将进度设置为 100% 并隐藏进度条', async () => {
      const { showProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showProgressBar();
      const intervalId = Array.from(timers.intervals.keys())[0];

      controller.complete();

      // 验证进度设置为 100%
      assert.strictEqual(mocks.getProgressWidth(), '100%', '进度应该是 100%');

      // 验证定时器被清除
      assert.strictEqual(timers.isIntervalCleared(intervalId), true, '定时器应该被清除');

      // 验证进度条被隐藏 (由于 mock setTimeout 立即执行)
      assert.strictEqual(mocks.isActive(), false, '进度条应该被隐藏');
    });
  });

  describe('controller.error', () => {
    it('应该立即隐藏进度条', async () => {
      const { showProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showProgressBar();
      const intervalId = Array.from(timers.intervals.keys())[0];

      controller.error();

      // 验证定时器被清除
      assert.strictEqual(timers.isIntervalCleared(intervalId), true, '定时器应该被清除');

      // 验证进度条被隐藏
      assert.strictEqual(mocks.isActive(), false, '进度条应该被隐藏');
    });
  });

  describe('controller.setProgress', () => {
    it('应该手动设置进度', async () => {
      const { showProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showProgressBar();

      controller.setProgress(50);
      assert.strictEqual(mocks.getProgressWidth(), '50%', '进度应该是 50%');

      controller.setProgress(75);
      assert.strictEqual(mocks.getProgressWidth(), '75%', '进度应该是 75%');
    });

    it('应该限制进度范围在 0-100', async () => {
      const { showProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showProgressBar();

      controller.setProgress(-10);
      assert.strictEqual(mocks.getProgressWidth(), '0%', '负数应该被限制为 0%');

      controller.setProgress(150);
      assert.strictEqual(mocks.getProgressWidth(), '100%', '超过 100 应该被限制为 100%');
    });
  });

  describe('showDeterminateProgress', () => {
    it('应该显示进度条但不启动自动模拟', async () => {
      const { showDeterminateProgress } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showDeterminateProgress();

      assert.ok(controller, '应该返回控制器');
      assert.strictEqual(mocks.isActive(), true, '进度条应该被激活');
      assert.strictEqual(mocks.getProgressWidth(), '0%', '初始进度应该是 0%');

      // 验证没有启动定时器
      assert.strictEqual(timers.intervals.size, 0, '不应该启动定时器');
    });

    it('应该支持手动设置进度', async () => {
      const { showDeterminateProgress } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showDeterminateProgress();

      controller.setProgress(25);
      assert.strictEqual(mocks.getProgressWidth(), '25%');

      controller.setProgress(50);
      assert.strictEqual(mocks.getProgressWidth(), '50%');

      controller.setProgress(100);
      assert.strictEqual(mocks.getProgressWidth(), '100%');
    });

    it('应该支持 complete 和 error 方法', async () => {
      const { showDeterminateProgress } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showDeterminateProgress();

      controller.setProgress(80);
      assert.strictEqual(mocks.getProgressWidth(), '80%');

      controller.complete();
      assert.strictEqual(mocks.getProgressWidth(), '100%', '完成后应该是 100%');
      assert.strictEqual(mocks.isActive(), false, '进度条应该被隐藏');
    });

    it('应该在元素不存在时返回空控制器', async () => {
      mocks.mockDoc.getElementById = () => null;

      const { showDeterminateProgress } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showDeterminateProgress();

      assert.ok(controller, '应该返回控制器');
      controller.setProgress(50);
      controller.complete();
      controller.error();
    });
  });

  describe('hideProgressBar', () => {
    it('应该隐藏进度条', async () => {
      const { showProgressBar, hideProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      showProgressBar();
      assert.strictEqual(mocks.isActive(), true, '进度条应该是激活的');

      hideProgressBar();
      assert.strictEqual(mocks.isActive(), false, '进度条应该被隐藏');
    });

    it('应该在元素不存在时不抛出错误', async () => {
      mocks.mockDoc.getElementById = () => null;

      const { hideProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      // 不应该抛出错误
      hideProgressBar();
    });
  });

  describe('边界条件测试', () => {
    it('应该正确处理多次调用 showProgressBar', async () => {
      const { showProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller1 = showProgressBar();
      const controller2 = showProgressBar();

      assert.ok(controller1);
      assert.ok(controller2);

      // 多个控制器应该独立工作
      controller1.setProgress(30);
      controller2.setProgress(70);

      // 最后设置的值应该生效
      assert.strictEqual(mocks.getProgressWidth(), '70%');
    });

    it('应该正确处理进度模拟的上限', async () => {
      const { showProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      showProgressBar();
      const intervalId = Array.from(timers.intervals.keys())[0];

      // 模拟多次触发，直到达到上限
      for (let i = 0; i < 20; i++) {
        timers.triggerInterval(intervalId);
      }

      const progress = parseFloat(mocks.getProgressWidth());
      assert.ok(progress <= 90, '模拟进度不应该超过 90%');
    });

    it('应该处理 complete 后再次调用', async () => {
      const { showProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showProgressBar();

      controller.complete();
      assert.strictEqual(mocks.getProgressWidth(), '100%');

      // 再次调用 complete 不应该抛出错误
      controller.complete();
    });

    it('应该处理 error 后再次调用', async () => {
      const { showProgressBar } = await import(
        '../src/services/progressService.js?t=' + Date.now()
      );

      const controller = showProgressBar();

      controller.error();
      assert.strictEqual(mocks.isActive(), false);

      // 再次调用 error 不应该抛出错误
      controller.error();
    });
  });
});
