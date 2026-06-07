// @ts-check
/**
 * 订阅流程服务
 * 负责 UID 预检、番剧预览、订阅链接生成和复制操作。
 */

import i18n from './i18n.js';
import { errorHandler } from './errorHandler.js';
import cacheManager from './cacheManager.js';
import animePreview from '../components/AnimePreview.js';
import notifier from './notifier.js';
import pushService from './push.js';
import { toHalfWidth } from '../utils/stringUtils.js';
import { isMobile } from '../utils/deviceDetector.js';
import { showToast } from './toastService.js';
import { showProgressBar } from './progressService.js';
import { showLoadingOverlay } from './loadingService.js';
import { showResultAnimation } from './animationService.js';
import { copyFromElement } from './clipboardService.js';
import {
  AGG_SOURCES_STORAGE_KEY,
  evaluateAggregateInput,
} from './aggregateConfig.js';

/**
 * @typedef {{code?: number, message?: string, data?: {list?: any[]}} & Record<string, any>} ApiBody
 */

/**
 * @returns {HTMLInputElement|null}
 */
function getUidInput() {
  return /** @type {HTMLInputElement|null} */ (
    document.getElementById('uidInput') || document.getElementById('uid')
  );
}

/**
 * @param {HTMLInputElement} input - UID 输入框
 * @returns {string}
 */
function normalizeUidFromInput(input) {
  return toHalfWidth(input.value.trim());
}

/**
 * @param {string} uid - B站用户 UID
 * @returns {boolean}
 */
function validateUid(uid) {
  return !!uid && /^[0-9]+$/.test(uid);
}

/**
 * @param {any[]} animeData - 预览番剧数据
 * @returns {void}
 */
function bindPreviewActions(animeData) {
  const reminderBtn = document.getElementById('enableReminder');
  if (reminderBtn) {
    reminderBtn.addEventListener('click', async () => {
      const leadSelect = /** @type {HTMLSelectElement|null} */ (
        document.getElementById('reminderLead')
      );
      const lead = leadSelect ? Number(leadSelect.value) || 5 : 5;
      const result = await notifier.scheduleAnimeReminders(animeData, { leadMinutes: lead });
      if (result.denied) {
        showToast(i18n.t('toast.reminderDenied'), 'warning');
      } else {
        showToast(i18n.t('toast.reminderOn', { count: result.scheduled, minutes: lead }), 'success');
      }
    });
  }

  const leadSelect = /** @type {HTMLSelectElement|null} */ (
    document.getElementById('reminderLead')
  );
  if (leadSelect) {
    const saved = localStorage.getItem('reminderLeadMinutes');
    if (saved) leadSelect.value = saved;
    leadSelect.addEventListener('change', (event) => {
      const target = event.target instanceof HTMLSelectElement ? event.target : null;
      if (!target) return;
      localStorage.setItem('reminderLeadMinutes', target.value);
      showToast(i18n.t('toast.reminderLeadSaved', { minutes: target.value }), 'info');
    });
  }

  const pushBtn = document.getElementById('enablePush');
  if (pushBtn) {
    pushBtn.addEventListener('click', async () => {
      try {
        await notifier.ensurePermission();
        await pushService.registerPush();
        showToast(i18n.t('toast.pushEnabled'), 'success');
      } catch (err) {
        console.error(err);
        showToast(i18n.t('toast.pushFailed'), 'error');
      }
    });
  }
}

export function copyToClipboard() {
  copyFromElement('subscribeUrl', {
    onSuccess: () => {
      showToast(i18n.t('toast.copied'), 'success');
      showResultAnimation(true);
    },
    onError: () => {
      showToast(i18n.t('toast.copyFailed'), 'error');
      showResultAnimation(false);
    },
  });
}

/**
 * @param {string} uid - B站用户 UID
 * @returns {Promise<Record<string, any>>}
 */
export async function precheckRate(uid) {
  const cachedData = cacheManager.getFromCache('bangumi', uid);
  if (cachedData) {
    console.log('使用缓存数据');
    return { ...cachedData, fromCache: true };
  }

  try {
    const resp = await fetch(`/api/bangumi/${uid}`);
    const limit = resp.headers.get('X-RateLimit-Limit');
    const remaining = resp.headers.get('X-RateLimit-Remaining');
    const reset = resp.headers.get('X-RateLimit-Reset');

    /** @type {ApiBody} */
    let body = {};
    try {
      body = await resp.json();
    } catch {
      // 如果不是 JSON 响应，继续处理状态码。
    }

    if (!resp.ok) {
      if (resp.status === 400) {
        errorHandler.showErrorModal('INVALID_UID');
        throw new Error(i18n.t('error.invalidUid.message'));
      }
      if (resp.status === 403 || body.code === 53013) {
        errorHandler.showErrorModal('PRIVACY_PROTECTED');
        throw new Error(i18n.t('error.privacy.message'));
      }
      if (resp.status === 404) {
        errorHandler.showErrorModal('USER_NOT_FOUND');
        throw new Error(i18n.t('error.userNotFound.message'));
      }
      if (resp.status === 429) {
        errorHandler.showErrorModal('RATE_LIMITED');
        throw new Error(i18n.t('error.rateLimit.message'));
      }
      errorHandler.showErrorModal('SERVER_ERROR', body.message);
      throw new Error(body.message || i18n.t('error.server.message'));
    }

    if (body && body.data && body.data.list && body.data.list.length === 0) {
      errorHandler.showErrorModal('NO_ANIME_FOUND');
      return { ok: false, error: i18n.t('error.noAnime.message') };
    }

    const result = { limit, remaining, reset, ok: true, data: body.data };
    cacheManager.saveToCache('bangumi', uid, result);
    return result;
  } catch (err) {
    const knownErrorMessages = [
      i18n.t('error.userNotFound.message'),
      i18n.t('error.privacy.message'),
      i18n.t('error.rateLimit.message'),
      i18n.t('error.invalidUid.message'),
      i18n.t('error.noAnime.message'),
    ];

    const message = err instanceof Error ? err.message : '';

    if (!knownErrorMessages.some((msg) => message && message.includes(msg))) {
      errorHandler.showErrorModal('NETWORK_ERROR');
    }

    return { ok: false, error: message || i18n.t('error.precheckFailed') };
  }
}

export async function handlePreview() {
  const input = getUidInput();
  if (!input) {
    console.error('未找到输入框');
    return;
  }

  const uid = normalizeUidFromInput(input);
  if (!validateUid(uid)) {
    showToast(i18n.t('toast.invalidUid'), 'warning');
    errorHandler.showErrorModal('INVALID_UID');
    return;
  }

  const loadingOverlay = showLoadingOverlay(i18n.t('loading.fetching'));

  try {
    let animeData = cacheManager.getFromCache('anime_list', uid);
    if (animeData) {
      console.log('使用缓存的番剧列表');
      showToast(i18n.t('toast.cacheLoaded'), 'info');
    }

    if (!animeData) {
      animeData = await animePreview.fetchAnimeData(uid);
      if (animeData && animeData.length > 0) {
        cacheManager.saveToCache('anime_list', uid, animeData);
      }
    }

    if (animeData && animeData.length > 0) {
      loadingOverlay.hide();
      animePreview.showPreview(animeData);
      window.currentGenerateCallback = () => {
        handleSubscribe();
      };
      bindPreviewActions(animeData);
      showToast(i18n.t('toast.animeCount', { count: animeData.length }), 'success');
    } else {
      loadingOverlay.hide();
      errorHandler.showErrorModal('NO_ANIME_FOUND');
    }
  } catch (error) {
    loadingOverlay.hide();
    console.error('预览失败:', error);
    showToast(i18n.t('toast.fetchFailed'), 'error');
  }
}

export async function handleSubscribe() {
  const input = getUidInput();
  const loading = /** @type {HTMLElement|null} */ (document.getElementById('loadingIndicator'));
  const resultBox = /** @type {HTMLElement|null} */ (document.getElementById('resultBox'));
  const subscribeUrl = document.getElementById('subscribeUrl');
  const subscribeLink = /** @type {HTMLAnchorElement|null} */ (
    document.getElementById('subscribeLink')
  );
  const sourcesInput = /** @type {HTMLTextAreaElement|null} */ (
    document.getElementById('sourcesInput')
  );
  const aggregateToggle = /** @type {HTMLInputElement|null} */ (
    document.getElementById('aggregateToggle')
  );

  if (!input || !loading || !resultBox || !subscribeUrl || !subscribeLink) {
    console.error('未找到订阅流程必要元素');
    return;
  }

  const uid = normalizeUidFromInput(input);
  if (!validateUid(uid)) {
    showToast(i18n.t('toast.invalidUid'), 'warning');
    errorHandler.showErrorModal('INVALID_UID');
    return;
  }

  cacheManager.saveUidHistory(uid);

  const progressBar = showProgressBar();
  const loadingOverlay = showLoadingOverlay(i18n.t('loading.generating'));
  loading.style.display = 'block';
  resultBox.style.display = 'none';

  try {
    const aggregateEnabled = aggregateToggle ? aggregateToggle.checked : false;
    const rawSources = sourcesInput ? sourcesInput.value.trim() : '';
    const aggregateState = evaluateAggregateInput(aggregateEnabled, rawSources);

    if (aggregateState.error) {
      progressBar.error();
      loadingOverlay.hide();
      loading.style.display = 'none';
      showResultAnimation(false);
      showToast(aggregateState.error, 'warning');
      return;
    }

    if (aggregateEnabled && sourcesInput) {
      if (rawSources) {
        localStorage.setItem(AGG_SOURCES_STORAGE_KEY, rawSources);
      } else {
        localStorage.removeItem(AGG_SOURCES_STORAGE_KEY);
      }
    }

    const sources = aggregateState.sources || [];
    let url;
    if (aggregateEnabled && sources.length > 0) {
      const query = sources.map((src) => `sources=${encodeURIComponent(src)}`).join('&');
      url = `${window.location.origin}/aggregate/${uid}.ics`;
      if (query) {
        url += `?${query}`;
      }
    } else {
      url = `${window.location.origin}/${uid}.ics`;
    }

    await new Promise((resolve) => setTimeout(resolve, 800));

    progressBar.complete();
    loadingOverlay.hide();

    if (isMobile()) {
      setTimeout(() => {
        loading.style.display = 'none';
        showToast(i18n.t('toast.redirecting'), 'info');
        window.location.href = url;
      }, 300);
      return;
    }

    setTimeout(() => {
      loading.style.display = 'none';
      subscribeUrl.textContent = url;
      subscribeLink.href = url;

      if (navigator.userAgent.includes('Mac')) {
        subscribeLink.onclick = function (event) {
          event.preventDefault();
          const webcalUrl = url.replace('http://', 'webcal://').replace('https://', 'webcal://');
          window.location.href = webcalUrl;
        };
      }

      resultBox.style.display = 'block';
      resultBox.scrollIntoView({ behavior: 'smooth' });
      showResultAnimation(true);
      showToast(i18n.t('toast.success'), 'success');
      window.currentGenerateCallback = null;
    }, 300);
  } catch (error) {
    progressBar.error();
    loadingOverlay.hide();
    loading.style.display = 'none';
    const message = error instanceof Error ? error.message : i18n.t('error.server.message');
    showToast(message, 'error');
    showResultAnimation(false);
  }
}

export function registerWebMCPTools() {
  if (!navigator.modelContext) return;

  try {
    navigator.modelContext.provideContext({
      tools: [
        {
          name: 'generate-subscription',
          description: '根据B站用户UID生成ICS日历订阅链接',
          inputSchema: {
            type: 'object',
            properties: {
              uid: { type: 'string', description: 'B站用户UID（纯数字，1-20位）' },
              sources: {
                type: 'array',
                items: { type: 'string' },
                description: '可选，外部ICS日历链接列表（最多5个）',
              },
            },
            required: ['uid'],
          },
          /**
           * @param {{uid: unknown, sources?: string[]}} params - WebMCP 参数
           * @returns {Promise<{subscriptionUrl?: string, uid?: string, error?: string}>}
           */
          async execute(params) {
            const { uid, sources } = /** @type {{uid: unknown, sources?: string[]}} */ (params);
            /** @param {unknown} value */
            const isValidUid = (value) => /^\d{1,20}$/.test(String(value).trim());
            if (!isValidUid(uid)) {
              return { error: 'UID必须是1-20位纯数字' };
            }
            const trimmed = String(uid).trim();
            let url = `${window.location.origin}/${trimmed}.ics`;
            if (sources && sources.length > 0) {
              const encoded = sources.slice(0, 5).map(encodeURIComponent).join('&sources=');
              url = `${window.location.origin}/aggregate/${trimmed}.ics?sources=${encoded}`;
            }
            return { subscriptionUrl: url, uid: trimmed };
          },
        },
        {
          name: 'preview-anime',
          description: '预览用户的B站追番列表，返回番剧名称和更新状态',
          inputSchema: {
            type: 'object',
            properties: {
              uid: { type: 'string', description: 'B站用户UID（纯数字，1-20位）' },
            },
            required: ['uid'],
          },
          /**
           * @param {{uid: unknown}} params - WebMCP 参数
           * @returns {Promise<Record<string, any>>}
           */
          async execute(params) {
            const { uid } = /** @type {{uid: unknown}} */ (params);
            /** @param {unknown} value */
            const isValidUid = (value) => /^\d{1,20}$/.test(String(value).trim());
            if (!isValidUid(uid)) {
              return { error: 'UID必须是1-20位纯数字' };
            }
            const trimmed = String(uid).trim();
            try {
              const resp = await fetch(`/api/bangumi/${trimmed}`);
              if (!resp.ok) return { error: `HTTP ${resp.status}` };
              const data = /** @type {ApiBody} */ (await resp.json());
              const list = data.data?.list || [];
              return {
                total: list.length,
                anime: list.map((item) => ({
                  title: item.title || item.bangumi?.title || '未知',
                  cover: item.bangumi?.cover || '',
                  seasonId: item.season_id || item.bangumi?.season_id,
                })),
              };
            } catch (err) {
              const message = err instanceof Error ? err.message : '获取数据失败';
              return { error: message };
            }
          },
        },
      ],
    });
  } catch {
    // WebMCP 注册失败时静默忽略。
  }
}
