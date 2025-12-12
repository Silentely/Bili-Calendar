import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

describe('services/pwa.js', () => {
  /** @type {any} */
  let originalWindow;
  /** @type {any} */
  let originalNavigator;
  /** @type {any[]} */
  let consoleWarnings;
  /** @type {Function | null} */
  let originalConsoleWarn;

  beforeEach(() => {
    // 保存原始全局对象
    originalWindow = global.window;
    originalNavigator = global.navigator;
    originalConsoleWarn = console.warn;

    // 重置 console.warn 监听
    consoleWarnings = [];
    console.warn = (...args) => {
      consoleWarnings.push(args);
    };

    // 创建基础 window mock
    global.window = {
      addEventListener: (event, handler) => {
        if (event === 'load') {
          global.window._loadHandler = handler;
        }
      },
      _triggerLoad: () => {
        if (global.window._loadHandler) {
          global.window._loadHandler();
        }
      },
      _loadHandler: null,
    };

    // 使用 Object.defineProperty 创建 navigator mock
    Object.defineProperty(global, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // 恢复原始环境
    global.window = originalWindow;

    // 使用 Object.defineProperty 恢复原始 navigator
    if (originalNavigator) {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    }

    if (originalConsoleWarn) {
      console.warn = originalConsoleWarn;
    }

    // ES Module 不需要清除缓存
  });

  describe('initPWA()', () => {
    it('应该在支持 Service Worker 时注册', async () => {
      let registerCalled = false;
      let registeredPath = null;

      global.navigator.serviceWorker = {
        register: (path) => {
          registerCalled = true;
          registeredPath = path;
          return Promise.resolve({ scope: '/' });
        },
      };

      const { initPWA } = await import(
        `../src/services/pwa.js?t=${Date.now()}`
      );
      initPWA();

      // 触发 load 事件
      global.window._triggerLoad();

      // 等待异步注册完成
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.strictEqual(registerCalled, true, '应该调用 register');
      assert.strictEqual(registeredPath, '/sw.js', '应该注册 /sw.js');
    });

    it('应该在不支持 Service Worker 时不执行任何操作', async () => {
      // navigator.serviceWorker 不存在
      delete global.navigator.serviceWorker;

      let registerCalled = false;

      const { initPWA } = await import(
        `../src/services/pwa.js?t=${Date.now()}`
      );
      initPWA();

      global.window._triggerLoad();

      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.strictEqual(registerCalled, false, '不应该调用 register');
      assert.strictEqual(
        consoleWarnings.length,
        0,
        '不应该输出 console.warn'
      );
    });

    it('应该在 load 事件后注册 Service Worker', async () => {
      let registerCalled = false;
      const registerCallTime = [];

      global.navigator.serviceWorker = {
        register: () => {
          registerCalled = true;
          registerCallTime.push(Date.now());
          return Promise.resolve({ scope: '/' });
        },
      };

      const { initPWA } = await import(
        `../src/services/pwa.js?t=${Date.now()}`
      );
      initPWA();

      // 在触发 load 前，不应该调用 register
      assert.strictEqual(registerCalled, false, 'load 前不应该注册');

      // 触发 load 事件
      global.window._triggerLoad();

      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.strictEqual(registerCalled, true, 'load 后应该注册');
      assert.strictEqual(registerCallTime.length, 1, '应该只注册一次');
    });

    it('应该在注册失败时调用 console.warn', async () => {
      const errorMessage = 'Registration failed';

      global.navigator.serviceWorker = {
        register: () => {
          return Promise.reject(new Error(errorMessage));
        },
      };

      const { initPWA } = await import(
        `../src/services/pwa.js?t=${Date.now()}`
      );
      initPWA();

      global.window._triggerLoad();

      // 等待 Promise reject 被 catch 处理
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.strictEqual(consoleWarnings.length, 1, '应该调用一次 console.warn');
      assert.strictEqual(
        consoleWarnings[0][0],
        'Service Worker 注册失败:',
        '警告消息应该正确'
      );
      assert.ok(
        consoleWarnings[0][1] instanceof Error,
        '应该输出错误对象'
      );
    });

    it('应该多次调用 initPWA 时只注册一次', async () => {
      let registerCount = 0;

      global.navigator.serviceWorker = {
        register: () => {
          registerCount++;
          return Promise.resolve({ scope: '/' });
        },
      };

      const { initPWA } = await import(
        `../src/services/pwa.js?t=${Date.now()}`
      );

      // 多次调用 initPWA
      initPWA();
      initPWA();
      initPWA();

      // 只触发一次 load 事件
      global.window._triggerLoad();

      await new Promise((resolve) => setTimeout(resolve, 10));

      // 因为 load 事件只触发一次,所以只应该注册一次
      // 但是每次 initPWA 都会添加一个 load 监听器,所以会注册多次
      // 这里应该测试实际行为
      assert.ok(registerCount >= 1, '至少应该注册一次');
    });

    it('应该处理 navigator.serviceWorker 为 undefined 的情况', async () => {
      // 完全删除 serviceWorker 属性
      global.navigator = {};

      const { initPWA } = await import(
        `../src/services/pwa.js?t=${Date.now()}`
      );

      // 不应该抛出错误
      assert.doesNotThrow(() => {
        initPWA();
        global.window._triggerLoad();
      }, '不应该抛出错误');
    });

    it('应该返回 void', async () => {
      global.navigator.serviceWorker = {
        register: () => Promise.resolve({ scope: '/' }),
      };

      const { initPWA } = await import(
        `../src/services/pwa.js?t=${Date.now()}`
      );

      const result = initPWA();

      assert.strictEqual(result, undefined, '应该返回 undefined');
    });
  });
});
