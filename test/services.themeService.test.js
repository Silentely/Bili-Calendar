/**
 * themeService 单元测试
 * 测试主题管理服务
 *
 * 注意：由于这些函数依赖浏览器 DOM 和 localStorage，
 * 我们需要在 Node.js 环境中模拟这些对象
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

// 保存原始的环境描述符
let originalDocumentDescriptor;
let originalWindowDescriptor;
let originalLocalStorageDescriptor;

/**
 * 模拟 document 对象
 */
function mockDocument() {
  const storage = {};
  let themeAttribute = 'light';
  const mockIconElement = {
    id: 'themeIcon',
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
  };

  const mockDoc = {
    body: {
      getAttribute(name) {
        if (name === 'data-theme') {
          return themeAttribute;
        }
        return null;
      },
      setAttribute(name, value) {
        if (name === 'data-theme') {
          themeAttribute = value;
        }
      },
    },
    getElementById(id) {
      if (id === 'themeIcon') {
        return mockIconElement;
      }
      return null;
    },
  };

  Object.defineProperty(globalThis, 'document', {
    writable: true,
    configurable: true,
    value: mockDoc,
  });

  return { mockDoc, mockIconElement, storage, getThemeAttribute: () => themeAttribute };
}

/**
 * 模拟 localStorage
 */
function mockLocalStorage(storage) {
  const mockStorage = {
    getItem(key) {
      return storage[key] || null;
    },
    setItem(key, value) {
      storage[key] = value;
    },
    removeItem(key) {
      delete storage[key];
    },
    clear() {
      Object.keys(storage).forEach((key) => delete storage[key]);
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    writable: true,
    configurable: true,
    value: mockStorage,
  });
}

/**
 * 模拟 window.matchMedia
 */
function mockMatchMedia() {
  const listeners = [];
  let isDark = false;

  const mockMediaQuery = {
    matches: isDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener(event, handler) {
      if (event === 'change') {
        listeners.push(handler);
      }
    },
    removeEventListener(event, handler) {
      if (event === 'change') {
        const index = listeners.indexOf(handler);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    },
    // 模拟触发 change 事件
    _triggerChange(newIsDark) {
      isDark = newIsDark;
      mockMediaQuery.matches = isDark;
      listeners.forEach((handler) => handler({ matches: isDark }));
    },
  };

  Object.defineProperty(globalThis, 'window', {
    writable: true,
    configurable: true,
    value: {
      matchMedia(query) {
        if (query === '(prefers-color-scheme: dark)') {
          return mockMediaQuery;
        }
        return null;
      },
    },
  });

  return mockMediaQuery;
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

  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    delete globalThis.window;
  }

  if (originalLocalStorageDescriptor) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorageDescriptor);
  } else {
    delete globalThis.localStorage;
  }
}

describe('themeService', () => {
  let mocks;

  beforeEach(() => {
    // 保存原始描述符
    originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    // 模拟环境
    mocks = mockDocument();
    mockLocalStorage(mocks.storage);
    mocks.mockMediaQuery = mockMatchMedia();
  });

  afterEach(() => {
    // 恢复原始环境
    restoreEnvironment();
  });

  describe('getCurrentTheme', () => {
    it('应该返回 body 上的 data-theme 属性', async () => {
      const { getCurrentTheme } = await import(
        '../src/services/themeService.js?t=' + Date.now()
      );

      const theme = getCurrentTheme();

      assert.strictEqual(theme, 'light', '默认应该是 light 主题');
    });

    it('应该在没有设置时返回默认主题', async () => {
      mocks.mockDoc.body.getAttribute = () => null;

      const { getCurrentTheme } = await import(
        '../src/services/themeService.js?t=' + Date.now()
      );

      const theme = getCurrentTheme();

      assert.strictEqual(theme, 'light', '没有设置时应该返回默认主题 light');
    });
  });

  describe('setTheme', () => {
    it('应该正确设置 light 主题', async () => {
      const { setTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      setTheme('light');

      assert.strictEqual(mocks.getThemeAttribute(), 'light');
      assert.ok(mocks.mockIconElement.classList.contains('fa-moon'), '应该显示月亮图标');
      assert.strictEqual(mocks.storage.theme, 'light', '应该保存到 localStorage');
    });

    it('应该正确设置 dark 主题', async () => {
      const { setTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      setTheme('dark');

      assert.strictEqual(mocks.getThemeAttribute(), 'dark');
      assert.ok(mocks.mockIconElement.classList.contains('fa-sun'), '应该显示太阳图标');
      assert.strictEqual(mocks.storage.theme, 'dark', '应该保存到 localStorage');
    });

    it('应该在主题图标不存在时警告', async () => {
      // Mock 返回 null
      mocks.mockDoc.getElementById = () => null;

      const { setTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      // 应该不会抛出错误，只是警告并提前返回
      setTheme('dark');

      // 验证主题不会被设置（因为提前返回了）
      assert.strictEqual(mocks.getThemeAttribute(), 'light', '主题不应该被更改');
    });

    it('应该处理不支持的主题类型', async () => {
      const { setTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      // @ts-ignore - 故意使用无效主题测试
      setTheme('invalid-theme');

      // 应该不改变主题
      assert.strictEqual(mocks.getThemeAttribute(), 'light');
    });
  });

  describe('toggleTheme', () => {
    it('应该从 light 切换到 dark', async () => {
      const { toggleTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      const newTheme = toggleTheme();

      assert.strictEqual(newTheme, 'dark');
      assert.strictEqual(mocks.getThemeAttribute(), 'dark');
      assert.strictEqual(mocks.storage.theme, 'dark');
    });

    it('应该从 dark 切换到 light', async () => {
      // 先设置为 dark
      mocks.mockDoc.body.getAttribute = () => 'dark';

      const { toggleTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      const newTheme = toggleTheme();

      assert.strictEqual(newTheme, 'light');
      assert.strictEqual(mocks.getThemeAttribute(), 'light');
      assert.strictEqual(mocks.storage.theme, 'light');
    });
  });

  describe('initTheme', () => {
    it('应该从 localStorage 恢复保存的主题', async () => {
      mocks.storage.theme = 'dark';

      const { initTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      initTheme();

      assert.strictEqual(mocks.getThemeAttribute(), 'dark');
      assert.ok(mocks.mockIconElement.classList.contains('fa-sun'));
    });

    it('应该在没有保存主题时使用默认主题', async () => {
      // 不设置 mocks.storage.theme

      const { initTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      initTheme();

      assert.strictEqual(mocks.getThemeAttribute(), 'light');
      assert.ok(mocks.mockIconElement.classList.contains('fa-moon'));
    });

    it('应该在保存的主题无效时使用默认主题', async () => {
      mocks.storage.theme = 'invalid-theme';

      const { initTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      initTheme();

      assert.strictEqual(mocks.getThemeAttribute(), 'light');
      assert.ok(mocks.mockIconElement.classList.contains('fa-moon'));
    });

    it('应该在主题图标不存在时警告', async () => {
      mocks.mockDoc.getElementById = () => null;

      const { initTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      // 应该不会抛出错误
      initTheme();
    });
  });

  describe('isDarkTheme', () => {
    it('应该在 dark 主题时返回 true', async () => {
      mocks.mockDoc.body.getAttribute = () => 'dark';

      const { isDarkTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      assert.strictEqual(isDarkTheme(), true);
    });

    it('应该在 light 主题时返回 false', async () => {
      const { isDarkTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      assert.strictEqual(isDarkTheme(), false);
    });
  });

  describe('isLightTheme', () => {
    it('应该在 light 主题时返回 true', async () => {
      const { isLightTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      assert.strictEqual(isLightTheme(), true);
    });

    it('应该在 dark 主题时返回 false', async () => {
      mocks.mockDoc.body.getAttribute = () => 'dark';

      const { isLightTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      assert.strictEqual(isLightTheme(), false);
    });
  });

  describe('watchSystemTheme', () => {
    it('应该监听系统主题变化', async () => {
      const { watchSystemTheme } = await import(
        '../src/services/themeService.js?t=' + Date.now()
      );

      let callbackCalled = false;
      let isDark = false;

      const unsubscribe = watchSystemTheme((dark) => {
        callbackCalled = true;
        isDark = dark;
      });

      // 模拟系统主题变化
      mocks.mockMediaQuery._triggerChange(true);

      assert.strictEqual(callbackCalled, true, '回调应该被调用');
      assert.strictEqual(isDark, true, '应该传递 true (dark)');

      // 取消订阅
      unsubscribe();

      // 再次触发，回调不应该被调用
      callbackCalled = false;
      mocks.mockMediaQuery._triggerChange(false);

      assert.strictEqual(callbackCalled, false, '取消订阅后回调不应该被调用');
    });

    it('应该在不支持 matchMedia 时返回空函数', async () => {
      // Mock 不支持 matchMedia
      Object.defineProperty(globalThis, 'window', {
        writable: true,
        configurable: true,
        value: {},
      });

      const { watchSystemTheme } = await import(
        '../src/services/themeService.js?t=' + Date.now()
      );

      const unsubscribe = watchSystemTheme(() => {});

      assert.strictEqual(typeof unsubscribe, 'function', '应该返回一个函数');
      // 应该不会抛出错误
      unsubscribe();
    });
  });

  describe('边界条件测试', () => {
    it('应该正确处理多次切换主题', async () => {
      const { toggleTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      assert.strictEqual(toggleTheme(), 'dark'); // light -> dark
      assert.strictEqual(toggleTheme(), 'light'); // dark -> light
      assert.strictEqual(toggleTheme(), 'dark'); // light -> dark
      assert.strictEqual(toggleTheme(), 'light'); // dark -> light
    });

    it('应该在设置相同主题时仍然更新 localStorage', async () => {
      const { setTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      setTheme('light');
      assert.strictEqual(mocks.storage.theme, 'light');

      setTheme('light');
      assert.strictEqual(mocks.storage.theme, 'light', '应该更新 localStorage');
    });

    it('应该正确更新主题图标类', async () => {
      const { setTheme } = await import('../src/services/themeService.js?t=' + Date.now());

      setTheme('light');
      assert.ok(mocks.mockIconElement.classList.contains('fa-moon'));
      assert.ok(!mocks.mockIconElement.classList.contains('fa-sun'));

      setTheme('dark');
      assert.ok(mocks.mockIconElement.classList.contains('fa-sun'));
      assert.ok(!mocks.mockIconElement.classList.contains('fa-moon'));
    });
  });
});
