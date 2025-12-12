import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

describe('services/cacheManager.js', () => {
  /** @type {any} */
  let originalDocument;
  /** @type {any} */
  let originalLocalStorage;
  /** @type {any} */
  let originalWindow;
  /** @type {Function | null} */
  let originalSetTimeout;
  /** @type {Function | null} */
  let originalClearTimeout;
  /** @type {Function | null} */
  let originalRequestIdleCallback;
  /** @type {Element[]} */
  let createdElements;
  /** @type {Map<string, string>} */
  let localStorageData;

  beforeEach(() => {
    // 保存原始全局对象
    originalDocument = global.document;
    originalLocalStorage = global.localStorage;
    originalWindow = global.window;
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;
    originalRequestIdleCallback = global.requestIdleCallback;

    // 重置状态
    createdElements = [];
    localStorageData = new Map();

    // Mock localStorage - 必须支持 Object.keys()
    const localStorageMock = {
      getItem: (key) => localStorageData.get(key) || null,
      setItem: (key, value) => {
        localStorageData.set(key, value);
        // 同时设置为对象属性，支持 Object.keys()
        localStorageMock[key] = value;
      },
      removeItem: (key) => {
        localStorageData.delete(key);
        delete localStorageMock[key];
      },
      clear: () => {
        localStorageData.clear();
        // 清除所有数据属性
        Object.keys(localStorageMock).forEach((key) => {
          if (
            key !== 'getItem' &&
            key !== 'setItem' &&
            key !== 'removeItem' &&
            key !== 'clear'
          ) {
            delete localStorageMock[key];
          }
        });
      },
    };
    global.localStorage = localStorageMock;

    // Mock window
    global.window = {
      showToast: null, // 默认没有 toast
      requestIdleCallback: null, // 默认不支持
    };

    // Mock requestIdleCallback 全局函数
    global.requestIdleCallback = (callback, options) => {
      // 使用 Node.js 原生 setTimeout 立即执行
      originalSetTimeout(callback, 0);
      return 1; // 返回一个 ID
    };

    // Mock setTimeout/clearTimeout - 使用原生 setTimeout 以支持异步回调
    global.setTimeout = originalSetTimeout || setTimeout;
    global.clearTimeout = originalClearTimeout || clearTimeout;

    // Mock document
    global.document = {
      createElement: (tagName) => {
        const element = {
          tagName: tagName.toUpperCase(),
          className: '',
          id: '',
          innerHTML: '',
          style: {},
          value: '',
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
            const index = createdElements.indexOf(this);
            if (index > -1) {
              createdElements.splice(index, 1);
            }
            this._removed = true;
          },
          appendChild: function (child) {
            this.children.push(child);
          },
          parentElement: null,
        };

        createdElements.push(element);
        return element;
      },
      getElementById: (id) => {
        return createdElements.find((el) => el.id === id) || null;
      },
      querySelector: (selector) => {
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

    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;

    if (originalRequestIdleCallback !== undefined) {
      global.requestIdleCallback = originalRequestIdleCallback;
    } else {
      delete global.requestIdleCallback;
    }
  });

  describe('CacheManager', () => {
    describe('constructor', () => {
      it('应该正确初始化实例', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();

        assert.strictEqual(manager.cachePrefix, 'bili_calendar_');
        assert.strictEqual(manager.maxCacheAge, 3600000);
        assert.strictEqual(manager.maxHistoryItems, 20);
        assert.strictEqual(manager.maxCacheSize, 5 * 1024 * 1024);
      });
    });

    describe('getCachedKeys()', () => {
      it('应该返回 localStorage 所有键', async () => {
        // 使用 localStorage.setItem 而不是直接操作 Map
        global.localStorage.setItem('key1', 'value1');
        global.localStorage.setItem('key2', 'value2');

        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        const keys = manager.getCachedKeys();

        assert.ok(Array.isArray(keys));
        assert.ok(keys.includes('key1'));
        assert.ok(keys.includes('key2'));
      });

      it('应该使用缓存避免重复调用', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        const keys1 = manager.getCachedKeys();
        const keys2 = manager.getCachedKeys();

        // 应该返回相同的数组引用
        assert.strictEqual(keys1, keys2);
      });
    });

    describe('invalidateKeysCache()', () => {
      it('应该使键缓存失效', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        const keys1 = manager.getCachedKeys();
        manager.invalidateKeysCache();
        const keys2 = manager.getCachedKeys();

        // 应该返回不同的数组引用
        assert.notStrictEqual(keys1, keys2);
      });
    });

    describe('getCacheKey()', () => {
      it('应该生成正确的缓存键', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        const key = manager.getCacheKey('anime', '12345');

        assert.strictEqual(key, 'bili_calendar_anime_12345');
      });
    });

    describe('saveToCache()', () => {
      it('应该成功保存缓存', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        const success = manager.saveToCache('anime', '12345', { title: '番剧' });

        assert.strictEqual(success, true);
        const saved = global.localStorage.getItem('bili_calendar_anime_12345');
        assert.ok(saved);

        const parsed = JSON.parse(saved);
        assert.strictEqual(parsed.data.title, '番剧');
        assert.ok(parsed.timestamp);
        assert.strictEqual(parsed.version, '1.0.0');
      });

      it('应该拒绝过大的数据', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        const largeData = 'x'.repeat(10 * 1024 * 1024); // 10MB
        const success = manager.saveToCache('anime', '12345', largeData);

        assert.strictEqual(success, false);
      });
    });

    describe('getFromCache()', () => {
      it('应该读取有效的缓存', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        manager.saveToCache('anime', '12345', { title: '番剧' });

        const data = manager.getFromCache('anime', '12345');
        assert.ok(data);
        assert.strictEqual(data.title, '番剧');
      });

      it('应该在缓存过期时返回 null', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();

        // 保存过期的缓存（使用 localStorage.setItem）
        const oldData = {
          data: { title: '番剧' },
          timestamp: Date.now() - 3700000, // 超过1小时
          version: '1.0.0',
        };
        global.localStorage.setItem(
          'bili_calendar_anime_12345',
          JSON.stringify(oldData)
        );

        const data = manager.getFromCache('anime', '12345');
        assert.strictEqual(data, null);
      });

      it('应该在缓存不存在时返回 null', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        const data = manager.getFromCache('anime', '99999');

        assert.strictEqual(data, null);
      });
    });

    describe('formatSize()', () => {
      it('应该正确格式化字节数', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();

        assert.strictEqual(manager.formatSize(500), '500 B');
        assert.strictEqual(manager.formatSize(1024), '1.00 KB');
        assert.strictEqual(manager.formatSize(1048576), '1.00 MB');
      });
    });

    describe('saveUidHistory()', () => {
      it('应该保存新的历史记录', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        const success = manager.saveUidHistory('614500', '用户名');

        assert.strictEqual(success, true);

        const saved = global.localStorage.getItem('uid_history');
        assert.ok(saved);

        const parsed = JSON.parse(saved);
        assert.strictEqual(parsed.length, 1);
        assert.strictEqual(parsed[0].uid, '614500');
        assert.strictEqual(parsed[0].username, '用户名');
        assert.strictEqual(parsed[0].visitCount, 1);
      });

      it('应该更新已存在的历史记录', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        manager.saveUidHistory('614500', '用户名');
        manager.saveUidHistory('614500', '新用户名');

        const history = manager.getUidHistory();
        assert.strictEqual(history.length, 1);
        assert.strictEqual(history[0].uid, '614500');
        assert.strictEqual(history[0].username, '新用户名');
        assert.strictEqual(history[0].visitCount, 2);
      });

      it('应该限制历史记录数量', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();

        // 添加超过最大数量的记录
        for (let i = 0; i < 25; i++) {
          manager.saveUidHistory(`uid${i}`);
        }

        const history = manager.getUidHistory();
        assert.strictEqual(history.length, 20); // maxHistoryItems = 20
      });
    });

    describe('getUidHistory()', () => {
      it('应该返回历史记录列表', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        manager.saveUidHistory('614500');
        manager.saveUidHistory('672328094');

        const history = manager.getUidHistory();
        assert.strictEqual(history.length, 2);
      });

      it('应该在没有历史记录时返回空数组', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        const history = manager.getUidHistory();

        assert.ok(Array.isArray(history));
        assert.strictEqual(history.length, 0);
      });
    });

    describe('removeHistoryItem()', () => {
      it('应该删除指定的历史记录', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        manager.saveUidHistory('614500');
        manager.saveUidHistory('672328094');

        const success = manager.removeHistoryItem('614500');
        assert.strictEqual(success, true);

        const history = manager.getUidHistory();
        assert.strictEqual(history.length, 1);
        assert.strictEqual(history[0].uid, '672328094');
      });
    });

    describe('clearHistory()', () => {
      it('应该清除所有历史记录', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        manager.saveUidHistory('614500');
        manager.saveUidHistory('672328094');

        const success = manager.clearHistory();
        assert.strictEqual(success, true);

        const history = manager.getUidHistory();
        assert.strictEqual(history.length, 0);
      });
    });

    describe('formatTime()', () => {
      it('应该正确格式化时间', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        const now = Date.now();

        assert.strictEqual(manager.formatTime(now), '刚刚');
        assert.strictEqual(manager.formatTime(now - 60000), '1 分钟前');
        assert.strictEqual(manager.formatTime(now - 3600000), '1 小时前');
        assert.strictEqual(manager.formatTime(now - 86400000), '1 天前');
      });
    });

    describe('clearAllCache()', () => {
      it('应该清除所有项目缓存', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        manager.saveToCache('anime', '12345', { title: '番剧1' });
        manager.saveToCache('anime', '67890', { title: '番剧2' });

        // 添加其他非项目缓存（使用 localStorage.setItem）
        global.localStorage.setItem('other_key', 'other_value');

        manager.clearAllCache();

        // 项目缓存应该被清除（使用 localStorage.getItem）
        assert.strictEqual(
          global.localStorage.getItem('bili_calendar_anime_12345'),
          null
        );
        assert.strictEqual(
          global.localStorage.getItem('bili_calendar_anime_67890'),
          null
        );

        // 其他缓存应该保留
        assert.strictEqual(
          global.localStorage.getItem('other_key'),
          'other_value'
        );
      });
    });

    describe('getCacheStats()', () => {
      it('应该返回正确的缓存统计信息', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        manager.saveToCache('anime', '12345', { title: '番剧' });

        const stats = manager.getCacheStats();

        assert.ok(stats.totalSize);
        assert.strictEqual(stats.itemCount, 1);
        assert.ok(stats.oldestItem);
      });

      it('应该在没有缓存时返回零值', async () => {
        const { CacheManager } = await import(
          `../src/services/cacheManager.js?t=${Date.now()}`
        );

        const manager = new CacheManager();
        const stats = manager.getCacheStats();

        assert.strictEqual(stats.itemCount, 0);
        assert.strictEqual(stats.oldestItem, 'N/A');
      });
    });
  });

  describe('全局导出', () => {
    it('应该导出 cacheManager 实例', async () => {
      const { default: cacheManager } = await import(
        `../src/services/cacheManager.js?t=${Date.now()}`
      );

      assert.ok(cacheManager);
      assert.strictEqual(typeof cacheManager.saveToCache, 'function');
      assert.strictEqual(typeof cacheManager.getFromCache, 'function');
    });
  });
});
