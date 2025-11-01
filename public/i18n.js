// i18n.js - Internationalization Module

class I18n {
  constructor() {
    this.translations = {
      'zh-CN': {
        // Page Meta
        'page.title': 'B站追番日历订阅',
        
        // Header
        'app.title': 'B站追番日历',
        'app.subtitle': '输入您的B站用户ID(UID)，获取追番日历订阅链接',
        'app.github': 'GitHub',
        'app.githubAria': '在新窗口打开 GitHub 仓库',
        'theme.switch': '切换主题',
        
        // Language
        'language.switcher': '选择语言',
        'language.zh': '中文',
        'language.en': 'English',
        'language.button': '语言',
        
        // Input Section
        'input.placeholder': '例如: 614500',
        'input.generate': '生成订阅',
        'input.preview': '预览番剧',
        'input.help': 'UID可在B站个人空间网址中找到，例如：https://space.bilibili.com/<strong>614500</strong>',
        
        // Loading
        'loading.text': '正在获取数据，请稍候...',
        'loading.processing': '正在处理请求...',
        'loading.generating': '正在生成订阅链接...',
        'loading.fetching': '正在获取番剧列表...',
        
        // Result
        'result.success': '订阅链接生成成功',
        'result.description': '请复制以下链接并添加到您的日历应用中：',
        'result.copy': '复制链接',
        'result.addToCalendar': '添加到日历',
        'result.instructions': '使用说明',
        'result.apple': '<strong>Apple 日历</strong>：打开设置 &gt; 密码与账户 &gt; 添加账户 &gt; 其他 &gt; 添加已订阅日历',
        'result.google': '<strong>Google 日历</strong>：在左侧"我的日历"下点击"添加其他日历" &gt; "从URL添加"',
        'result.outlook': '<strong>Outlook</strong>：在日历视图中点击"添加日历" &gt; "从Internet"',
        
        // Features
        'features.title': '功能特色',
        'features.smart': '智能识别连载状态：连载中番剧自动设置每周重复，完结番剧仅保留首播时间',
        'features.compatible': '生成的日历可添加到 Apple 日历、Google 日历、Outlook 等',
        'features.auto': '每集更新时间会自动添加到您的日历中',
        'features.permanent': '日历链接长期有效，无需重复订阅',
        'features.privacy': '重要提醒：您的追番数据必须设置为公开，否则无法获取',
        
        // Footer
        'footer.copyright': '保留所有权利。',
        'footer.help': '显示使用指南',
        'footer.history': '查看历史记录',
        
        // Toasts
        'toast.copied': '链接已复制到剪贴板',
        'toast.copyFailed': '复制失败，请手动选择并复制链接',
        'toast.invalidUid': '请输入有效的 UID (纯数字)',
        'toast.redirecting': '正在跳转到订阅链接...',
        'toast.success': '订阅链接生成成功！',
        'toast.cacheLoaded': '从缓存加载番剧列表',
        'toast.animeCount': '成功获取 {count} 部番剧',
        'toast.fetchFailed': '获取番剧列表失败，请稍后重试',
        'toast.languageSwitched': '语言已切换为 {lang}',
        
        // Errors
        'error.invalidUid.title': 'UID格式错误',
        'error.invalidUid.message': '请输入有效的B站用户ID',
        'error.invalidUid.solution': 'UID应该是纯数字，例如：672328094',
        'error.userNotFound.title': '用户不存在',
        'error.userNotFound.message': '未找到该用户的B站账号',
        'error.userNotFound.solution': '请检查UID是否正确，可以在B站个人空间网址中找到',
        'error.privacy.title': '隐私保护',
        'error.privacy.message': '该用户的追番列表设置为隐私',
        'error.privacy.solution': '需要用户在B站设置中将追番列表设为公开',
        'error.privacy.helpLink': '查看帮助文档',
        'error.rateLimit.title': '请求频率限制',
        'error.rateLimit.message': '请求过于频繁，请稍后再试',
        'error.rateLimit.solution': '请等待几分钟后再尝试',
        'error.network.title': '网络连接错误',
        'error.network.message': '无法连接到服务器',
        'error.network.solution': '请检查您的网络连接或稍后再试',
        'error.server.title': '服务器错误',
        'error.server.message': '服务器处理请求时发生错误',
        'error.server.solution': '这可能是临时问题，请稍后再试',
        'error.noAnime.title': '未找到追番记录',
        'error.noAnime.message': '该用户没有追番记录',
        'error.noAnime.solution': '请确认用户已在B站追番，或尝试其他UID',
        'error.precheckFailed': '预检失败，请稍后重试',
        'error.previewModuleNotLoaded': '预览模块未加载',
        'error.close': '关闭',
        
        // Error Patterns
        'error.pattern.rateLimit': '您的请求过于频繁，建议降低请求频率或联系管理员增加限额',
        'error.pattern.privacy': '多个用户的追番列表都是隐私的，这是B站的默认设置',
        'error.pattern.network': '持续的网络错误，请检查防火墙设置或代理配置',
        'error.pattern.invalidUid': '请确保输入的是数字UID，不是用户名或其他标识',
        
        // User Guide
        'guide.step': '步骤',
        'guide.inputUid.title': '输入UID',
        'guide.inputUid.content': '在这里输入您的B站用户ID（UID）',
        'guide.findUid.title': '查找UID',
        'guide.findUid.content': 'UID可以在您的B站个人空间网址中找到',
        'guide.generate.title': '生成订阅',
        'guide.generate.content': '点击这个按钮生成您的追番日历订阅链接',
        'guide.theme.title': '主题切换',
        'guide.theme.content': '点击这里可以切换亮色/暗色主题',
        'guide.prev': '上一步',
        'guide.next': '下一步',
        'guide.finish': '完成',
        
        // Anime Preview
        'preview.title': '番剧预览',
        'preview.close': '关闭',
        'preview.generate': '生成订阅',
        'preview.search': '搜索番剧...',
        'preview.filter.all': '全部',
        'preview.filter.airing': '连载中',
        'preview.filter.finished': '已完结',
        'preview.sort.name': '按名称排序',
        'preview.sort.time': '按更新时间排序',
        'preview.sort.status': '按状态排序',
        'preview.count': '共 {count} 部番剧',
        'preview.empty': '没有找到番剧',
        'preview.status.airing': '连载中',
        'preview.status.finished': '已完结',
        'preview.updateTime': '更新时间',
        'preview.unknown': '时间未知',
        'preview.noSchedule': '无更新计划',
        
        // Cache & History
        'history.title': '历史记录',
        'history.close': '关闭',
        'history.clear': '清除所有',
        'history.empty': '暂无历史记录',
        'history.use': '使用',
        'history.delete': '删除',
        'history.confirmClear': '确定要清除所有历史记录吗？',
        'cache.cleared': '缓存已清除',
        'cache.loading': '使用缓存数据',
        
        // Service Worker
        'sw.registered': 'Service Worker 注册失败:',
      },
      'en-US': {
        // Page Meta
        'page.title': 'Bilibili Anime Calendar Subscription',
        
        // Header
        'app.title': 'Bili Calendar',
        'app.subtitle': 'Enter your Bilibili UID to get anime calendar subscription',
        'app.github': 'GitHub',
        'app.githubAria': 'Open GitHub repository in new window',
        'theme.switch': 'Switch Theme',
        
        // Language
        'language.switcher': 'Select Language',
        'language.zh': '中文',
        'language.en': 'English',
        'language.button': 'Language',
        
        // Input Section
        'input.placeholder': 'e.g., 614500',
        'input.generate': 'Generate',
        'input.preview': 'Preview',
        'input.help': 'Find your UID in your Bilibili profile URL, e.g., https://space.bilibili.com/<strong>614500</strong>',
        
        // Loading
        'loading.text': 'Loading data, please wait...',
        'loading.processing': 'Processing request...',
        'loading.generating': 'Generating subscription link...',
        'loading.fetching': 'Fetching anime list...',
        
        // Result
        'result.success': 'Subscription Link Generated',
        'result.description': 'Copy the following link and add it to your calendar app:',
        'result.copy': 'Copy Link',
        'result.addToCalendar': 'Add to Calendar',
        'result.instructions': 'Instructions',
        'result.apple': '<strong>Apple Calendar</strong>: Settings &gt; Passwords & Accounts &gt; Add Account &gt; Other &gt; Add Subscribed Calendar',
        'result.google': '<strong>Google Calendar</strong>: Click "Add other calendars" on the left &gt; "From URL"',
        'result.outlook': '<strong>Outlook</strong>: Click "Add calendar" in calendar view &gt; "From Internet"',
        
        // Features
        'features.title': 'Features',
        'features.smart': 'Smart Status Recognition: Airing shows repeat weekly, finished shows show premiere only',
        'features.compatible': 'Compatible with Apple Calendar, Google Calendar, Outlook, and more',
        'features.auto': 'Episode updates automatically added to your calendar',
        'features.permanent': 'Subscription link is permanent, no need to resubscribe',
        'features.privacy': 'Important: Your anime list must be set to public to be accessed',
        
        // Footer
        'footer.copyright': 'All rights reserved.',
        'footer.help': 'Show Guide',
        'footer.history': 'View History',
        
        // Toasts
        'toast.copied': 'Link copied to clipboard',
        'toast.copyFailed': 'Copy failed, please select and copy manually',
        'toast.invalidUid': 'Please enter a valid UID (numbers only)',
        'toast.redirecting': 'Redirecting to subscription link...',
        'toast.success': 'Subscription link generated successfully!',
        'toast.cacheLoaded': 'Loaded anime list from cache',
        'toast.animeCount': 'Successfully fetched {count} anime',
        'toast.fetchFailed': 'Failed to fetch anime list, please try again later',
        'toast.languageSwitched': 'Language switched to {lang}',
        
        // Errors
        'error.invalidUid.title': 'Invalid UID Format',
        'error.invalidUid.message': 'Please enter a valid Bilibili user ID',
        'error.invalidUid.solution': 'UID should be numbers only, e.g., 672328094',
        'error.userNotFound.title': 'User Not Found',
        'error.userNotFound.message': 'Could not find this Bilibili account',
        'error.userNotFound.solution': 'Please check if the UID is correct. You can find it in your Bilibili profile URL',
        'error.privacy.title': 'Privacy Protected',
        'error.privacy.message': 'This user\'s anime list is set to private',
        'error.privacy.solution': 'User needs to set their anime list to public in Bilibili settings',
        'error.privacy.helpLink': 'View Help',
        'error.rateLimit.title': 'Rate Limit Exceeded',
        'error.rateLimit.message': 'Too many requests, please try again later',
        'error.rateLimit.solution': 'Please wait a few minutes before trying again',
        'error.network.title': 'Network Error',
        'error.network.message': 'Cannot connect to server',
        'error.network.solution': 'Please check your network connection or try again later',
        'error.server.title': 'Server Error',
        'error.server.message': 'Server encountered an error while processing your request',
        'error.server.solution': 'This might be a temporary issue, please try again later',
        'error.noAnime.title': 'No Anime Found',
        'error.noAnime.message': 'This user has no anime records',
        'error.noAnime.solution': 'Please confirm the user has anime on Bilibili, or try another UID',
        'error.precheckFailed': 'Precheck failed, please try again later',
        'error.previewModuleNotLoaded': 'Preview module not loaded',
        'error.close': 'Close',
        
        // Error Patterns
        'error.pattern.rateLimit': 'Your requests are too frequent. Consider reducing frequency or contacting admin for higher limits',
        'error.pattern.privacy': 'Multiple users have private anime lists. This is Bilibili\'s default setting',
        'error.pattern.network': 'Persistent network errors. Please check firewall or proxy settings',
        'error.pattern.invalidUid': 'Make sure you\'re entering numeric UID, not username or other identifiers',
        
        // User Guide
        'guide.step': 'Step',
        'guide.inputUid.title': 'Enter UID',
        'guide.inputUid.content': 'Enter your Bilibili user ID (UID) here',
        'guide.findUid.title': 'Find UID',
        'guide.findUid.content': 'You can find your UID in your Bilibili profile URL',
        'guide.generate.title': 'Generate Subscription',
        'guide.generate.content': 'Click this button to generate your anime calendar subscription link',
        'guide.theme.title': 'Theme Switcher',
        'guide.theme.content': 'Click here to switch between light and dark themes',
        'guide.prev': 'Previous',
        'guide.next': 'Next',
        'guide.finish': 'Finish',
        
        // Anime Preview
        'preview.title': 'Anime Preview',
        'preview.close': 'Close',
        'preview.generate': 'Generate Subscription',
        'preview.search': 'Search anime...',
        'preview.filter.all': 'All',
        'preview.filter.airing': 'Airing',
        'preview.filter.finished': 'Finished',
        'preview.sort.name': 'Sort by Name',
        'preview.sort.time': 'Sort by Time',
        'preview.sort.status': 'Sort by Status',
        'preview.count': 'Total {count} anime',
        'preview.empty': 'No anime found',
        'preview.status.airing': 'Airing',
        'preview.status.finished': 'Finished',
        'preview.updateTime': 'Update Time',
        'preview.unknown': 'Time Unknown',
        'preview.noSchedule': 'No Schedule',
        
        // Cache & History
        'history.title': 'History',
        'history.close': 'Close',
        'history.clear': 'Clear All',
        'history.empty': 'No history records',
        'history.use': 'Use',
        'history.delete': 'Delete',
        'history.confirmClear': 'Are you sure you want to clear all history?',
        'cache.cleared': 'Cache cleared',
        'cache.loading': 'Using cached data',
        
        // Service Worker
        'sw.registered': 'Service Worker registration failed:',
      }
    };
    this.currentLang = this.detectLanguage();
  }

  // Detect browser language
  detectLanguage() {
    const saved = localStorage.getItem('language');
    if (saved && this.translations[saved]) {
      return saved;
    }
    
    const browserLang = navigator.language || navigator.userLanguage;
    
    // Check if we have exact match
    if (this.translations[browserLang]) {
      return browserLang;
    }
    
    // Check for language prefix match (e.g., 'en' from 'en-US')
    const langPrefix = browserLang.split('-')[0];
    for (const key in this.translations) {
      if (key.startsWith(langPrefix)) {
        return key;
      }
    }
    
    // Default to Chinese
    return 'zh-CN';
  }

  // Get translation
  t(key, params = {}) {
    const lang = this.translations[this.currentLang];
    let text = lang[key] || key;
    
    // Replace parameters
    for (const [param, value] of Object.entries(params)) {
      text = text.replace(`{${param}}`, value);
    }
    
    return text;
  }

  // Set language
  setLanguage(lang) {
    if (this.translations[lang]) {
      this.currentLang = lang;
      localStorage.setItem('language', lang);
      this.updatePageContent();
      
      // Trigger custom event for other modules
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
      
      return true;
    }
    return false;
  }

  // Get current language
  getLanguage() {
    return this.currentLang;
  }

  // Get available languages
  getAvailableLanguages() {
    return Object.keys(this.translations);
  }

  // Update page content
  updatePageContent() {
    // Update HTML lang attribute
    document.documentElement.lang = this.currentLang;
    
    // Update document title
    const titleElement = document.querySelector('title[data-i18n]');
    if (titleElement) {
      const key = titleElement.getAttribute('data-i18n');
      document.title = this.t(key);
    }
    
    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      if (element.tagName !== 'TITLE') {
        element.textContent = this.t(key);
      }
    });
    
    // Update all elements with data-i18n-html attribute (for HTML content)
    document.querySelectorAll('[data-i18n-html]').forEach(element => {
      const key = element.getAttribute('data-i18n-html');
      element.innerHTML = this.t(key);
    });
    
    // Update all elements with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      element.placeholder = this.t(key);
    });
    
    // Update all elements with data-i18n-title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
      const key = element.getAttribute('data-i18n-title');
      element.title = this.t(key);
    });
    
    // Update all elements with data-i18n-aria-label attribute
    document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
      const key = element.getAttribute('data-i18n-aria-label');
      element.setAttribute('aria-label', this.t(key));
    });
    
    updateLanguageToggleLabel();
  }
}

// Create global instance
const i18n = new I18n();

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    i18n.updatePageContent();
    setupLanguageSwitcher();
  });
} else {
  i18n.updatePageContent();
  setTimeout(() => setupLanguageSwitcher(), 0);
}

// Setup language switcher
function setupLanguageSwitcher() {
  updateLanguageToggleLabel();
}

function updateLanguageToggleLabel() {
  const label = document.getElementById('languageToggleLabel');
  if (!label) return;

  const current = i18n.getLanguage();
  const target = current === 'zh-CN' ? 'en-US' : 'zh-CN';
  const textKey = target === 'zh-CN' ? 'language.zh' : 'language.en';
  label.textContent = i18n.t(textKey);
}

window.addEventListener('languageChanged', updateLanguageToggleLabel);

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = i18n;
}
