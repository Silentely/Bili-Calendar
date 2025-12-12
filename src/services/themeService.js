// @ts-check
/**
 * 主题管理服务
 * 提供明暗主题切换、主题保存与初始化功能
 */

/**
 * 主题类型定义
 * @typedef {'light' | 'dark'} Theme
 */

/**
 * 主题配置
 * @private
 */
const THEME_CONFIG = {
  storageKey: 'theme',
  /** @type {Theme} */
  defaultTheme: 'light',
  themes: {
    light: {
      icon: 'fa-moon',
      nextTheme: 'dark',
    },
    dark: {
      icon: 'fa-sun',
      nextTheme: 'light',
    },
  },
};

/**
 * 获取当前主题
 *
 * @returns {Theme} 当前主题 ('light' | 'dark')
 *
 * @example
 * const theme = getCurrentTheme()
 * // => 'light' or 'dark'
 */
export function getCurrentTheme() {
  const attr = document.body.getAttribute('data-theme');
  return /** @type {Theme} */ (attr || THEME_CONFIG.defaultTheme);
}

/**
 * 设置主题
 *
 * @param {Theme} theme - 主题类型 ('light' | 'dark')
 *
 * @example
 * setTheme('dark')
 * setTheme('light')
 */
export function setTheme(theme) {
  const body = document.body;
  const themeIcon = document.getElementById('themeIcon');

  if (!themeIcon) {
    console.warn('[ThemeService] 未找到主题图标元素 #themeIcon');
    return;
  }

  const config = THEME_CONFIG.themes[theme];
  if (!config) {
    console.warn(`[ThemeService] 不支持的主题: ${theme}`);
    return;
  }

  // 设置主题属性
  body.setAttribute('data-theme', theme);

  // 更新图标
  updateThemeIcon(themeIcon, theme);

  // 保存到 localStorage
  localStorage.setItem(THEME_CONFIG.storageKey, theme);
}

/**
 * 切换主题 (在明暗主题之间切换)
 *
 * @returns {Theme} 切换后的主题
 *
 * @example
 * toggleTheme()
 * // 'light' => 'dark'
 * // 'dark' => 'light'
 */
export function toggleTheme() {
  const currentTheme = getCurrentTheme();
  const nextTheme = /** @type {Theme} */ (THEME_CONFIG.themes[currentTheme].nextTheme);

  setTheme(nextTheme);

  return nextTheme;
}

/**
 * 初始化主题 (从 localStorage 恢复保存的主题)
 *
 * 应在页面加载时调用此函数
 *
 * @example
 * // 在 DOMContentLoaded 时初始化
 * document.addEventListener('DOMContentLoaded', () => {
 *   initTheme()
 * })
 */
export function initTheme() {
  const savedTheme = getSavedTheme();
  const themeIcon = document.getElementById('themeIcon');

  if (!themeIcon) {
    console.warn('[ThemeService] 未找到主题图标元素 #themeIcon');
    return;
  }

  // 设置主题
  document.body.setAttribute('data-theme', savedTheme);

  // 更新图标
  updateThemeIcon(themeIcon, savedTheme);
}

/**
 * 获取保存的主题
 *
 * @private
 * @returns {Theme} 保存的主题或默认主题
 */
function getSavedTheme() {
  const saved = localStorage.getItem(THEME_CONFIG.storageKey);
  if (saved && (saved === 'light' || saved === 'dark')) {
    return /** @type {Theme} */ (saved);
  }
  return THEME_CONFIG.defaultTheme;
}

/**
 * 更新主题图标
 *
 * @private
 * @param {HTMLElement} iconElement - 图标元素
 * @param {Theme} theme - 主题类型
 */
function updateThemeIcon(iconElement, theme) {
  const config = THEME_CONFIG.themes[theme];
  if (!config) return;

  // 移除所有可能的图标类
  iconElement.classList.remove('fa-moon', 'fa-sun');

  // 添加当前主题对应的图标
  iconElement.classList.add(config.icon);
}

/**
 * 是否为暗色主题
 *
 * @returns {boolean} 是否为暗色主题
 *
 * @example
 * if (isDarkTheme()) {
 *   console.log('当前是暗色主题')
 * }
 */
export function isDarkTheme() {
  return getCurrentTheme() === 'dark';
}

/**
 * 是否为亮色主题
 *
 * @returns {boolean} 是否为亮色主题
 *
 * @example
 * if (isLightTheme()) {
 *   console.log('当前是亮色主题')
 * }
 */
export function isLightTheme() {
  return getCurrentTheme() === 'light';
}

/**
 * 监听系统主题变化 (实验性功能)
 *
 * @param {(isDark: boolean) => void} callback - 主题变化时的回调函数
 * @returns {() => void} 取消监听的函数
 *
 * @example
 * const unsubscribe = watchSystemTheme((isDark) => {
 *   console.log('系统主题变化:', isDark ? 'dark' : 'light')
 * })
 *
 * // 取消监听
 * unsubscribe()
 */
export function watchSystemTheme(callback) {
  if (!window.matchMedia) {
    console.warn('[ThemeService] 当前浏览器不支持 matchMedia API');
    return () => {};
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  /**
   * @param {MediaQueryListEvent} e - 媒体查询事件
   */
  const handler = (e) => {
    callback(e.matches);
  };

  mediaQuery.addEventListener('change', handler);

  // 返回取消监听函数
  return () => {
    mediaQuery.removeEventListener('change', handler);
  };
}

export default {
  getCurrentTheme,
  setTheme,
  toggleTheme,
  initTheme,
  isDarkTheme,
  isLightTheme,
  watchSystemTheme,
};
