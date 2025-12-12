/**
 * deviceDetector 单元测试
 * 测试设备检测工具函数
 *
 * 注意：由于这些函数依赖浏览器 navigator 对象，
 * 我们需要在 Node.js 环境中模拟这些对象
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

// 保存原始的 navigator 描述符
let originalNavigatorDescriptor;
let originalWindowDescriptor;

/**
 * 模拟 navigator 对象
 * @param {string} userAgent
 * @param {Partial<Navigator>} props
 */
function mockNavigator(userAgent, props = {}) {
  Object.defineProperty(globalThis, 'navigator', {
    writable: true,
    configurable: true,
    value: {
      userAgent,
      maxTouchPoints: 0,
      msMaxTouchPoints: 0,
      ...props,
    },
  });
}

/**
 * 模拟 window 对象
 * @param {Record<string, any>} props
 */
function mockWindow(props = {}) {
  Object.defineProperty(globalThis, 'window', {
    writable: true,
    configurable: true,
    value: props,
  });
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

  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    delete globalThis.window;
  }
}

describe('deviceDetector', () => {
  beforeEach(() => {
    // 保存原始描述符
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  });

  afterEach(() => {
    // 恢复原始环境
    restoreEnvironment();
  });

  describe('isMobile', () => {
    it('应该识别 iPhone 设备', async () => {
      mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      mockWindow({});

      const { isMobile } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isMobile(), true);
    });

    it('应该识别 Android 手机', async () => {
      mockNavigator('Mozilla/5.0 (Linux; Android 10) Mobile');
      mockWindow({});

      const { isMobile } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isMobile(), true);
    });

    it('应该识别 iPad', async () => {
      mockNavigator('Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)');
      mockWindow({});

      const { isMobile } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isMobile(), true);
    });

    it('应该排除桌面设备', async () => {
      mockNavigator('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0');
      mockWindow({});

      const { isMobile } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isMobile(), false);
    });

    it('应该识别 Opera Mini', async () => {
      mockNavigator('Opera/9.80 (J2ME/MIDP; Opera Mini/5.0)');
      mockWindow({});

      const { isMobile } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isMobile(), true);
    });
  });

  describe('isIOS', () => {
    it('应该识别 iPhone', async () => {
      mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      mockWindow({});

      const { isIOS } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isIOS(), true);
    });

    it('应该识别 iPad', async () => {
      mockNavigator('Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)');
      mockWindow({});

      const { isIOS } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isIOS(), true);
    });

    it('应该识别 iPod', async () => {
      mockNavigator('Mozilla/5.0 (iPod touch; CPU iPhone OS 14_0 like Mac OS X)');
      mockWindow({});

      const { isIOS } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isIOS(), true);
    });

    it('应该排除 Android 设备', async () => {
      mockNavigator('Mozilla/5.0 (Linux; Android 10) Mobile');
      mockWindow({});

      const { isIOS } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isIOS(), false);
    });

    it('应该排除桌面设备', async () => {
      mockNavigator('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0');
      mockWindow({});

      const { isIOS } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isIOS(), false);
    });
  });

  describe('isAndroid', () => {
    it('应该识别 Android 手机', async () => {
      mockNavigator('Mozilla/5.0 (Linux; Android 10) Mobile');
      mockWindow({});

      const { isAndroid } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isAndroid(), true);
    });

    it('应该识别 Android 平板', async () => {
      mockNavigator('Mozilla/5.0 (Linux; Android 10)');
      mockWindow({});

      const { isAndroid } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isAndroid(), true);
    });

    it('应该排除 iOS 设备', async () => {
      mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      mockWindow({});

      const { isAndroid } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isAndroid(), false);
    });

    it('应该排除桌面设备', async () => {
      mockNavigator('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0');
      mockWindow({});

      const { isAndroid } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isAndroid(), false);
    });
  });

  describe('isTouchDevice', () => {
    it('应该识别支持 ontouchstart 的设备', async () => {
      mockNavigator('Mozilla/5.0 (iPhone)', { maxTouchPoints: 0 });
      mockWindow({ ontouchstart: null });

      const { isTouchDevice } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isTouchDevice(), true);
    });

    it('应该识别 maxTouchPoints > 0 的设备', async () => {
      mockNavigator('Mozilla/5.0 (Windows NT 10.0)', { maxTouchPoints: 10 });
      mockWindow({});

      const { isTouchDevice } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isTouchDevice(), true);
    });

    it('应该识别 msMaxTouchPoints > 0 的设备', async () => {
      mockNavigator('Mozilla/5.0 (Windows NT 10.0)', {
        maxTouchPoints: 0,
        msMaxTouchPoints: 5,
      });
      mockWindow({});

      const { isTouchDevice } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isTouchDevice(), true);
    });

    it('应该排除非触摸设备', async () => {
      mockNavigator('Mozilla/5.0 (Windows NT 10.0)', { maxTouchPoints: 0 });
      mockWindow({});

      const { isTouchDevice } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isTouchDevice(), false);
    });
  });

  describe('getDeviceType', () => {
    it('应该识别 iPad 为 tablet', async () => {
      mockNavigator('Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)');
      mockWindow({});

      const { getDeviceType } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(getDeviceType(), 'tablet');
    });

    it('应该识别 Android 平板为 tablet', async () => {
      mockNavigator('Mozilla/5.0 (Linux; Android 10)');
      mockWindow({});

      const { getDeviceType } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(getDeviceType(), 'tablet');
    });

    it('应该识别 iPhone 为 mobile', async () => {
      mockNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');
      mockWindow({});

      const { getDeviceType } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(getDeviceType(), 'mobile');
    });

    it('应该识别 Android 手机为 mobile', async () => {
      mockNavigator('Mozilla/5.0 (Linux; Android 10) Mobile');
      mockWindow({});

      const { getDeviceType } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(getDeviceType(), 'mobile');
    });

    it('应该识别桌面设备为 desktop', async () => {
      mockNavigator('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0');
      mockWindow({});

      const { getDeviceType } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(getDeviceType(), 'desktop');
    });

    it('应该识别 macOS 为 desktop', async () => {
      mockNavigator('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15');
      mockWindow({});

      const { getDeviceType } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(getDeviceType(), 'desktop');
    });
  });

  describe('边界条件测试', () => {
    it('应该处理空 User-Agent', async () => {
      mockNavigator('');
      mockWindow({});

      const { isMobile, isIOS, isAndroid, getDeviceType } = await import(
        '../src/utils/deviceDetector.js?t=' + Date.now()
      );

      assert.strictEqual(isMobile(), false);
      assert.strictEqual(isIOS(), false);
      assert.strictEqual(isAndroid(), false);
      assert.strictEqual(getDeviceType(), 'desktop');
    });

    it('应该处理异常的 User-Agent', async () => {
      mockNavigator('Some-Weird-Bot/1.0');
      mockWindow({});

      const { isMobile, getDeviceType } = await import(
        '../src/utils/deviceDetector.js?t=' + Date.now()
      );

      assert.strictEqual(isMobile(), false);
      assert.strictEqual(getDeviceType(), 'desktop');
    });

    it('应该处理混合大小写的 User-Agent', async () => {
      mockNavigator('Mozilla/5.0 (iPHONE; CPU iPhone OS 14_0 like Mac OS X)');
      mockWindow({});

      const { isIOS } = await import('../src/utils/deviceDetector.js?t=' + Date.now());
      assert.strictEqual(isIOS(), true);
    });
  });
});
