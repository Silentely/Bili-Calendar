/**
 * animationService 单元测试
 * 测试结果动画服务
 *
 * 注意：由于这些函数依赖浏览器 DOM 和定时器，
 * 我们需要在 Node.js 环境中模拟这些对象
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

// 保存原始的环境描述符
let originalDocumentDescriptor;
let originalSetTimeoutDescriptor;
let originalClearTimeoutDescriptor;

/**
 * 模拟 document 对象
 */
function mockDocument() {
  const elements = [];

  const mockDoc = {
    body: {
      appendChild(element) {
        elements.push(element);
        element.parentNode = mockDoc.body;
      },
      removeChild(element) {
        const index = elements.indexOf(element);
        if (index > -1) {
          elements.splice(index, 1);
          element.parentNode = null;
        }
      },
      children: elements,
    },
    createElement(tagName) {
      let _innerHTML = '';
      let _className = '';

      const element = {
        tagName,
        get className() {
          return _className;
        },
        set className(value) {
          _className = value;
        },
        get innerHTML() {
          return _innerHTML;
        },
        set innerHTML(value) {
          _innerHTML = value;
        },
        parentNode: null,
        remove() {
          if (this.parentNode) {
            this.parentNode.removeChild(this);
          }
        },
      };
      return element;
    },
    querySelectorAll(selector) {
      // 简单匹配 class 选择器
      const className = selector.replace('.', '');
      return elements.filter((el) => el.className.includes(className));
    },
  };

  Object.defineProperty(globalThis, 'document', {
    writable: true,
    configurable: true,
    value: mockDoc,
  });

  return {
    mockDoc,
    elements,
    getElementCount: () => elements.length,
  };
}

/**
 * 模拟 setTimeout 和 clearTimeout
 */
function mockTimers() {
  let timeoutId = 0;
  const timeouts = new Map();

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

  Object.defineProperty(globalThis, 'clearTimeout', {
    writable: true,
    configurable: true,
    value: (id) => {
      const timeout = timeouts.get(id);
      if (timeout) {
        timeout.cleared = true;
      }
    },
  });

  return {
    timeouts,
    isTimeoutCleared: (id) => {
      const timeout = timeouts.get(id);
      return timeout ? timeout.cleared : true;
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

  if (originalSetTimeoutDescriptor) {
    Object.defineProperty(globalThis, 'setTimeout', originalSetTimeoutDescriptor);
  } else {
    delete globalThis.setTimeout;
  }

  if (originalClearTimeoutDescriptor) {
    Object.defineProperty(globalThis, 'clearTimeout', originalClearTimeoutDescriptor);
  } else {
    delete globalThis.clearTimeout;
  }
}

describe('animationService', () => {
  let mocks;
  let timers;

  beforeEach(() => {
    // 保存原始描述符
    originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    originalSetTimeoutDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
    originalClearTimeoutDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'clearTimeout');

    // 模拟环境
    mocks = mockDocument();
    timers = mockTimers();
  });

  afterEach(() => {
    // 恢复原始环境
    restoreEnvironment();
  });

  describe('showResultAnimation', () => {
    it('应该显示成功动画', async () => {
      const { showResultAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const animation = showResultAnimation(true);

      assert.ok(animation, '应该返回动画元素');
      assert.strictEqual(animation.className, 'result-animation', '应该有正确的类名');
      assert.ok(
        animation.innerHTML.includes('success-checkmark'),
        '应该包含成功图标'
      );

      // 由于 mock setTimeout 立即执行，动画应该已经被移除
      assert.strictEqual(animation.parentNode, null, '动画应该被移除');
    });

    it('应该显示失败动画', async () => {
      const { showResultAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const animation = showResultAnimation(false);

      assert.ok(animation, '应该返回动画元素');
      assert.strictEqual(animation.className, 'result-animation', '应该有正确的类名');
      assert.ok(
        animation.innerHTML.includes('error-cross'),
        '应该包含失败图标'
      );

      // 由于 mock setTimeout 立即执行，动画应该已经被移除
      assert.strictEqual(animation.parentNode, null, '动画应该被移除');
    });

    it('应该默认显示成功动画', async () => {
      const { showResultAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const animation = showResultAnimation();

      assert.ok(
        animation.innerHTML.includes('success-checkmark'),
        '默认应该显示成功图标'
      );
    });
  });

  describe('showSuccessAnimation', () => {
    it('应该显示成功动画', async () => {
      const { showSuccessAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const animation = showSuccessAnimation();

      assert.ok(animation, '应该返回动画元素');
      assert.ok(
        animation.innerHTML.includes('success-checkmark'),
        '应该包含成功图标'
      );
    });
  });

  describe('showErrorAnimation', () => {
    it('应该显示失败动画', async () => {
      const { showErrorAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const animation = showErrorAnimation();

      assert.ok(animation, '应该返回动画元素');
      assert.ok(
        animation.innerHTML.includes('error-cross'),
        '应该包含失败图标'
      );
    });
  });

  describe('showCustomAnimation', () => {
    it('应该显示自定义动画', async () => {
      const { showCustomAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const customHtml = '<div class="custom-icon">⭐</div>';
      const animation = showCustomAnimation(customHtml, 2000);

      assert.ok(animation, '应该返回动画元素');
      assert.strictEqual(animation.className, 'result-animation', '应该有正确的类名');
      assert.strictEqual(animation.innerHTML, customHtml, '应该包含自定义 HTML');

      // 由于 mock setTimeout 立即执行，动画应该已经被移除
      assert.strictEqual(animation.parentNode, null, '动画应该被移除');
    });

    it('应该使用默认 duration', async () => {
      const { showCustomAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const animation = showCustomAnimation('<div>测试</div>');

      assert.ok(animation, '应该返回动画元素');
      assert.strictEqual(animation.innerHTML, '<div>测试</div>');
    });

    it('应该正确处理 HTML 特殊字符', async () => {
      const { showCustomAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const html = '<div>&lt;script&gt;alert("test")&lt;/script&gt;</div>';
      const animation = showCustomAnimation(html);

      assert.strictEqual(animation.innerHTML, html, '应该保留原始 HTML');
    });
  });

  describe('clearAllAnimations', () => {
    it('应该清除所有动画', async () => {
      const { showSuccessAnimation, showErrorAnimation, clearAllAnimations } =
        await import('../src/services/animationService.js?t=' + Date.now());

      // 创建多个动画 (在 setTimeout 执行前)
      // 需要重新 mock setTimeout 以避免立即执行
      let mockTimeoutId = 0;
      Object.defineProperty(globalThis, 'setTimeout', {
        writable: true,
        configurable: true,
        value: (callback, delay) => {
          return ++mockTimeoutId;
        },
      });

      const animation1 = showSuccessAnimation();
      const animation2 = showErrorAnimation();

      // 验证动画已添加到 DOM
      assert.ok(animation1.parentNode, '动画1应该在 DOM 中');
      assert.ok(animation2.parentNode, '动画2应该在 DOM 中');

      // 清除所有动画
      clearAllAnimations();

      // 验证动画已被移除
      assert.strictEqual(animation1.parentNode, null, '动画1应该被移除');
      assert.strictEqual(animation2.parentNode, null, '动画2应该被移除');
      assert.strictEqual(mocks.getElementCount(), 0, '所有动画应该被清除');
    });

    it('应该在没有动画时不抛出错误', async () => {
      const { clearAllAnimations } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      // 不应该抛出错误
      clearAllAnimations();

      assert.strictEqual(mocks.getElementCount(), 0);
    });
  });

  describe('showLoadingAnimation', () => {
    it('应该显示加载动画并返回清除函数', async () => {
      // Mock setTimeout 不立即执行
      Object.defineProperty(globalThis, 'setTimeout', {
        writable: true,
        configurable: true,
        value: (callback, delay) => {
          return ++timers.timeouts.size;
        },
      });

      const { showLoadingAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const clear = showLoadingAnimation();

      assert.strictEqual(typeof clear, 'function', '应该返回清除函数');
      assert.strictEqual(mocks.getElementCount(), 1, '应该添加一个动画元素');

      const animation = mocks.elements[0];
      assert.ok(animation.className.includes('result-animation'), '应该有基础类名');
      assert.ok(animation.className.includes('loading-spinner'), '应该有 loading-spinner 类名');
      assert.ok(animation.innerHTML.includes('spinner'), '应该包含 spinner 元素');

      // 调用清除函数
      clear();
      assert.strictEqual(animation.parentNode, null, '动画应该被移除');
    });

    it('应该支持指定 duration 自动清除', async () => {
      const { showLoadingAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const clear = showLoadingAnimation(3000);

      assert.strictEqual(typeof clear, 'function', '应该返回清除函数');

      // 由于 mock setTimeout 立即执行，动画应该已经被移除
      // 验证所有动画都被清除
      assert.strictEqual(mocks.getElementCount(), 0, '动画应该被自动移除');
    });

    it('应该在不指定 duration 时持续显示', async () => {
      // Mock setTimeout 不立即执行
      Object.defineProperty(globalThis, 'setTimeout', {
        writable: true,
        configurable: true,
        value: (callback, delay) => {
          return ++timers.timeouts.size;
        },
      });

      const { showLoadingAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const clear = showLoadingAnimation();

      // 动画应该仍然在 DOM 中
      assert.strictEqual(mocks.getElementCount(), 1, '动画应该在 DOM 中');

      // 手动清除
      clear();
      assert.strictEqual(mocks.getElementCount(), 0, '动画应该被移除');
    });

    it('应该处理多次调用清除函数', async () => {
      // Mock setTimeout 不立即执行
      Object.defineProperty(globalThis, 'setTimeout', {
        writable: true,
        configurable: true,
        value: (callback, delay) => {
          return ++timers.timeouts.size;
        },
      });

      const { showLoadingAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const clear = showLoadingAnimation();

      clear();
      assert.strictEqual(mocks.getElementCount(), 0, '动画应该被移除');

      // 再次调用不应该抛出错误
      clear();
    });
  });

  describe('边界条件测试', () => {
    it('应该正确处理连续显示多个动画', async () => {
      // Mock setTimeout 不立即执行
      let mockTimeoutId = 0;
      Object.defineProperty(globalThis, 'setTimeout', {
        writable: true,
        configurable: true,
        value: (callback, delay) => {
          return ++mockTimeoutId;
        },
      });

      const { showSuccessAnimation, showErrorAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      showSuccessAnimation();
      showErrorAnimation();
      showSuccessAnimation();

      assert.strictEqual(mocks.getElementCount(), 3, '应该有3个动画元素');
    });

    it('应该处理空的自定义 HTML', async () => {
      const { showCustomAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const animation = showCustomAnimation('');

      assert.strictEqual(animation.innerHTML, '', '应该接受空字符串');
    });

    it('应该处理包含换行符的自定义 HTML', async () => {
      const { showCustomAnimation } = await import(
        '../src/services/animationService.js?t=' + Date.now()
      );

      const html = '<div>\n  <span>测试</span>\n</div>';
      const animation = showCustomAnimation(html);

      assert.strictEqual(animation.innerHTML, html, '应该保留换行符');
    });
  });
});
