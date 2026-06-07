// @ts-check
/**
 * 聚合订阅配置管理
 * 负责外部 ICS 源输入、持久化和即时校验反馈。
 */

import i18n from './i18n.js';

export const MAX_EXTERNAL_SOURCES = 5;
export const AGG_SOURCES_STORAGE_KEY = 'aggregateSources';
export const AGG_TOGGLE_STORAGE_KEY = 'aggregateToggleEnabled';

/**
 * @typedef {{sources?: string[], error?: string}} AggregateParseResult
 * @typedef {{enabled?: boolean, rawSources?: string}} AggregateConfigState
 * @typedef {{enabled?: boolean, sources?: string[], error?: string}} AggregateConfigResult
 */

/**
 * @param {string} [rawValue=''] - 外部 ICS 源原始输入
 * @returns {AggregateParseResult}
 */
export function parseAggregateSources(rawValue = '') {
  if (!rawValue) {
    return { sources: [] };
  }

  const tokens = rawValue
    .split(/[\n,]/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { sources: [] };
  }

  if (tokens.length > MAX_EXTERNAL_SOURCES) {
    return { error: i18n.t('aggregate.errorTooMany', { count: MAX_EXTERNAL_SOURCES }) };
  }

  /** @type {string[]} */
  const normalized = [];
  for (const token of tokens) {
    let parsed;
    try {
      parsed = new URL(token);
    } catch {
      return { error: i18n.t('aggregate.errorInvalid', { url: token }) };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { error: i18n.t('aggregate.errorProtocol', { url: token }) };
    }

    normalized.push(parsed.toString());
  }

  return { sources: normalized };
}

/**
 * @param {string} [message=''] - 提示文本
 * @param {'info'|'success'|'error'|'muted'} [type='info'] - 提示类型
 * @returns {void}
 */
function setAggregateFeedback(message = '', type = 'info') {
  const feedbackEl = document.getElementById('aggregateFeedback');
  if (!feedbackEl) return;
  feedbackEl.textContent = message || '';
  feedbackEl.classList.remove('success', 'error', 'muted');
  if (type === 'success' || type === 'error' || type === 'muted') {
    feedbackEl.classList.add(type);
  }
}

/**
 * @param {boolean} enabled - 是否启用聚合
 * @returns {void}
 */
function updateAggregateContainerState(enabled) {
  const container = document.getElementById('aggregateOptions');
  if (container) {
    container.classList.toggle('active', !!enabled);
  }
}

/**
 * @param {boolean} enabled - 是否启用聚合
 * @param {string} [rawValue=''] - 外部 ICS 源原始输入
 * @returns {AggregateConfigResult}
 */
export function evaluateAggregateInput(enabled, rawValue = '') {
  updateAggregateContainerState(enabled);
  const inputEl = document.getElementById('sourcesInput');
  if (inputEl) {
    inputEl.classList.remove('input-error');
  }

  if (!enabled) {
    setAggregateFeedback(i18n.t('aggregate.feedbackDisabled'), 'muted');
    return { enabled: false, sources: [] };
  }

  const parsed = parseAggregateSources(rawValue);
  if (parsed.error) {
    if (inputEl) {
      inputEl.classList.add('input-error');
    }
    setAggregateFeedback(parsed.error, 'error');
    return { enabled: true, error: parsed.error };
  }

  const sources = parsed.sources || [];
  if (sources.length > 0) {
    setAggregateFeedback(i18n.t('aggregate.feedbackCount', { count: sources.length }), 'success');
  } else {
    setAggregateFeedback(i18n.t('aggregate.feedbackEmpty'), 'muted');
  }

  return { enabled: true, sources };
}

/**
 * @returns {{container: HTMLElement|null, toggle: HTMLInputElement|null, input: HTMLTextAreaElement|null}}
 */
function getAggregateElements() {
  return {
    container: document.getElementById('aggregateOptions'),
    toggle: /** @type {HTMLInputElement|null} */ (document.getElementById('aggregateToggle')),
    input: /** @type {HTMLTextAreaElement|null} */ (document.getElementById('sourcesInput')),
  };
}

/**
 * @returns {{enabled: boolean, rawSources: string}}
 */
export function getAggregateConfig() {
  const { toggle, input } = getAggregateElements();
  return {
    enabled: !!(toggle && toggle.checked),
    rawSources: input ? input.value : '',
  };
}

/**
 * @param {AggregateConfigState} [config={}] - 聚合配置
 * @returns {AggregateConfigResult}
 */
export function applyAggregateConfig({ enabled, rawSources } = {}) {
  const { toggle, input } = getAggregateElements();

  if (toggle && typeof enabled === 'boolean') {
    toggle.checked = enabled;
    localStorage.setItem(AGG_TOGGLE_STORAGE_KEY, String(enabled));
  }

  if (input && typeof rawSources === 'string') {
    input.value = rawSources;
    if (rawSources.trim()) {
      localStorage.setItem(AGG_SOURCES_STORAGE_KEY, rawSources);
    } else {
      localStorage.removeItem(AGG_SOURCES_STORAGE_KEY);
    }
  }

  const currentToggle = toggle ? toggle.checked : false;
  const currentRaw = input ? input.value.trim() : '';
  const result = evaluateAggregateInput(currentToggle, currentRaw);
  if (!currentToggle && input) {
    input.classList.remove('input-error');
  }
  return result;
}

export function initAggregateConfig() {
  const sourcesInput = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('sourcesInput'));
  const aggregateToggle = /** @type {HTMLInputElement|null} */ (
    document.getElementById('aggregateToggle')
  );
  const savedSources = localStorage.getItem(AGG_SOURCES_STORAGE_KEY) || '';
  const savedToggle = localStorage.getItem(AGG_TOGGLE_STORAGE_KEY);
  const initialEnabled = savedToggle === 'true';

  applyAggregateConfig({ enabled: initialEnabled, rawSources: savedSources });

  if (aggregateToggle) {
    aggregateToggle.addEventListener('change', () => {
      applyAggregateConfig({ enabled: aggregateToggle.checked });
    });
  }

  if (sourcesInput) {
    sourcesInput.addEventListener('input', () => {
      applyAggregateConfig({ rawSources: sourcesInput.value });
    });
  }
}

export const aggregateConfig = {
  get: getAggregateConfig,
  apply: applyAggregateConfig,
};
