import './styles/app.scss';
import i18n from './services/i18n';
import { errorHandler, userGuide } from './services/errorHandler';
import cacheManager from './services/cacheManager';
import animePreview from './components/AnimePreview';
import { initPWA } from './services/pwa';
import notifier from './services/notifier';
import pushService from './services/push';

// Initialize PWA
initPWA();

// Assign globals for legacy HTML compatibility and cross-module access
window.i18n = i18n;
window.errorHandler = errorHandler;
window.userGuide = userGuide;
window.cacheManager = cacheManager;
window.animePreview = animePreview;
window.notifier = notifier;
window.pushService = pushService;

// Helper Functions

function toHalfWidth(str) {
  return str.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
}

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

const MAX_EXTERNAL_SOURCES = 5;
const AGG_SOURCES_STORAGE_KEY = 'aggregateSources';
const AGG_TOGGLE_STORAGE_KEY = 'aggregateToggleEnabled';

function parseAggregateSources(rawValue = '') {
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

  const normalized = [];
  for (const token of tokens) {
    let parsed;
    try {
      parsed = new URL(token);
    } catch (err) {
      return { error: i18n.t('aggregate.errorInvalid', { url: token }) };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { error: i18n.t('aggregate.errorProtocol', { url: token }) };
    }

    normalized.push(parsed.toString());
  }

  return { sources: normalized };
}

function setAggregateFeedback(message = '', type = 'info') {
  const feedbackEl = document.getElementById('aggregateFeedback');
  if (!feedbackEl) return;
  feedbackEl.textContent = message || '';
  feedbackEl.classList.remove('success', 'error', 'muted');
  if (type === 'success' || type === 'error' || type === 'muted') {
    feedbackEl.classList.add(type);
  }
}

function updateAggregateContainerState(enabled) {
  const container = document.getElementById('aggregateOptions');
  if (container) {
    container.classList.toggle('active', !!enabled);
  }
}

function evaluateAggregateInput(enabled, rawValue = '') {
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

  if (parsed.sources.length > 0) {
    setAggregateFeedback(i18n.t('aggregate.feedbackCount', { count: parsed.sources.length }), 'success');
  } else {
    setAggregateFeedback(i18n.t('aggregate.feedbackEmpty'), 'muted');
  }

  return { enabled: true, sources: parsed.sources };
}

function getAggregateElements() {
  return {
    container: document.getElementById('aggregateOptions'),
    toggle: document.getElementById('aggregateToggle'),
    input: document.getElementById('sourcesInput'),
  };
}

function getAggregateConfig() {
  const { toggle, input } = getAggregateElements();
  return {
    enabled: !!(toggle && toggle.checked),
    rawSources: input ? input.value : '',
  };
}

function applyAggregateConfig({ enabled, rawSources } = {}) {
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

window.aggregateConfig = {
  get: getAggregateConfig,
  apply: applyAggregateConfig,
};

// 增强版Toast通知
export function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification-enhanced';

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-times-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle',
  };

  toast.innerHTML = `
    <div class="toast-content-enhanced ${type}">
      <i class="fas ${icons[type]} toast-icon"></i>
      <span class="toast-message">${message}</span>
      <i class="fas fa-times toast-close" onclick="this.closest('.toast-notification-enhanced').remove()"></i>
    </div>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) document.body.removeChild(toast);
    }, 300);
  }, duration);
}
window.showToast = showToast; // Expose for other modules

// 主题切换功能
export function toggleTheme() {
  const body = document.body;
  const themeIcon = document.getElementById('themeIcon');
  const currentTheme = body.getAttribute('data-theme');

  if (currentTheme === 'dark') {
    body.setAttribute('data-theme', 'light');
    themeIcon.classList.remove('fa-sun');
    themeIcon.classList.add('fa-moon');
    localStorage.setItem('theme', 'light');
  } else {
    body.setAttribute('data-theme', 'dark');
    themeIcon.classList.remove('fa-moon');
    themeIcon.classList.add('fa-sun');
    localStorage.setItem('theme', 'dark');
  }
}
window.toggleTheme = toggleTheme;

// 初始化主题
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  const body = document.body;
  const themeIcon = document.getElementById('themeIcon');

  body.setAttribute('data-theme', savedTheme);

  if (savedTheme === 'dark') {
    themeIcon.classList.remove('fa-moon');
    themeIcon.classList.add('fa-sun');
  } else {
    themeIcon.classList.remove('fa-sun');
    themeIcon.classList.add('fa-moon');
  }
}

// 快速切换语言
export function cycleLanguage() {
  const current = i18n.getLanguage();
  const next = current === 'zh-CN' ? 'en-US' : 'zh-CN';
  const changed = i18n.setLanguage(next);

  if (changed) {
    const langName = i18n.t(next === 'zh-CN' ? 'language.zh' : 'language.en');
    showToast(i18n.t('toast.languageSwitched', { lang: langName }), 'success', 2000);
  }
}
window.cycleLanguage = cycleLanguage;

// 显示进度条
function showProgressBar() {
  const progressBar = document.getElementById('progressBar');
  const progressFill = progressBar.querySelector('.progress-bar');

  progressBar.classList.add('active');
  progressFill.style.width = '0%';

  const interval = startProgressSimulation(progressFill);

  return {
    complete: () => completeProgressBar(progressFill, progressBar, interval),
    error: () => errorProgressBar(progressBar, interval),
  };
}

function startProgressSimulation(progressFill) {
  let progress = 0;
  return setInterval(() => {
    progress += Math.random() * 30;
    if (progress > 90) {
      progress = 90;
    }
    progressFill.style.width = `${progress}%`;
  }, 300);
}

function completeProgressBar(progressFill, progressBar, intervalId) {
  clearInterval(intervalId);
  progressFill.style.width = '100%';
  setTimeout(() => {
    progressBar.classList.remove('active');
  }, 500);
}

function errorProgressBar(progressBar, intervalId) {
  clearInterval(intervalId);
  progressBar.classList.remove('active');
}

// 显示加载遮罩
function showLoadingOverlay(text = i18n.t('loading.processing')) {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = overlay.querySelector('.loading-text');

  loadingText.textContent = text;
  overlay.classList.add('active');

  return {
    hide: () => {
      overlay.classList.remove('active');
    },
    updateText: (newText) => {
      loadingText.textContent = newText;
    },
  };
}

// 显示成功/失败动画
function showResultAnimation(success = true) {
  const animation = document.createElement('div');
  animation.className = 'result-animation';
  animation.innerHTML = success
    ? '<div class="success-checkmark"></div>'
    : '<div class="error-cross"></div>';

  document.body.appendChild(animation);

  setTimeout(() => {
    animation.remove();
  }, 1500);
}

export function copyToClipboard() {
  const url = document.getElementById('subscribeUrl').textContent;
  if (!url) return;
  // 先尝试异步剪贴板
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        showToast(i18n.t('toast.copied'), 'success');
        showResultAnimation(true);
      })
      .catch(() => {
        fallbackCopy(url);
      });
  } else {
    fallbackCopy(url);
  }
}
window.copyToClipboard = copyToClipboard;

function fallbackCopy(text) {
  try {
    const tmp = document.createElement('input');
    tmp.value = text;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    showToast(i18n.t('toast.copied'), 'success');
    showResultAnimation(true);
    document.body.removeChild(tmp);
  } catch {
    showToast(i18n.t('toast.copyFailed'), 'error');
    showResultAnimation(false);
  }
}

export async function precheckRate(uid) {
  // 先检查缓存
  const cachedData = cacheManager.getFromCache('bangumi', uid);
  if (cachedData) {
    console.log('使用缓存数据');
    return { ...cachedData, fromCache: true };
  }

  // 可选：向后端预检，读取频控响应头
  try {
    const resp = await fetch(`/api/bangumi/${uid}`);
    const limit = resp.headers.get('X-RateLimit-Limit');
    const remaining = resp.headers.get('X-RateLimit-Remaining');
    const reset = resp.headers.get('X-RateLimit-Reset');

    // 先读取响应body
    let body = {};
    try {
      body = await resp.json();
    } catch {
      // 如果不是JSON响应，继续处理
    }

    if (!resp.ok) {
      // 透传一些常见错误
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

    // 检查是否有番剧数据
    if (body && body.data && body.data.list && body.data.list.length === 0) {
      errorHandler.showErrorModal('NO_ANIME_FOUND');
      return { ok: false, error: i18n.t('error.noAnime.message') };
    }

    const result = { limit, remaining, reset, ok: true, data: body.data };

    // 保存到缓存
    cacheManager.saveToCache('bangumi', uid, result);

    return result;
  } catch (e) {
    const knownErrorMessages = [
      i18n.t('error.userNotFound.message'),
      i18n.t('error.privacy.message'),
      i18n.t('error.rateLimit.message'),
      i18n.t('error.invalidUid.message'),
      i18n.t('error.noAnime.message'),
    ];

    const message = e && e.message ? e.message : '';

    if (!knownErrorMessages.some((msg) => message && message.includes(msg))) {
      errorHandler.showErrorModal('NETWORK_ERROR');
    }

    return { ok: false, error: message || i18n.t('error.precheckFailed') };
  }
}
window.precheckRate = precheckRate;

export async function handlePreview() {
  const input = document.getElementById('uidInput') || document.getElementById('uid');
  if (!input) {
    console.error('未找到输入框');
    return;
  }

  let uid = input.value.trim();
  uid = toHalfWidth(uid);

  if (!uid || !/^[0-9]+$/.test(uid)) {
    showToast(i18n.t('toast.invalidUid'), 'warning');
    errorHandler.showErrorModal('INVALID_UID');
    return;
  }

  const loadingOverlay = showLoadingOverlay(i18n.t('loading.fetching'));

  try {
    let animeData = null;

    // 先检查缓存
    animeData = cacheManager.getFromCache('anime_list', uid);
    if (animeData) {
      console.log('使用缓存的番剧列表');
      showToast(i18n.t('toast.cacheLoaded'), 'info');
    }

    if (!animeData) {
      // 获取番剧数据
      animeData = await animePreview.fetchAnimeData(uid);

      // 保存到缓存
      if (animeData && animeData.length > 0) {
        cacheManager.saveToCache('anime_list', uid, animeData);
      }
    }

    if (animeData && animeData.length > 0) {
      loadingOverlay.hide();

      // 显示预览
      animePreview.showPreview(animeData);

      // 设置生成订阅的回调
      window.currentGenerateCallback = () => {
        handleSubscribe();
      };

      // 绑定提醒按钮
      const reminderBtn = document.getElementById('enableReminder');
      if (reminderBtn) {
        reminderBtn.onclick = async () => {
          const leadSelect = document.getElementById('reminderLead');
          const lead = leadSelect ? Number(leadSelect.value) || 5 : 5;
          const result = await notifier.scheduleAnimeReminders(animeData, { leadMinutes: lead });
          if (result.denied) {
            showToast(i18n.t('toast.reminderDenied'), 'warning');
          } else {
            showToast(i18n.t('toast.reminderOn', { count: result.scheduled, minutes: lead }), 'success');
          }
        };
      }

      const leadSelect = document.getElementById('reminderLead');
      if (leadSelect) {
        const saved = localStorage.getItem('reminderLeadMinutes');
        if (saved) leadSelect.value = saved;
        leadSelect.addEventListener('change', (e) => {
          localStorage.setItem('reminderLeadMinutes', e.target.value);
          showToast(i18n.t('toast.reminderLeadSaved', { minutes: e.target.value }), 'info');
        });
      }

      const pushBtn = document.getElementById('enablePush');
      if (pushBtn) {
        pushBtn.onclick = async () => {
          try {
            await notifier.ensurePermission();
            await pushService.registerPush();
            showToast(i18n.t('toast.pushEnabled'), 'success');
          } catch (err) {
            console.error(err);
            showToast(i18n.t('toast.pushFailed'), 'error');
          }
        };
      }

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
window.handlePreview = handlePreview;

export async function handleSubscribe() {
  const input = document.getElementById('uidInput') || document.getElementById('uid');
  const loading = document.getElementById('loadingIndicator');
  const resultBox = document.getElementById('resultBox');
  const subscribeUrl = document.getElementById('subscribeUrl');
  const subscribeLink = document.getElementById('subscribeLink');
  const sourcesInput = document.getElementById('sourcesInput');
  const aggregateToggle = document.getElementById('aggregateToggle');

  if (!input) {
    console.error('未找到输入框');
    return;
  }

  let uid = input.value.trim();
  uid = toHalfWidth(uid);

  if (!uid || !/^[0-9]+$/.test(uid)) {
    showToast(i18n.t('toast.invalidUid'), 'warning');
    errorHandler.showErrorModal('INVALID_UID');
    return;
  }

  // 保存到历史记录
  cacheManager.saveUidHistory(uid);

  // 显示加载动画
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

    // 模拟短暂处理时间
    await new Promise((resolve) => setTimeout(resolve, 800));

    progressBar.complete();
    loadingOverlay.hide();

    if (isMobile()) {
      setTimeout(() => {
        loading.style.display = 'none';
        showToast(i18n.t('toast.redirecting'), 'info');
        // 移动端可尝试直接跳转
        window.location.href = url;
      }, 300);
    } else {
      setTimeout(() => {
        loading.style.display = 'none';
        subscribeUrl.textContent = url;
        subscribeLink.href = url;

        // macOS Safari等支持 webcal 协议
        if (navigator.userAgent.includes('Mac')) {
          subscribeLink.onclick = function (e) {
            e.preventDefault();
            const webcalUrl = url.replace('http://', 'webcal://').replace('https://', 'webcal://');
            window.location.href = webcalUrl;
          };
        }

        resultBox.style.display = 'block';
        resultBox.scrollIntoView({ behavior: 'smooth' });

        showResultAnimation(true);
        showToast(i18n.t('toast.success'), 'success');

        // 清除预览回调
        window.currentGenerateCallback = null;
      }, 300);
    }
  } catch (error) {
    progressBar.error();
    loadingOverlay.hide();
    loading.style.display = 'none';
    showToast(error && error.message ? error.message : i18n.t('error.server.message'), 'error');
    showResultAnimation(false);
  }
}
window.handleSubscribe = handleSubscribe;

// 页面加载动画和事件绑定
document.addEventListener('DOMContentLoaded', function () {
  // 初始化主题
  initTheme();

  // Initialize Modules
  // i18n.updatePageContent(); // Handled in constructor? No, let's ensure it runs.
  i18n.updatePageContent();

  // 加载错误历史记录
  if (errorHandler && typeof errorHandler.loadFromLocalStorage === 'function') {
    errorHandler.loadFromLocalStorage();
  }

  // 检查是否需要显示新手引导（首次访问）
  if (userGuide && typeof userGuide.shouldShowTour === 'function') {
    if (userGuide.shouldShowTour()) {
      // 延迟 5 秒后自动启动新手引导
      setTimeout(() => {
        if (typeof userGuide.startTour === 'function') {
          userGuide.startTour();
        }
      }, 5000);
    }
  }

  // 绑定主题切换按钮
  const themeSwitcher = document.getElementById('themeSwitcher');
  if (themeSwitcher) {
    themeSwitcher.addEventListener('click', toggleTheme);
  }

  // 绑定语言切换按钮
  const languageBtn = document.getElementById('languageBtn');
  if (languageBtn) {
    languageBtn.addEventListener('click', cycleLanguage);
  }

  const sourcesInput = document.getElementById('sourcesInput');
  const aggregateToggle = document.getElementById('aggregateToggle');
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

  // 绑定生成订阅按钮
  const generateBtn = document.getElementById('generateBtn');
  if (generateBtn) {
    generateBtn.addEventListener('click', handleSubscribe);
  }

  // 绑定预览按钮
  const previewBtn = document.getElementById('previewBtn');
  if (previewBtn) {
    previewBtn.addEventListener('click', handlePreview);
  }

  // 绑定复制按钮
  const copyBtn = document.getElementById('copyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', copyToClipboard);
  }

  // 绑定帮助按钮
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      if (userGuide && typeof userGuide.startTour === 'function') {
        userGuide.startTour();
      }
    });
  }

  // 绑定历史记录按钮
  const historyBtn = document.getElementById('historyBtn');
  if (historyBtn) {
    historyBtn.addEventListener('click', () => {
      if (cacheManager && typeof cacheManager.showHistoryPanel === 'function') {
        cacheManager.showHistoryPanel();
      }
    });
  }

  // 初始化缓存管理器的自动建议
  if (cacheManager) {
    cacheManager.initAutoSuggest();
  }

  const container = document.querySelector('.main-container');
  if (container) {
    container.style.opacity = '0';
    container.style.transform = 'translateY(30px)';
    container.style.transition = 'all 0.6s ease';

    setTimeout(() => {
      container.style.opacity = '1';
      container.style.transform = 'translateY(0)';
    }, 100);
  }

  // 绑定回车提交
  const input = document.getElementById('uidInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSubscribe();
    });
  }

  // 强制隐藏结果区域，防止初始显示
  const resultBox = document.getElementById('resultBox');
  if (resultBox) {
    resultBox.style.display = 'none';
  }

  // 添加键盘快捷键支持
  document.addEventListener('keydown', function (e) {
    // Alt + T 切换主题
    if (e.altKey && e.key === 't') {
      e.preventDefault();
      toggleTheme();
    }
    // Alt + G 生成订阅链接
    if (e.altKey && e.key === 'g') {
      e.preventDefault();
      handleSubscribe();
    }
    // Alt + P 预览番剧
    if (e.altKey && e.key === 'p') {
      e.preventDefault();
      handlePreview();
    }
  });

  // 注入当前年份到版权占位符
  try {
    const yearEl = document.getElementById('copyrightYear');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  } catch {}
});
