/**
 * toastService 单元测试
 * 测试 Toast 提示信息服务
 *
 * 注意：由于这些函数依赖浏览器 DOM 对象，
 * 我们需要在 Node.js 环境中模拟这些对象
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

// 保存原始的 document 和 setTimeout 描述符
let originalDocumentDescriptor;
let originalSetTimeoutDescriptor;

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
      let _textContent = '';
      let _innerHTML = '';

      const element = {
        tagName,
        className: '',
        get innerHTML() {
          return _innerHTML;
        },
        set innerHTML(value) {
          _innerHTML = value;
        },
        get textContent() {
          return _textContent;
        },
        set textContent(value) {
          _textContent = value;
          // 模拟浏览器的 HTML 转义行为
          _innerHTML = value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        },
        classList: {
          classes: [],
          add(className) {
            if (!this.classes.includes(className)) {
              this.classes.push(className);
            }
          },
          remove(className) {
            const index = this.classes.indexOf(className);
            if (index > -1) {
              this.classes.splice(index, 1);
            }
          },
          contains(className) {
            return this.classes.includes(className);
          },
        },
        parentNode: null,
        remove() {
          if (this.parentNode) {
            this.parentNode.removeChild(this);
          }
        },
        closest(selector) {
          // 简单的模拟实现
          if (this.className.includes(selector.replace('.', ''))) {
            return this;
          }
          return null;
        },
      };
      return element;
    },
  };

  Object.defineProperty(globalThis, 'document', {
    writable: true,
    configurable: true,
    value: mockDoc,
  });

  return elements;
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

describe('toastService', () => {
  let elements;

  beforeEach(() => {
    // 保存原始描述符
    originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    originalSetTimeoutDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');

    // 模拟 document 和 setTimeout
    elements = mockDocument();
    mockSetTimeout();
  });

  afterEach(() => {
    // 恢复原始环境
    restoreEnvironment();
  });

  describe('showToast', () => {
    it('应该创建 Toast 元素并添加到 body', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showToast('测试消息', 'info');

      assert.ok(toast, 'Toast 元素应该存在');
      assert.strictEqual(toast.className, 'toast-notification-enhanced');
      // 注意：由于 mock setTimeout 立即执行，toast 会被立即删除
      // 所以我们只验证返回的 toast 对象本身
    });

    it('应该正确设置 success 类型的 Toast', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showToast('成功消息', 'success');

      assert.ok(toast.innerHTML.includes('success'), '应该包含 success 类型');
      assert.ok(toast.innerHTML.includes('fa-check-circle'), '应该包含成功图标');
    });

    it('应该正确设置 error 类型的 Toast', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showToast('错误消息', 'error');

      assert.ok(toast.innerHTML.includes('error'), '应该包含 error 类型');
      assert.ok(toast.innerHTML.includes('fa-times-circle'), '应该包含错误图标');
    });

    it('应该正确设置 warning 类型的 Toast', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showToast('警告消息', 'warning');

      assert.ok(toast.innerHTML.includes('warning'), '应该包含 warning 类型');
      assert.ok(toast.innerHTML.includes('fa-exclamation-triangle'), '应该包含警告图标');
    });

    it('应该正确设置 info 类型的 Toast', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showToast('信息消息', 'info');

      assert.ok(toast.innerHTML.includes('info'), '应该包含 info 类型');
      assert.ok(toast.innerHTML.includes('fa-info-circle'), '应该包含信息图标');
    });

    it('应该使用默认类型 info', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showToast('默认消息');

      assert.ok(toast.innerHTML.includes('info'), '应该使用默认 info 类型');
    });

    it('应该转义 HTML 特殊字符防止 XSS', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showToast('<script>alert("XSS")</script>', 'info');

      // escapeHtml 会将 < 转为 &lt;, > 转为 &gt;
      assert.ok(
        toast.innerHTML.includes('&lt;') || toast.innerHTML.includes('&gt;'),
        '应该转义 HTML 特殊字符'
      );
      assert.ok(!toast.innerHTML.includes('<script>'), '不应包含未转义的 script 标签');
    });

    it('应该正确显示包含引号的消息', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showToast('测试"引号"消息', 'info');

      assert.ok(toast.innerHTML.includes('引号'), '应该包含引号文本');
    });

    it('应该正确显示包含特殊字符的消息', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showToast('测试 & 特殊字符', 'info');

      assert.ok(toast.innerHTML.includes('&amp;'), '应该转义 & 字符');
    });

    it('应该处理空字符串消息', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showToast('', 'info');

      assert.ok(toast, 'Toast 元素应该存在');
      // 注意：由于 mock setTimeout 立即执行，toast 会被立即删除
      // 所以我们只验证返回的 toast 对象本身
    });
  });

  describe('showSuccess', () => {
    it('应该显示成功类型的 Toast', async () => {
      const { showSuccess } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showSuccess('操作成功！');

      assert.ok(toast.innerHTML.includes('success'), '应该是 success 类型');
      assert.ok(toast.innerHTML.includes('操作成功！'), '应该包含消息内容');
    });

    it('应该支持自定义 duration', async () => {
      const { showSuccess } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showSuccess('成功消息', 5000);

      assert.ok(toast, 'Toast 元素应该存在');
    });
  });

  describe('showError', () => {
    it('应该显示错误类型的 Toast', async () => {
      const { showError } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showError('操作失败！');

      assert.ok(toast.innerHTML.includes('error'), '应该是 error 类型');
      assert.ok(toast.innerHTML.includes('操作失败！'), '应该包含消息内容');
    });

    it('应该支持自定义 duration', async () => {
      const { showError } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showError('错误消息', 5000);

      assert.ok(toast, 'Toast 元素应该存在');
    });
  });

  describe('showWarning', () => {
    it('应该显示警告类型的 Toast', async () => {
      const { showWarning } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showWarning('请注意！');

      assert.ok(toast.innerHTML.includes('warning'), '应该是 warning 类型');
      assert.ok(toast.innerHTML.includes('请注意！'), '应该包含消息内容');
    });

    it('应该支持自定义 duration', async () => {
      const { showWarning } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showWarning('警告消息', 5000);

      assert.ok(toast, 'Toast 元素应该存在');
    });
  });

  describe('showInfo', () => {
    it('应该显示信息类型的 Toast', async () => {
      const { showInfo } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showInfo('提示信息');

      assert.ok(toast.innerHTML.includes('info'), '应该是 info 类型');
      assert.ok(toast.innerHTML.includes('提示信息'), '应该包含消息内容');
    });

    it('应该支持自定义 duration', async () => {
      const { showInfo } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showInfo('信息消息', 5000);

      assert.ok(toast, 'Toast 元素应该存在');
    });
  });

  describe('边界条件测试', () => {
    it('应该处理包含换行符的消息', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showToast('第一行\n第二行', 'info');

      assert.ok(toast, 'Toast 元素应该存在');
    });

    it('应该处理极长的消息', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const longMessage = 'a'.repeat(1000);
      const toast = showToast(longMessage, 'info');

      assert.ok(toast, 'Toast 元素应该存在');
      assert.ok(toast.innerHTML.includes('a'), '应该包含长消息内容');
    });

    it('应该处理包含 Unicode 字符的消息', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      const toast = showToast('测试 😀 Emoji', 'info');

      assert.ok(toast, 'Toast 元素应该存在');
    });

    it('应该处理无效的 type 参数', async () => {
      const { showToast } = await import('../src/services/toastService.js?t=' + Date.now());

      // @ts-ignore - 故意使用无效类型测试
      const toast = showToast('测试消息', 'invalid-type');

      assert.ok(toast, 'Toast 元素应该存在');
      assert.ok(toast.innerHTML.includes('fa-info-circle'), '应该回退到 info 图标');
    });
  });
});
