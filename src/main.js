import './styles/app.scss';
import i18n from './services/i18n';
import { errorHandler, userGuide } from './services/errorHandler';
import cacheManager from './services/cacheManager';
import animePreview from './components/AnimePreview';
import { initPWA } from './services/pwa';
import notifier from './services/notifier';
import pushService from './services/push';
import { showToast } from './services/toastService';
import { toggleTheme, initTheme } from './services/themeService';
import { aggregateConfig, initAggregateConfig } from './services/aggregateConfig';
import {
  copyToClipboard,
  handlePreview,
  handleSubscribe,
  precheckRate,
  registerWebMCPTools,
} from './services/subscriptionService';

initPWA();

// 为旧版 HTML 和跨模块调用保留全局入口。
window.i18n = i18n;
window.errorHandler = errorHandler;
window.userGuide = userGuide;
window.cacheManager = cacheManager;
window.animePreview = animePreview;
window.notifier = notifier;
window.pushService = pushService;
window.showToast = showToast;
window.toggleTheme = toggleTheme;
window.aggregateConfig = aggregateConfig;
window.copyToClipboard = copyToClipboard;
window.precheckRate = precheckRate;
window.handlePreview = handlePreview;
window.handleSubscribe = handleSubscribe;

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

function initUserGuide() {
  if (errorHandler && typeof errorHandler.loadFromLocalStorage === 'function') {
    errorHandler.loadFromLocalStorage();
  }

  if (userGuide && typeof userGuide.shouldShowTour === 'function' && userGuide.shouldShowTour()) {
    setTimeout(() => {
      if (typeof userGuide.startTour === 'function') {
        userGuide.startTour();
      }
    }, 5000);
  }
}

function bindMainActions() {
  /** @type {[string, () => void | Promise<void>][]} */
  const bindings = [
    ['themeSwitcher', toggleTheme],
    ['languageBtn', cycleLanguage],
    ['generateBtn', handleSubscribe],
    ['previewBtn', handlePreview],
    ['copyBtn', copyToClipboard],
  ];

  bindings.forEach(([id, handler]) => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('click', handler);
    }
  });

  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      if (userGuide && typeof userGuide.startTour === 'function') {
        userGuide.startTour();
      }
    });
  }

  const historyBtn = document.getElementById('historyBtn');
  if (historyBtn) {
    historyBtn.addEventListener('click', () => {
      if (cacheManager && typeof cacheManager.showHistoryPanel === 'function') {
        cacheManager.showHistoryPanel();
      }
    });
  }
}

function initPageAnimation() {
  const container = /** @type {HTMLElement|null} */ (document.querySelector('.main-container'));
  if (!container) return;

  container.style.opacity = '0';
  container.style.transform = 'translateY(30px)';
  container.style.transition = 'all 0.6s ease';

  setTimeout(() => {
    container.style.opacity = '1';
    container.style.transform = 'translateY(0)';
  }, 100);
}

function bindKeyboardShortcuts() {
  const input = document.getElementById('uidInput');
  if (input) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') handleSubscribe();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.key === 't') {
      event.preventDefault();
      toggleTheme();
    }
    if (event.altKey && event.key === 'g') {
      event.preventDefault();
      handleSubscribe();
    }
    if (event.altKey && event.key === 'p') {
      event.preventDefault();
      handlePreview();
    }
  });
}

function initCopyrightYear() {
  try {
    const yearEl = document.getElementById('copyrightYear');
    if (yearEl) {
      yearEl.textContent = String(new Date().getFullYear());
    }
  } catch {
    // 年份占位符缺失不影响主流程。
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  i18n.updatePageContent();
  initUserGuide();
  initAggregateConfig();
  bindMainActions();

  if (cacheManager) {
    cacheManager.initAutoSuggest();
  }

  initPageAnimation();
  bindKeyboardShortcuts();

  const resultBox = document.getElementById('resultBox');
  if (resultBox) {
    resultBox.style.display = 'none';
  }

  initCopyrightYear();
  registerWebMCPTools();
});
