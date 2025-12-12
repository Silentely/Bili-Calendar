/**
 * clipboardService 单元测试
 * 测试剪贴板服务
 *
 * 注意：由于这些函数依赖浏览器 Clipboard API 和 DOM，
 * 我们需要在 Node.js 环境中模拟这些对象
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

// 保存原始的环境描述符
let originalNavigatorDescriptor;
let originalDocumentDescriptor;

/**
 * 模拟 navigator.clipboard
 */
function mockNavigatorClipboard(options = {}) {
  const {
    writeTextSuccess = true,
    readTextSuccess = true,
    writeTextError = new Error('Permission denied'),
    readTextError = new Error('Permission denied'),
    readTextValue = 'clipboard content',
  } = options;

  const mockClipboard = {
    async writeText(text) {
      if (writeTextSuccess) {
        return Promise.resolve();
      } else {
        return Promise.reject(writeTextError);
      }
    },
    async readText() {
      if (readTextSuccess) {
        return Promise.resolve(readTextValue);
      } else {
        return Promise.reject(readTextError);
      }
    },
  };

  Object.defineProperty(globalThis, 'navigator', {
    writable: true,
    configurable: true,
    value: {
      clipboard: mockClipboard,
    },
  });

  return {
    mockClipboard,
  };
}

/**
 * 模拟不支持 clipboard API 的环境
 */
function mockNoClipboardAPI() {
  Object.defineProperty(globalThis, 'navigator', {
    writable: true,
    configurable: true,
    value: {},
  });
}

/**
 * 模拟 document 对象
 */
function mockDocument(options = {}) {
  const { execCommandSuccess = true } = options;

  const elements = new Map();
  let createdElements = [];

  const mockDoc = {
    createElement(tagName) {
      let _value = '';
      let _style = {};

      const element = {
        tagName,
        get value() {
          return _value;
        },
        set value(val) {
          _value = val;
        },
        get style() {
          return _style;
        },
        set style(val) {
          _style = val;
        },
        select() {
          // Mock select
        },
        setSelectionRange(start, end) {
          // Mock setSelectionRange
        },
      };

      createdElements.push(element);
      return element;
    },
    execCommand(command) {
      return execCommandSuccess;
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    body: {
      appendChild(element) {
        // Mock appendChild
      },
      removeChild(element) {
        // Mock removeChild
      },
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
    createdElements,
    setElement: (id, element) => {
      elements.set(id, element);
    },
    getCreatedElements: () => createdElements,
    clearCreatedElements: () => {
      createdElements = [];
    },
  };
}

/**
 * 恢复原始环境
 */
function restoreEnvironment() {
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  } else {
    delete globalThis.navigator;
  }

  if (originalDocumentDescriptor) {
    Object.defineProperty(globalThis, 'document', originalDocumentDescriptor);
  } else {
    delete globalThis.document;
  }
}

describe('clipboardService', () => {
  beforeEach(() => {
    // 保存原始描述符
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  });

  afterEach(() => {
    // 恢复原始环境
    restoreEnvironment();
  });

  describe('copyToClipboard', () => {
    it('应该使用现代 API 成功复制文本', async () => {
      mockNavigatorClipboard({ writeTextSuccess: true });
      mockDocument();

      const { copyToClipboard } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      let successCalled = false;
      const result = await copyToClipboard('测试文本', {
        onSuccess: () => {
          successCalled = true;
        },
      });

      assert.strictEqual(result, true, '应该返回 true');
      assert.strictEqual(successCalled, true, '应该调用 onSuccess');
    });

    it('应该在现代 API 失败时回退到 execCommand', async () => {
      mockNavigatorClipboard({ writeTextSuccess: false });
      mockDocument({ execCommandSuccess: true });

      const { copyToClipboard } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      let successCalled = false;
      const result = await copyToClipboard('测试文本', {
        onSuccess: () => {
          successCalled = true;
        },
      });

      assert.strictEqual(result, true, '应该返回 true');
      assert.strictEqual(successCalled, true, '应该调用 onSuccess');
    });

    it('应该在没有现代 API 时使用 execCommand', async () => {
      mockNoClipboardAPI();
      mockDocument({ execCommandSuccess: true });

      const { copyToClipboard } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      let successCalled = false;
      const result = await copyToClipboard('测试文本', {
        onSuccess: () => {
          successCalled = true;
        },
      });

      assert.strictEqual(result, true, '应该返回 true');
      assert.strictEqual(successCalled, true, '应该调用 onSuccess');
    });

    it('应该在 execCommand 失败时返回 false', async () => {
      mockNoClipboardAPI();
      mockDocument({ execCommandSuccess: false });

      const { copyToClipboard } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      let errorCalled = false;
      const result = await copyToClipboard('测试文本', {
        onError: () => {
          errorCalled = true;
        },
      });

      assert.strictEqual(result, false, '应该返回 false');
      assert.strictEqual(errorCalled, true, '应该调用 onError');
    });

    it('应该拒绝无效的文本', async () => {
      mockNavigatorClipboard();
      mockDocument();

      const { copyToClipboard } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      let errorCalled = false;
      const result1 = await copyToClipboard('', {
        onError: () => {
          errorCalled = true;
        },
      });

      assert.strictEqual(result1, false, '空字符串应该返回 false');
      assert.strictEqual(errorCalled, true, '应该调用 onError');

      errorCalled = false;
      const result2 = await copyToClipboard(null, {
        onError: () => {
          errorCalled = true;
        },
      });

      assert.strictEqual(result2, false, 'null 应该返回 false');
      assert.strictEqual(errorCalled, true, '应该调用 onError');
    });

    it('应该在没有回调时不抛出错误', async () => {
      mockNavigatorClipboard({ writeTextSuccess: true });
      mockDocument();

      const { copyToClipboard } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      // 不应该抛出错误
      const result = await copyToClipboard('测试文本');
      assert.strictEqual(result, true);
    });
  });

  describe('copyFromElement', () => {
    it('应该从元素的 textContent 复制', async () => {
      mockNavigatorClipboard({ writeTextSuccess: true });
      const mocks = mockDocument();

      mocks.setElement('test-element', {
        textContent: '元素文本内容',
      });

      const { copyFromElement } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      let successCalled = false;
      const result = await copyFromElement('test-element', {
        onSuccess: () => {
          successCalled = true;
        },
      });

      assert.strictEqual(result, true, '应该返回 true');
      assert.strictEqual(successCalled, true, '应该调用 onSuccess');
    });

    it('应该从元素的 value 复制', async () => {
      mockNavigatorClipboard({ writeTextSuccess: true });
      const mocks = mockDocument();

      mocks.setElement('test-input', {
        value: '输入框值',
        textContent: null,
      });

      const { copyFromElement } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      let successCalled = false;
      const result = await copyFromElement('test-input', {
        onSuccess: () => {
          successCalled = true;
        },
      });

      assert.strictEqual(result, true, '应该返回 true');
      assert.strictEqual(successCalled, true, '应该调用 onSuccess');
    });

    it('应该在元素不存在时返回 false', async () => {
      mockNavigatorClipboard();
      mockDocument();

      const { copyFromElement } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      let errorCalled = false;
      const result = await copyFromElement('non-existent', {
        onError: () => {
          errorCalled = true;
        },
      });

      assert.strictEqual(result, false, '应该返回 false');
      assert.strictEqual(errorCalled, true, '应该调用 onError');
    });
  });

  describe('isClipboardSupported', () => {
    it('应该在支持现代 API 时返回 true', async () => {
      mockNavigatorClipboard();
      mockDocument();

      const { isClipboardSupported } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      const result = isClipboardSupported();
      assert.strictEqual(result, true);
    });

    it('应该在仅支持 execCommand 时返回 true', async () => {
      mockNoClipboardAPI();
      mockDocument();

      const { isClipboardSupported } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      const result = isClipboardSupported();
      assert.strictEqual(result, true);
    });

    it('应该在都不支持时返回 false', async () => {
      mockNoClipboardAPI();

      Object.defineProperty(globalThis, 'document', {
        writable: true,
        configurable: true,
        value: {},
      });

      const { isClipboardSupported } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      const result = isClipboardSupported();
      assert.strictEqual(result, false);
    });
  });

  describe('isAsyncClipboardSupported', () => {
    it('应该在支持现代 API 时返回 true', async () => {
      mockNavigatorClipboard();
      mockDocument();

      const { isAsyncClipboardSupported } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      const result = isAsyncClipboardSupported();
      assert.strictEqual(result, true);
    });

    it('应该在不支持现代 API 时返回 false', async () => {
      mockNoClipboardAPI();
      mockDocument();

      const { isAsyncClipboardSupported } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      const result = isAsyncClipboardSupported();
      assert.strictEqual(result, false);
    });
  });

  describe('readFromClipboard', () => {
    it('应该成功读取剪贴板内容', async () => {
      mockNavigatorClipboard({
        readTextSuccess: true,
        readTextValue: '剪贴板内容',
      });
      mockDocument();

      const { readFromClipboard } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      const result = await readFromClipboard();
      assert.strictEqual(result, '剪贴板内容');
    });

    it('应该在读取失败时返回 null', async () => {
      mockNavigatorClipboard({ readTextSuccess: false });
      mockDocument();

      const { readFromClipboard } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      const result = await readFromClipboard();
      assert.strictEqual(result, null);
    });

    it('应该在不支持时返回 null', async () => {
      mockNoClipboardAPI();
      mockDocument();

      const { readFromClipboard } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      const result = await readFromClipboard();
      assert.strictEqual(result, null);
    });
  });

  describe('createCopyHandler', () => {
    it('应该创建带有回调的复制函数', async () => {
      mockNavigatorClipboard({ writeTextSuccess: true });
      mockDocument();

      const { createCopyHandler } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      let successCalled = false;
      const copyHandler = createCopyHandler(
        () => {
          successCalled = true;
        },
        () => {}
      );

      assert.strictEqual(typeof copyHandler, 'function', '应该返回函数');

      const result = await copyHandler('测试文本');
      assert.strictEqual(result, true, '应该返回 true');
      assert.strictEqual(successCalled, true, '应该调用 onSuccess');
    });

    it('应该正确传递错误回调', async () => {
      mockNoClipboardAPI();
      mockDocument({ execCommandSuccess: false });

      const { createCopyHandler } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      let errorCalled = false;
      const copyHandler = createCopyHandler(
        () => {},
        () => {
          errorCalled = true;
        }
      );

      const result = await copyHandler('测试文本');
      assert.strictEqual(result, false, '应该返回 false');
      assert.strictEqual(errorCalled, true, '应该调用 onError');
    });
  });

  describe('边界条件测试', () => {
    it('应该处理特殊字符文本', async () => {
      mockNavigatorClipboard({ writeTextSuccess: true });
      mockDocument();

      const { copyToClipboard } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      const specialText = '测试 <>&"\'\n\t 特殊字符';
      const result = await copyToClipboard(specialText);

      assert.strictEqual(result, true);
    });

    it('应该处理非常长的文本', async () => {
      mockNavigatorClipboard({ writeTextSuccess: true });
      mockDocument();

      const { copyToClipboard } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      const longText = 'a'.repeat(100000);
      const result = await copyToClipboard(longText);

      assert.strictEqual(result, true);
    });

    it('应该处理 Unicode 字符', async () => {
      mockNavigatorClipboard({ writeTextSuccess: true });
      mockDocument();

      const { copyToClipboard } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      const unicodeText = '你好世界 🌍 🎉 ❤️';
      const result = await copyToClipboard(unicodeText);

      assert.strictEqual(result, true);
    });

    it('应该处理元素的空内容', async () => {
      mockNavigatorClipboard({ writeTextSuccess: true });
      const mocks = mockDocument();

      mocks.setElement('empty-element', {
        textContent: '',
        value: '',
      });

      const { copyFromElement } = await import(
        '../src/services/clipboardService.js?t=' + Date.now()
      );

      let errorCalled = false;
      const result = await copyFromElement('empty-element', {
        onError: () => {
          errorCalled = true;
        },
      });

      assert.strictEqual(result, false, '空内容应该返回 false');
      assert.strictEqual(errorCalled, true, '应该调用 onError');
    });
  });
});
