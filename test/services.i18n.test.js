import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

describe('services/i18n.js', () => {
  /** @type {any} */
  let originalWindow;
  /** @type {any} */
  let originalNavigator;
  /** @type {any} */
  let originalDocument;
  /** @type {any} */
  let originalLocalStorage;
  /** @type {Map<string, string>} */
  let localStorageData;
  /** @type {Element[]} */
  let createdElements;

  beforeEach(() => {
    // 保存原始全局对象
    originalWindow = global.window;
    originalNavigator = global.navigator;
    originalDocument = global.document;
    originalLocalStorage = global.localStorage;

    // 重置状态
    localStorageData = new Map();
    createdElements = [];

    // Mock localStorage - 必须支持 Object.keys()
    const localStorageMock = {
      getItem: (key) => localStorageData.get(key) || null,
      setItem: (key, value) => {
        localStorageData.set(key, value);
        localStorageMock[key] = value;
      },
      removeItem: (key) => {
        localStorageData.delete(key);
        delete localStorageMock[key];
      },
      clear: () => {
        localStorageData.clear();
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

    // Mock navigator - 使用 Object.defineProperty
    Object.defineProperty(global, 'navigator', {
      value: {
        language: 'zh-CN',
        userLanguage: 'zh-CN',
      },
      writable: true,
      configurable: true,
    });

    // Mock window
    global.window = {
      dispatchEvent: () => true,
      CustomEvent: class CustomEvent {
        constructor(type, options) {
          this.type = type;
          this.detail = options?.detail || {};
        }
      },
    };

    // Mock document
    global.document = {
      documentElement: {
        lang: '',
      },
      title: '',
      createElement: (tagName) => {
        const element = {
          tagName: tagName.toUpperCase(),
          className: '',
          id: '',
          innerHTML: '',
          textContent: '',
          placeholder: '',
          title: '',
          style: {},
          value: '',
          children: [],
          attributes: new Map(),
          getAttribute: function (name) {
            return this.attributes.get(name) || null;
          },
          setAttribute: function (name, value) {
            this.attributes.set(name, value);
          },
          removeAttribute: function (name) {
            this.attributes.delete(name);
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
        if (selector.startsWith('[')) {
          // 简单的属性选择器支持
          const match = selector.match(/\[([^=]+)(?:="?([^"]*)"?)?\]/);
          if (match) {
            const attrName = match[1];
            const attrValue = match[2];
            return (
              createdElements.find((el) => {
                const value = el.getAttribute(attrName);
                if (attrValue) {
                  return value === attrValue;
                }
                return value !== null;
              }) || null
            );
          }
        }
        if (selector === 'title[data-i18n]') {
          return createdElements.find(
            (el) => el.tagName === 'TITLE' && el.getAttribute('data-i18n')
          ) || null;
        }
        return null;
      },
      querySelectorAll: (selector) => {
        if (selector.startsWith('[')) {
          const match = selector.match(/\[([^=]+)(?:="?([^"]*)"?)?\]/);
          if (match) {
            const attrName = match[1];
            const attrValue = match[2];
            return createdElements.filter((el) => {
              const value = el.getAttribute(attrName);
              if (attrValue) {
                return value === attrValue;
              }
              return value !== null;
            });
          }
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
    if (originalWindow !== undefined) {
      global.window = originalWindow;
    } else {
      delete global.window;
    }

    if (originalNavigator !== undefined) {
      global.navigator = originalNavigator;
    } else {
      delete global.navigator;
    }

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
  });

  describe('I18n', () => {
    describe('constructor', () => {
      it('应该正确初始化实例', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();

        assert.ok(i18n.translations);
        assert.ok(i18n.translations['zh-CN']);
        assert.ok(i18n.translations['en-US']);
        assert.ok(i18n.currentLang);
      });
    });

    describe('detectLanguage()', () => {
      it('应该优先使用 localStorage 中保存的语言', async () => {
        global.localStorage.setItem('language', 'en-US');

        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        const lang = i18n.detectLanguage();

        assert.strictEqual(lang, 'en-US');
      });

      it('应该检测浏览器语言', async () => {
        global.navigator.language = 'zh-CN';

        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        const lang = i18n.detectLanguage();

        assert.strictEqual(lang, 'zh-CN');
      });

      it('应该处理浏览器语言前缀匹配', async () => {
        global.navigator.language = 'en-GB'; // 不完全匹配

        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        const lang = i18n.detectLanguage();

        assert.strictEqual(lang, 'en-US'); // 应该匹配到 en-US
      });

      it('应该在无法匹配时回退到中文', async () => {
        global.navigator.language = 'fr-FR'; // 不支持的语言

        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        const lang = i18n.detectLanguage();

        assert.strictEqual(lang, 'zh-CN');
      });
    });

    describe('t()', () => {
      it('应该正确翻译简单的键', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        i18n.currentLang = 'zh-CN';

        const text = i18n.t('app.title');
        assert.strictEqual(text, 'B站追番日历');
      });

      it('应该支持参数替换', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        i18n.currentLang = 'zh-CN';

        const text = i18n.t('toast.animeCount', { count: 5 });
        assert.strictEqual(text, '成功获取 5 部番剧');
      });

      it('应该在键不存在时返回键本身', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        i18n.currentLang = 'zh-CN';

        const text = i18n.t('nonexistent.key');
        assert.strictEqual(text, 'nonexistent.key');
      });

      it('应该支持多个参数替换', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        i18n.currentLang = 'zh-CN';

        const text = i18n.t('toast.reminderOn', { count: 3, minutes: 10 });
        assert.strictEqual(text, '已为 3 部番剧开启提醒 (提前 10 分钟)');
      });
    });

    describe('setLanguage()', () => {
      it('应该成功切换语言', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        const success = i18n.setLanguage('en-US');

        assert.strictEqual(success, true);
        assert.strictEqual(i18n.currentLang, 'en-US');
        assert.strictEqual(
          global.localStorage.getItem('language'),
          'en-US'
        );
      });

      it('应该在无效语言时返回 false', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        const success = i18n.setLanguage('invalid-LANG');

        assert.strictEqual(success, false);
      });

      it('应该触发 languageChanged 事件', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        let eventFired = false;
        global.window.dispatchEvent = (event) => {
          if (event.type === 'languageChanged') {
            eventFired = true;
            assert.strictEqual(event.detail.language, 'en-US');
          }
          return true;
        };

        const i18n = new I18n();
        i18n.setLanguage('en-US');

        assert.ok(eventFired);
      });
    });

    describe('getLanguage()', () => {
      it('应该返回当前语言', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        i18n.currentLang = 'en-US';

        const lang = i18n.getLanguage();
        assert.strictEqual(lang, 'en-US');
      });
    });

    describe('getAvailableLanguages()', () => {
      it('应该返回所有可用语言', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        const langs = i18n.getAvailableLanguages();

        assert.ok(Array.isArray(langs));
        assert.ok(langs.includes('zh-CN'));
        assert.ok(langs.includes('en-US'));
        assert.strictEqual(langs.length, 2);
      });
    });

    describe('updatePageContent()', () => {
      it('应该更新 HTML lang 属性', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        i18n.currentLang = 'en-US';
        i18n.updatePageContent();

        assert.strictEqual(global.document.documentElement.lang, 'en-US');
      });

      it('应该更新带有 data-i18n 属性的元素', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const element = global.document.createElement('div');
        element.setAttribute('data-i18n', 'app.title');
        createdElements.push(element);

        const i18n = new I18n();
        i18n.currentLang = 'zh-CN';
        i18n.updatePageContent();

        assert.strictEqual(element.textContent, 'B站追番日历');
      });

      it('应该更新带有 data-i18n-placeholder 属性的元素', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const element = global.document.createElement('input');
        element.setAttribute('data-i18n-placeholder', 'input.placeholder');
        createdElements.push(element);

        const i18n = new I18n();
        i18n.currentLang = 'zh-CN';
        i18n.updatePageContent();

        assert.strictEqual(element.placeholder, '例如: 614500');
      });

      it('应该更新带有 data-i18n-title 属性的元素', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const element = global.document.createElement('button');
        element.setAttribute('data-i18n-title', 'theme.switch');
        createdElements.push(element);

        const i18n = new I18n();
        i18n.currentLang = 'zh-CN';
        i18n.updatePageContent();

        assert.strictEqual(element.title, '切换主题');
      });
    });

    describe('updateLanguageToggleLabel()', () => {
      it('应该更新语言切换按钮标签', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const label = global.document.createElement('span');
        label.id = 'languageToggleLabel';
        createdElements.push(label);

        const i18n = new I18n();
        i18n.currentLang = 'zh-CN';
        i18n.updateLanguageToggleLabel();

        assert.strictEqual(label.textContent, 'English');
      });

      it('应该在元素不存在时不报错', async () => {
        const { I18n } = await import(
          `../src/services/i18n.js?t=${Date.now()}`
        );

        const i18n = new I18n();
        // 不创建 languageToggleLabel 元素
        assert.doesNotThrow(() => {
          i18n.updateLanguageToggleLabel();
        });
      });
    });
  });

  describe('全局导出', () => {
    it('应该导出 i18n 实例', async () => {
      const { default: i18n } = await import(
        `../src/services/i18n.js?t=${Date.now()}`
      );

      assert.ok(i18n);
      assert.strictEqual(typeof i18n.t, 'function');
      assert.strictEqual(typeof i18n.setLanguage, 'function');
      assert.strictEqual(typeof i18n.getLanguage, 'function');
    });
  });
});
