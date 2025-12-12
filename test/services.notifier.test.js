import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

describe('services/notifier.js', () => {
  /** @type {any} */
  let originalNotification;
  /** @type {any} */
  let originalNavigator;
  /** @type {Function | null} */
  let originalSetTimeout;
  /** @type {Function | null} */
  let originalClearTimeout;
  /** @type {any[]} */
  let timers;

  beforeEach(() => {
    // 保存原始全局对象
    originalNotification = global.Notification;
    originalNavigator = global.navigator;
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;

    // 重置定时器追踪
    timers = [];

    // Mock Notification
    global.Notification = class {
      constructor(title, options) {
        global.Notification._lastTitle = title;
        global.Notification._lastOptions = options;
      }

      static permission = 'default';
      static requestPermission = async () => {
        return global.Notification.permission;
      };
    };

    // Mock navigator
    Object.defineProperty(global, 'navigator', {
      value: {
        language: 'zh-CN',  // i18n 需要这个属性
        userLanguage: 'zh-CN'
      },
      writable: true,
      configurable: true,
    });

    // Mock setTimeout/clearTimeout
    global.setTimeout = ((fn, delay) => {
      const id = { fn, delay, cleared: false };
      timers.push(id);
      return id;
    });

    global.clearTimeout = ((id) => {
      if (id && typeof id === 'object') {
        id.cleared = true;
      }
    });

    // Mock localStorage（i18n 初始化需要）
    global.localStorage = {
      getItem: (key) => null,
      setItem: (key, value) => {},
      removeItem: (key) => {},
      clear: () => {}
    };
  });

  afterEach(() => {
    // 恢复原始环境
    if (originalNotification) {
      global.Notification = originalNotification;
    } else {
      delete global.Notification;
    }

    if (originalNavigator) {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    }

    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;

    // 清理 localStorage mock
    delete global.localStorage;
  });

  describe('hasSupport()', () => {
    it('应该在支持 Notification 时返回 true', async () => {
      global.Notification = class {};
      global.navigator = {};

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      assert.strictEqual(notifier.default.hasSupport(), true);
    });

    it('应该在不支持 Notification 时返回 false', async () => {
      delete global.Notification;
      global.navigator = {};

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      assert.strictEqual(notifier.default.hasSupport(), false);
    });

    it('应该在 navigator 不存在时返回 false', async () => {
      global.Notification = class {};
      delete global.navigator;

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      assert.strictEqual(notifier.default.hasSupport(), false);
    });
  });

  describe('ensurePermission()', () => {
    it('应该在不支持时返回 false', async () => {
      delete global.Notification;

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      const result = await notifier.default.ensurePermission();
      assert.strictEqual(result, false);
    });

    it('应该在已授权时直接返回 true', async () => {
      global.Notification.permission = 'granted';

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      const result = await notifier.default.ensurePermission();
      assert.strictEqual(result, true);
    });

    it('应该在被拒绝时返回 false', async () => {
      global.Notification.permission = 'denied';

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      const result = await notifier.default.ensurePermission();
      assert.strictEqual(result, false);
    });

    it('应该在用户授权后返回 true', async () => {
      global.Notification.permission = 'default';
      global.Notification.requestPermission = async () => {
        global.Notification.permission = 'granted';
        return 'granted';
      };

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      const result = await notifier.default.ensurePermission();
      assert.strictEqual(result, true);
    });

    it('应该在用户拒绝后返回 false', async () => {
      global.Notification.permission = 'default';
      global.Notification.requestPermission = async () => {
        global.Notification.permission = 'denied';
        return 'denied';
      };

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      const result = await notifier.default.ensurePermission();
      assert.strictEqual(result, false);
    });
  });

  describe('clearTimers()', () => {
    it('应该清除所有定时器', async () => {
      global.Notification.permission = 'granted';
      global.navigator.serviceWorker = {
        ready: Promise.resolve({}),
      };

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      // 安排一些提醒
      // rawPubTime 应该是上周的播出时间，代码会 +7天 计算下次播出
      const animeList = [
        {
          title: '测试番剧1',
          rawPubTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // 7天前+3小时 = 下次在3小时后
        },
        {
          title: '测试番剧2',
          rawPubTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000), // 7天前+5小时 = 下次在5小时后
        },
      ];

      await notifier.default.scheduleAnimeReminders(animeList);

      // 应该创建了定时器
      assert.ok(timers.length > 0, '应该创建定时器');

      // 清除定时器
      notifier.default.clearTimers();

      // 验证所有定时器被清除
      timers.forEach((timer) => {
        assert.strictEqual(timer.cleared, true, '定时器应该被清除');
      });
    });
  });

  describe('scheduleAnimeReminders()', () => {
    it('应该在不支持时返回 denied', async () => {
      delete global.Notification;

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      const result = await notifier.default.scheduleAnimeReminders([]);
      assert.deepStrictEqual(result, { scheduled: 0, denied: true });
    });

    it('应该在权限被拒绝时返回 denied', async () => {
      global.Notification.permission = 'denied';

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      const result = await notifier.default.scheduleAnimeReminders([]);
      assert.deepStrictEqual(result, { scheduled: 0, denied: true });
    });

    it('应该过滤掉没有 rawPubTime 的番剧', async () => {
      global.Notification.permission = 'granted';
      global.navigator.serviceWorker = {
        ready: Promise.resolve({}),
      };

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      const animeList = [
        { title: '无效番剧1', rawPubTime: null },
        { title: '无效番剧2', rawPubTime: 'invalid' },
        { title: '无效番剧3' },
      ];

      const result = await notifier.default.scheduleAnimeReminders(animeList);
      assert.strictEqual(result.scheduled, 0, '应该没有安排任何提醒');
      assert.strictEqual(result.denied, false);
    });

    it('应该过滤掉超过24小时的番剧', async () => {
      global.Notification.permission = 'granted';
      global.navigator.serviceWorker = {
        ready: Promise.resolve({}),
      };

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      const animeList = [
        {
          title: '太远的番剧',
          rawPubTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后
        },
      ];

      const result = await notifier.default.scheduleAnimeReminders(animeList);
      assert.strictEqual(result.scheduled, 0, '应该没有安排任何提醒');
    });

    it('应该成功安排24小时内的提醒', async () => {
      global.Notification.permission = 'granted';
      global.navigator.serviceWorker = {
        ready: Promise.resolve({}),
      };

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      // rawPubTime 应该是上周的播出时间，代码会 +7天 计算下次播出
      const animeList = [
        {
          title: '测试番剧1',
          rawPubTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // 7天前+3小时 = 下次在3小时后
        },
        {
          title: '测试番剧2',
          rawPubTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000), // 7天前+5小时 = 下次在5小时后
        },
      ];

      const result = await notifier.default.scheduleAnimeReminders(animeList);
      assert.ok(result.scheduled > 0, '应该安排了提醒');
      assert.strictEqual(result.denied, false);
    });

    it('应该最多安排5条提醒', async () => {
      global.Notification.permission = 'granted';
      global.navigator.serviceWorker = {
        ready: Promise.resolve({}),
      };

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      // 创建10个番剧，rawPubTime 为上周对应时间
      const animeList = Array.from({ length: 10 }, (_, i) => ({
        title: `测试番剧${i + 1}`,
        rawPubTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + (i + 1) * 60 * 60 * 1000), // 7天前+1-10小时
      }));

      const result = await notifier.default.scheduleAnimeReminders(animeList);
      assert.ok(result.scheduled <= 5, '最多应该安排5条提醒');
      assert.strictEqual(result.denied, false);
    });

    it('应该使用自定义提前时间', async () => {
      global.Notification.permission = 'granted';
      global.navigator.serviceWorker = {
        ready: Promise.resolve({}),
      };

      const notifier = await import(
        `../src/services/notifier.js?t=${Date.now()}`
      );

      // rawPubTime 应该是上周的播出时间
      const animeList = [
        {
          title: '测试番剧',
          rawPubTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000), // 7天前+3小时 = 下次在3小时后
        },
      ];

      const result = await notifier.default.scheduleAnimeReminders(animeList, {
        leadMinutes: 10,
      });

      assert.ok(result.scheduled > 0, '应该安排了提醒');
      assert.strictEqual(result.denied, false);
    });
  });
});
