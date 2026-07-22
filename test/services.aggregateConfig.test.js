import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

/**
 * 在加载依赖 i18n 的模块前安装 localStorage / document 夹具
 */
const store = new Map();
/** @type {Record<string, any>} */
const elements = {
  aggregateFeedback: {
    textContent: '',
    classList: {
      values: new Set(),
      remove(...names) {
        names.forEach((n) => this.values.delete(n));
      },
      add(...names) {
        names.forEach((n) => this.values.add(n));
      },
    },
  },
  aggregateOptions: {
    classList: {
      values: new Set(),
      toggle(name, force) {
        if (force) this.values.add(name);
        else this.values.delete(name);
      },
    },
  },
  aggregateToggle: { checked: false },
  sourcesInput: {
    value: '',
    classList: {
      values: new Set(),
      remove(...names) {
        names.forEach((n) => this.values.delete(n));
      },
      add(...names) {
        names.forEach((n) => this.values.add(n));
      },
    },
  },
};

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  },
};

globalThis.document = {
  getElementById(id) {
    return elements[id] || null;
  },
  querySelectorAll() {
    return [];
  },
  documentElement: { lang: 'zh-CN' },
};

/** @type {typeof import('../src/services/aggregateConfig.js')} */
let aggregateConfig;

before(async () => {
  aggregateConfig = await import('../src/services/aggregateConfig.js');
});

describe('services/aggregateConfig.js', () => {
  it('parseAggregateSources: 空输入返回空列表', () => {
    assert.deepEqual(aggregateConfig.parseAggregateSources(''), { sources: [] });
    assert.deepEqual(aggregateConfig.parseAggregateSources('  \n  '), { sources: [] });
  });

  it('parseAggregateSources: 解析逗号与换行分隔的合法 URL', () => {
    const result = aggregateConfig.parseAggregateSources(
      'https://example.com/a.ics\nhttps://example.com/b.ics, https://example.com/c.ics'
    );
    assert.equal(result.error, undefined);
    assert.equal(result.sources?.length, 3);
  });

  it('parseAggregateSources: 超过上限返回错误', () => {
    const urls = Array.from(
      { length: aggregateConfig.MAX_EXTERNAL_SOURCES + 1 },
      (_, i) => `https://example.com/${i}.ics`
    ).join('\n');
    const result = aggregateConfig.parseAggregateSources(urls);
    assert.ok(result.error);
    assert.match(String(result.error), /最多支持|at most/i);
  });

  it('parseAggregateSources: 非法协议返回错误', () => {
    const result = aggregateConfig.parseAggregateSources('ftp://example.com/a.ics');
    assert.ok(result.error);
  });

  it('evaluateAggregateInput: 关闭时返回空 sources', () => {
    const result = aggregateConfig.evaluateAggregateInput(false, 'https://example.com/a.ics');
    assert.equal(result.enabled, false);
    assert.deepEqual(result.sources, []);
  });

  it('evaluateAggregateInput: 开启且有源时反馈数量', () => {
    elements.aggregateFeedback.classList.values.clear();
    const result = aggregateConfig.evaluateAggregateInput(true, 'https://example.com/a.ics');
    assert.equal(result.enabled, true);
    assert.equal(result.sources?.length, 1);
    assert.ok(elements.aggregateFeedback.classList.values.has('success'));
  });

  it('applyAggregateConfig / getAggregateConfig: 读写开关与输入', () => {
    aggregateConfig.applyAggregateConfig({
      enabled: true,
      rawSources: 'https://example.com/work.ics',
    });
    assert.equal(elements.aggregateToggle.checked, true);
    assert.equal(elements.sourcesInput.value, 'https://example.com/work.ics');
    assert.equal(store.get(aggregateConfig.AGG_TOGGLE_STORAGE_KEY), 'true');
    assert.equal(
      store.get(aggregateConfig.AGG_SOURCES_STORAGE_KEY),
      'https://example.com/work.ics'
    );

    const cfg = aggregateConfig.getAggregateConfig();
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.rawSources, 'https://example.com/work.ics');
  });
});
