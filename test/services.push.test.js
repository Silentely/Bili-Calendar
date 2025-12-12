import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

describe('services/push.js', () => {
  /** @type {any} */
  let originalNavigator;
  /** @type {any} */
  let originalWindow;
  /** @type {any} */
  let originalFetch;

  beforeEach(() => {
    // 保存原始全局对象
    originalNavigator = global.navigator;
    originalWindow = global.window;
    originalFetch = global.fetch;

    // Mock navigator
    Object.defineProperty(global, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });

    // Mock window
    global.window = {};

    // Mock fetch
    global.fetch = async (url, options) => {
      throw new Error('fetch not mocked');
    };
  });

  afterEach(() => {
    // 恢复原始环境
    if (originalNavigator) {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    }

    global.window = originalWindow;
    global.fetch = originalFetch;
  });

  describe('registerPush()', () => {
    it('应该在不支持 Service Worker 时抛出 push-not-supported 错误', async () => {
      // navigator.serviceWorker 不存在
      delete global.navigator.serviceWorker;
      global.window.PushManager = class {};

      const { default: push } = await import(
        `../src/services/push.js?t=${Date.now()}`
      );

      await assert.rejects(
        async () => {
          await push.registerPush();
        },
        {
          name: 'Error',
          message: 'push-not-supported',
        }
      );
    });

    it('应该在不支持 PushManager 时抛出 push-not-supported 错误', async () => {
      global.navigator.serviceWorker = { ready: Promise.resolve({}) };
      // window.PushManager 不存在
      delete global.window.PushManager;

      const { default: push } = await import(
        `../src/services/push.js?t=${Date.now()}`
      );

      await assert.rejects(
        async () => {
          await push.registerPush();
        },
        {
          name: 'Error',
          message: 'push-not-supported',
        }
      );
    });

    it('应该在获取公钥失败时抛出 no-public-key 错误', async () => {
      global.navigator.serviceWorker = {
        ready: Promise.resolve({}),
      };
      global.window.PushManager = class {};

      // Mock fetch 返回失败响应
      global.fetch = async (url) => {
        if (url === '/push/public-key') {
          return {
            ok: false,
            status: 404,
          };
        }
        throw new Error('Unexpected URL');
      };

      const { default: push } = await import(
        `../src/services/push.js?t=${Date.now()}`
      );

      await assert.rejects(
        async () => {
          await push.registerPush();
        },
        {
          name: 'Error',
          message: 'no-public-key',
        }
      );
    });

    it('应该在公钥响应无效时抛出 empty-key 错误', async () => {
      global.navigator.serviceWorker = {
        ready: Promise.resolve({}),
      };
      global.window.PushManager = class {};

      // Mock fetch 返回空 key
      global.fetch = async (url) => {
        if (url === '/push/public-key') {
          return {
            ok: true,
            json: async () => ({ key: null }),
          };
        }
        throw new Error('Unexpected URL');
      };

      const { default: push } = await import(
        `../src/services/push.js?t=${Date.now()}`
      );

      await assert.rejects(
        async () => {
          await push.registerPush();
        },
        {
          name: 'Error',
          message: 'empty-key',
        }
      );
    });

    it('应该在订阅失败时抛出 subscribe-failed 错误', async () => {
      const mockSubscription = {
        endpoint: 'https://example.com/push',
        keys: {
          p256dh: 'key1',
          auth: 'key2',
        },
      };

      global.navigator.serviceWorker = {
        ready: Promise.resolve({
          pushManager: {
            subscribe: async () => mockSubscription,
          },
        }),
      };
      global.window.PushManager = class {};

      // Mock atob (base64 解码)
      global.atob = (str) => {
        const buf = Buffer.from(str, 'base64');
        return buf.toString('binary');
      };

      let subscribeCallCount = 0;

      // Mock fetch
      global.fetch = async (url, options) => {
        if (url === '/push/public-key') {
          return {
            ok: true,
            json: async () => ({ key: 'BPk1Q2JNqC_abcdefgh' }),
          };
        }
        if (url === '/push/subscribe') {
          subscribeCallCount++;
          return {
            ok: false,
            status: 500,
          };
        }
        throw new Error('Unexpected URL');
      };

      const { default: push } = await import(
        `../src/services/push.js?t=${Date.now()}`
      );

      await assert.rejects(
        async () => {
          await push.registerPush();
        },
        {
          name: 'Error',
          message: 'subscribe-failed',
        }
      );

      assert.strictEqual(subscribeCallCount, 1, '应该尝试订阅');
    });

    it('应该成功注册推送服务', async () => {
      const mockSubscription = {
        endpoint: 'https://example.com/push',
        keys: {
          p256dh: 'key1',
          auth: 'key2',
        },
        toJSON: function () {
          return {
            endpoint: this.endpoint,
            keys: this.keys,
          };
        },
      };

      let subscribeOptions = null;
      let subscribeCalled = false;
      let postBody = null;

      global.navigator.serviceWorker = {
        ready: Promise.resolve({
          pushManager: {
            subscribe: async (options) => {
              subscribeCalled = true;
              subscribeOptions = options;
              return mockSubscription;
            },
          },
        }),
      };
      global.window.PushManager = class {};

      // Mock atob (base64 解码)
      global.atob = (str) => {
        const buf = Buffer.from(str, 'base64');
        return buf.toString('binary');
      };

      // Mock fetch
      global.fetch = async (url, options) => {
        if (url === '/push/public-key') {
          return {
            ok: true,
            json: async () => ({ key: 'BPk1Q2JNqC_abcdefgh' }),
          };
        }
        if (url === '/push/subscribe') {
          postBody = options.body;
          return {
            ok: true,
            json: async () => ({ success: true }),
          };
        }
        throw new Error('Unexpected URL');
      };

      const { default: push } = await import(
        `../src/services/push.js?t=${Date.now()}`
      );

      const result = await push.registerPush();

      assert.strictEqual(result, true, '应该返回 true');
      assert.strictEqual(subscribeCalled, true, '应该调用 subscribe');
      assert.ok(subscribeOptions, '应该传递 subscribe 选项');
      assert.strictEqual(
        subscribeOptions.userVisibleOnly,
        true,
        '应该设置 userVisibleOnly'
      );
      assert.ok(
        subscribeOptions.applicationServerKey instanceof Uint8Array,
        '应该设置 applicationServerKey 为 Uint8Array'
      );
      assert.ok(postBody, '应该发送订阅数据');
    });

    it('应该正确转换 URL-safe Base64 为 Uint8Array', async () => {
      // 这个测试通过完整流程验证 urlBase64ToUint8Array 函数
      const mockSubscription = {
        endpoint: 'https://example.com/push',
        keys: { p256dh: 'key1', auth: 'key2' },
      };

      let applicationServerKey = null;

      global.navigator.serviceWorker = {
        ready: Promise.resolve({
          pushManager: {
            subscribe: async (options) => {
              applicationServerKey = options.applicationServerKey;
              return mockSubscription;
            },
          },
        }),
      };
      global.window.PushManager = class {};

      global.atob = (str) => {
        const buf = Buffer.from(str, 'base64');
        return buf.toString('binary');
      };

      global.fetch = async (url) => {
        if (url === '/push/public-key') {
          // 使用一个简单的 base64 字符串进行测试
          return {
            ok: true,
            json: async () => ({ key: 'QUJD' }), // "ABC" in base64
          };
        }
        if (url === '/push/subscribe') {
          return { ok: true, json: async () => ({}) };
        }
        throw new Error('Unexpected URL');
      };

      const { default: push } = await import(
        `../src/services/push.js?t=${Date.now()}`
      );

      await push.registerPush();

      assert.ok(
        applicationServerKey instanceof Uint8Array,
        '应该生成 Uint8Array'
      );
      assert.strictEqual(applicationServerKey.length, 3, '长度应该正确');
      // "ABC" 的字符码分别是 65, 66, 67
      assert.strictEqual(
        applicationServerKey[0],
        65,
        '第1个字节应该是 A (65)'
      );
      assert.strictEqual(
        applicationServerKey[1],
        66,
        '第2个字节应该是 B (66)'
      );
      assert.strictEqual(
        applicationServerKey[2],
        67,
        '第3个字节应该是 C (67)'
      );
    });

    it('应该正确处理 URL-safe Base64 中的 - 和 _', async () => {
      const mockSubscription = {
        endpoint: 'https://example.com/push',
        keys: { p256dh: 'key1', auth: 'key2' },
      };

      let applicationServerKey = null;

      global.navigator.serviceWorker = {
        ready: Promise.resolve({
          pushManager: {
            subscribe: async (options) => {
              applicationServerKey = options.applicationServerKey;
              return mockSubscription;
            },
          },
        }),
      };
      global.window.PushManager = class {};

      global.atob = (str) => {
        const buf = Buffer.from(str, 'base64');
        return buf.toString('binary');
      };

      global.fetch = async (url) => {
        if (url === '/push/public-key') {
          // 使用包含 - 和 _ 的 URL-safe base64
          return {
            ok: true,
            json: async () => ({ key: 'QUI-X18_' }), // URL-safe version of "AB?__?"
          };
        }
        if (url === '/push/subscribe') {
          return { ok: true, json: async () => ({}) };
        }
        throw new Error('Unexpected URL');
      };

      const { default: push } = await import(
        `../src/services/push.js?t=${Date.now()}`
      );

      await push.registerPush();

      assert.ok(
        applicationServerKey instanceof Uint8Array,
        '应该生成 Uint8Array'
      );
      assert.ok(applicationServerKey.length > 0, '应该有内容');
    });

    it('应该缓存时不发送缓存请求', async () => {
      const mockSubscription = {
        endpoint: 'https://example.com/push',
        keys: { p256dh: 'key1', auth: 'key2' },
      };

      global.navigator.serviceWorker = {
        ready: Promise.resolve({
          pushManager: {
            subscribe: async () => mockSubscription,
          },
        }),
      };
      global.window.PushManager = class {};

      global.atob = (str) => {
        const buf = Buffer.from(str, 'base64');
        return buf.toString('binary');
      };

      let fetchOptions = null;

      global.fetch = async (url, options) => {
        if (url === '/push/public-key') {
          fetchOptions = options;
          return {
            ok: true,
            json: async () => ({ key: 'QUJD' }),
          };
        }
        if (url === '/push/subscribe') {
          return { ok: true, json: async () => ({}) };
        }
        throw new Error('Unexpected URL');
      };

      const { default: push } = await import(
        `../src/services/push.js?t=${Date.now()}`
      );

      await push.registerPush();

      assert.ok(fetchOptions, '应该有 fetch 选项');
      assert.strictEqual(
        fetchOptions.cache,
        'no-store',
        '应该设置 cache: no-store'
      );
    });
  });
});
