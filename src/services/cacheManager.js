// @ts-check
/**
 * 本地缓存和历史记录管理模块
 * 提供缓存管理、历史记录管理、自动建议等功能
 */

import { escapeHtml } from '../utils/stringUtils.js';
import i18n from './i18n.js';

/**
 * 缓存数据结构
 * @typedef {Object} CacheData
 * @property {any} data - 缓存的数据
 * @property {number} timestamp - 缓存时间戳
 * @property {string} version - 缓存版本号
 */

/**
 * 历史记录项结构
 * @typedef {Object} HistoryItem
 * @property {string} uid - B站用户UID
 * @property {string|null} username - 用户名（可选）
 * @property {number} timestamp - 访问时间戳
 * @property {number} visitCount - 访问次数
 */

/**
 * 缓存统计信息结构
 * @typedef {Object} CacheStats
 * @property {string} totalSize - 总缓存大小（格式化后的字符串）
 * @property {number} itemCount - 缓存项数量
 * @property {string} oldestItem - 最旧的缓存项时间
 */

/**
 * 缓存管理器类
 * 负责本地存储的缓存管理、历史记录管理和自动建议功能
 *
 * @example
 * import { cacheManager } from './services/cacheManager.js'
 *
 * // 保存缓存
 * cacheManager.saveToCache('anime', '12345', { title: '番剧' })
 *
 * // 读取缓存
 * const data = cacheManager.getFromCache('anime', '12345')
 *
 * // 保存历史记录
 * cacheManager.saveUidHistory('614500', '用户名')
 */
export class CacheManager {
  constructor() {
    this.cachePrefix = 'bili_calendar_';
    this.maxCacheAge = 3600000; // 1小时缓存有效期
    this.maxHistoryItems = 20;
    this.maxCacheSize = 5 * 1024 * 1024; // 5MB 最大缓存大小

    // 性能优化：缓存 localStorage 键列表
    this.keysCacheTime = 0;
    this.keysCacheTTL = 5000; // 5秒缓存
    this.cachedKeys = null;

    // 节流标志：防止频繁清理
    this.lastCleanupTime = 0;
    this.cleanupThrottle = 60000; // 1分钟节流
  }

  // ============ 性能优化：缓存管理 ============

  /**
   * 获取 localStorage 所有键（带缓存）
   * 避免频繁调用 Object.keys(localStorage) 造成性能问题
   *
   * @returns {string[]} localStorage 中所有键的数组
   *
   * @example
   * const keys = cacheManager.getCachedKeys()
   * console.log(keys) // => ['bili_calendar_anime_12345', 'uid_history', ...]
   */
  getCachedKeys() {
    const now = Date.now();
    if (this.cachedKeys && now - this.keysCacheTime < this.keysCacheTTL) {
      return this.cachedKeys;
    }

    this.cachedKeys = Object.keys(localStorage);
    this.keysCacheTime = now;
    return this.cachedKeys;
  }

  /**
   * 使缓存的键列表失效
   * 在修改 localStorage 后调用
   *
   * @returns {void}
   *
   * @example
   * localStorage.setItem('new_key', 'value')
   * cacheManager.invalidateKeysCache()
   */
  invalidateKeysCache() {
    this.cachedKeys = null;
  }

  // ============ 缓存管理 ============

  /**
   * 获取缓存键名
   * 根据类型和标识符生成完整的缓存键
   *
   * @param {string} type - 缓存类型（如 'anime', 'user'）
   * @param {string|number} identifier - 唯一标识符
   * @returns {string} 完整的缓存键名
   *
   * @example
   * const key = cacheManager.getCacheKey('anime', '12345')
   * console.log(key) // => 'bili_calendar_anime_12345'
   */
  getCacheKey(type, identifier) {
    return `${this.cachePrefix}${type}_${identifier}`;
  }

  /**
   * 保存数据到缓存
   * 自动添加时间戳和版本信息，检查大小限制
   *
   * @param {string} type - 缓存类型
   * @param {string|number} identifier - 唯一标识符
   * @param {any} data - 要缓存的数据
   * @returns {boolean} 保存成功返回 true，失败返回 false
   *
   * @example
   * const success = cacheManager.saveToCache('anime', '12345', { title: '番剧' })
   * if (success) {
   *   console.log('缓存保存成功')
   * }
   */
  saveToCache(type, identifier, data) {
    try {
      const cacheKey = this.getCacheKey(type, identifier);
      const cacheData = {
        data: data,
        timestamp: Date.now(),
        version: '1.0.0',
      };

      // 检查缓存大小
      const dataSize = JSON.stringify(cacheData).length;
      if (dataSize > this.maxCacheSize) {
        console.warn('数据过大，无法缓存');
        return false;
      }

      // 使用节流的清理过期缓存（不阻塞当前操作）
      this.cleanExpiredCacheThrottled();

      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
      this.invalidateKeysCache(); // 使键缓存失效
      return true;
    } catch (e) {
      console.error('保存缓存失败:', e);
      // 如果是存储空间不足，清理所有缓存
      if (e.name === 'QuotaExceededError') {
        this.clearAllCache();
      }
      return false;
    }
  }

  /**
   * 从缓存读取数据
   * 自动检查缓存是否过期，过期则删除并返回 null
   *
   * @param {string} type - 缓存类型
   * @param {string|number} identifier - 唯一标识符
   * @param {number} [maxAge=this.maxCacheAge] - 最大缓存有效期（毫秒）
   * @returns {any|null} 缓存的数据，未找到或已过期返回 null
   *
   * @example
   * const data = cacheManager.getFromCache('anime', '12345')
   * if (data) {
   *   console.log('找到缓存:', data)
   * }
   */
  getFromCache(type, identifier, maxAge = this.maxCacheAge) {
    try {
      const cacheKey = this.getCacheKey(type, identifier);
      const cached = localStorage.getItem(cacheKey);

      if (!cached) return null;

      const cacheData = JSON.parse(cached);
      const age = Date.now() - cacheData.timestamp;

      // 检查缓存是否过期
      if (age > maxAge) {
        localStorage.removeItem(cacheKey);
        return null;
      }

      return cacheData.data;
    } catch (e) {
      console.error('读取缓存失败:', e);
      return null;
    }
  }

  /**
   * 清理过期缓存（节流版本）
   * 使用节流机制避免频繁清理，提高性能
   * 使用 requestIdleCallback 在空闲时异步执行
   *
   * @returns {void}
   *
   * @example
   * cacheManager.cleanExpiredCacheThrottled()
   */
  cleanExpiredCacheThrottled() {
    const now = Date.now();
    if (now - this.lastCleanupTime < this.cleanupThrottle) {
      return; // 节流：1分钟内只清理一次
    }
    this.lastCleanupTime = now;

    // 使用 requestIdleCallback 异步清理（不阻塞 UI）
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => this.cleanExpiredCache(), { timeout: 2000 });
    } else {
      // 回退：使用 setTimeout
      setTimeout(() => this.cleanExpiredCache(), 100);
    }
  }

  /**
   * 清理过期缓存（核心逻辑）
   * 批量处理过期缓存项，避免长时间阻塞
   *
   * @returns {void}
   *
   * @example
   * cacheManager.cleanExpiredCache()
   */
  cleanExpiredCache() {
    try {
      const keys = this.getCachedKeys(); // 使用缓存的键列表
      const now = Date.now();
      let deletedCount = 0;

      // 分批处理，每批最多处理 10 个键（避免长时间阻塞）
      const batchSize = 10;
      const keysToProcess = keys.filter((key) => key.startsWith(this.cachePrefix));

      for (let i = 0; i < keysToProcess.length && i < batchSize; i++) {
        const key = keysToProcess[i];
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (data.timestamp && now - data.timestamp > this.maxCacheAge) {
            localStorage.removeItem(key);
            deletedCount++;
          }
        } catch {
          // 如果解析失败，删除这个项目
          localStorage.removeItem(key);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        this.invalidateKeysCache(); // 有删除操作时使缓存失效
        console.log(`🧹 清理了 ${deletedCount} 个过期缓存`);
      }
    } catch (e) {
      console.error('清理缓存失败:', e);
    }
  }

  /**
   * 清除所有缓存
   * 删除所有以项目前缀开头的缓存项
   *
   * @returns {void}
   *
   * @example
   * cacheManager.clearAllCache()
   */
  clearAllCache() {
    try {
      const keys = this.getCachedKeys(); // 使用缓存的键列表
      let deletedCount = 0;

      keys.forEach((key) => {
        if (key.startsWith(this.cachePrefix)) {
          localStorage.removeItem(key);
          deletedCount++;
        }
      });

      this.invalidateKeysCache(); // 清除后使缓存失效
      console.log(`🧹 已清理 ${deletedCount} 个缓存项`);
      if (window.showToast) window.showToast(i18n.t('cache.cleared'), 'success');
    } catch (e) {
      console.error('清除缓存失败:', e);
    }
  }

  /**
   * 获取缓存统计信息（优化版）
   * 计算总大小、项目数量和最旧项目时间
   *
   * @returns {CacheStats} 缓存统计对象
   *
   * @example
   * const stats = cacheManager.getCacheStats()
   * console.log(`缓存大小: ${stats.totalSize}, 项数: ${stats.itemCount}`)
   */
  getCacheStats() {
    let totalSize = 0;
    let itemCount = 0;
    let oldestTimestamp = Date.now();

    try {
      const keys = this.getCachedKeys(); // 使用缓存的键列表

      // 只统计相关缓存键
      const relevantKeys = keys.filter((key) => key.startsWith(this.cachePrefix));

      relevantKeys.forEach((key) => {
        const item = localStorage.getItem(key);
        if (item) {
          totalSize += item.length;
          itemCount++;

          try {
            const data = JSON.parse(item);
            if (data.timestamp && data.timestamp < oldestTimestamp) {
              oldestTimestamp = data.timestamp;
            }
          } catch {}
        }
      });
    } catch (e) {
      console.error('获取缓存统计失败:', e);
    }

    return {
      totalSize: this.formatSize(totalSize),
      itemCount: itemCount,
      oldestItem: itemCount > 0 ? new Date(oldestTimestamp).toLocaleString('zh-CN') : 'N/A',
    };
  }

  /**
   * 格式化文件大小
   * 将字节数转换为可读的大小字符串
   *
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的大小字符串（如 "1.23 KB"）
   *
   * @example
   * cacheManager.formatSize(1024) // => '1.00 KB'
   * cacheManager.formatSize(1048576) // => '1.00 MB'
   */
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  // ============ 历史记录管理 ============

  /**
   * 保存UID历史记录
   * 更新访问次数和时间，保持最近访问的项目在前
   *
   * @param {string} uid - B站用户UID
   * @param {string|null} [username=null] - 用户名（可选）
   * @returns {boolean} 保存成功返回 true，失败返回 false
   *
   * @example
   * cacheManager.saveUidHistory('614500', '用户名')
   */
  saveUidHistory(uid, username = null) {
    try {
      let history = this.getUidHistory();

      // 查找是否已存在
      const existingIndex = history.findIndex((item) => item.uid === uid);

      const historyItem = {
        uid: uid,
        username: username,
        timestamp: Date.now(),
        visitCount: 1,
      };

      if (existingIndex >= 0) {
        // 更新访问次数和时间
        historyItem.visitCount = history[existingIndex].visitCount + 1;
        historyItem.username = username || history[existingIndex].username;
        history.splice(existingIndex, 1);
      }

      // 添加到开头
      history.unshift(historyItem);

      // 限制数量
      if (history.length > this.maxHistoryItems) {
        history = history.slice(0, this.maxHistoryItems);
      }

      localStorage.setItem('uid_history', JSON.stringify(history));
      return true;
    } catch (e) {
      console.error('保存历史记录失败:', e);
      return false;
    }
  }

  /**
   * 获取UID历史记录列表
   * 从 localStorage 读取历史记录
   *
   * @returns {HistoryItem[]} 历史记录数组
   *
   * @example
   * const history = cacheManager.getUidHistory()
   * history.forEach(item => console.log(item.uid, item.username))
   */
  getUidHistory() {
    try {
      const history = localStorage.getItem('uid_history');
      return history ? JSON.parse(history) : [];
    } catch (e) {
      console.error('获取历史记录失败:', e);
      return [];
    }
  }

  /**
   * 删除指定的历史记录项
   * 根据UID删除对应的历史记录
   *
   * @param {string} uid - 要删除的UID
   * @returns {boolean} 删除成功返回 true，失败返回 false
   *
   * @example
   * cacheManager.removeHistoryItem('614500')
   */
  removeHistoryItem(uid) {
    try {
      let history = this.getUidHistory();
      history = history.filter((item) => item.uid !== uid);
      localStorage.setItem('uid_history', JSON.stringify(history));
      return true;
    } catch (e) {
      console.error('删除历史记录失败:', e);
      return false;
    }
  }

  /**
   * 清除所有历史记录
   * 删除 localStorage 中的所有历史记录
   *
   * @returns {boolean} 清除成功返回 true，失败返回 false
   *
   * @example
   * cacheManager.clearHistory()
   */
  clearHistory() {
    try {
      localStorage.removeItem('uid_history');
      if (window.showToast) window.showToast(i18n.t('toast.historyCleared'), 'success');
      return true;
    } catch (e) {
      console.error('清除历史记录失败:', e);
      return false;
    }
  }

  // ============ UI 组件 ============

  /**
   * 显示历史记录面板
   * 创建并显示包含历史记录和缓存统计的弹窗
   *
   * @returns {void}
   *
   * @example
   * cacheManager.showHistoryPanel()
   */
  showHistoryPanel() {
    const history = this.getUidHistory();

    // 移除已存在的面板
    this.closeHistoryPanel();

    const panel = document.createElement('div');
    panel.id = 'historyPanel';
    panel.className = 'history-panel';

    panel.innerHTML = `
      <div class="history-panel-overlay" onclick="cacheManager.closeHistoryPanel()"></div>
      <div class="history-panel-content">
        <div class="history-panel-header">
          <h3>
            <i class="fas fa-history"></i>
            历史记录
          </h3>
          <div class="history-panel-actions">
            <button class="btn-clear-history" onclick="cacheManager.clearHistoryWithConfirm()">
              <i class="fas fa-trash"></i> 清除全部
            </button>
            <button class="btn-close-panel" onclick="cacheManager.closeHistoryPanel()">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        
        <div class="history-panel-body">
          ${
            history.length === 0
              ? `
            <div class="history-empty">
              <i class="fas fa-inbox"></i>
              <p>暂无历史记录</p>
            </div>
          `
              : `
            <div class="history-list">
              ${history
                .map(
                  (item) => `
                <div class="history-item" data-uid="${escapeHtml(item.uid)}">
                  <div class="history-item-info">
                    <div class="history-uid">${escapeHtml(item.uid)}</div>
                    ${item.username ? `<div class="history-username">${escapeHtml(item.username)}</div>` : ''}
                    <div class="history-meta">
                      <span class="history-time">
                        <i class="fas fa-clock"></i>
                        ${this.formatTime(item.timestamp)}
                      </span>
                      <span class="history-visits">
                        <i class="fas fa-eye"></i>
                        访问 ${item.visitCount} 次
                      </span>
                    </div>
                  </div>
                  <div class="history-item-actions">
                    <button class="btn-use-history" onclick="cacheManager.useHistory('${escapeHtml(item.uid)}')">
                      <i class="fas fa-play"></i> 使用
                    </button>
                    <button class="btn-delete-history" onclick="cacheManager.deleteHistory('${escapeHtml(item.uid)}')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          `
          }
        </div>
        
        <div class="history-panel-footer">
          <div class="cache-stats">
            ${this.renderCacheStats()}
          </div>
          <button class="btn-clear-cache" onclick="cacheManager.clearAllCache()">
            <i class="fas fa-broom"></i> 清理缓存
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // 添加动画
    setTimeout(() => {
      panel.classList.add('show');
    }, 10);
  }

  /**
   * 关闭历史记录面板
   * 带动画效果地关闭历史记录弹窗
   *
   * @returns {void}
   *
   * @example
   * cacheManager.closeHistoryPanel()
   */
  closeHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    if (panel) {
      panel.classList.remove('show');
      setTimeout(() => {
        panel.remove();
      }, 300);
    }
  }

  /**
   * 使用历史记录
   * 将选中的UID填入输入框并自动触发生成
   *
   * @param {string} uid - 要使用的UID
   * @returns {void}
   *
   * @example
   * cacheManager.useHistory('614500')
   */
  useHistory(uid) {
    const input = document.getElementById('uidInput');
    if (input) {
      input.value = uid;
      this.closeHistoryPanel();

      // 自动触发生成 - 使用 window.handleSubscribe
      if (typeof window.handleSubscribe === 'function') {
        window.handleSubscribe();
      }
    }
  }

  /**
   * 删除历史记录并刷新面板
   * 删除指定UID的历史记录并重新显示面板
   *
   * @param {string} uid - 要删除的UID
   * @returns {void}
   *
   * @example
   * cacheManager.deleteHistory('614500')
   */
  deleteHistory(uid) {
    if (this.removeHistoryItem(uid)) {
      // 刷新面板
      this.showHistoryPanel();
      if (window.showToast) window.showToast(i18n.t('toast.historyItemDeleted'), 'success');
    }
  }

  /**
   * 确认清除历史记录
   * 显示确认对话框后清除所有历史记录
   *
   * @returns {void}
   *
   * @example
   * cacheManager.clearHistoryWithConfirm()
   */
  clearHistoryWithConfirm() {
    if (confirm('确定要清除所有历史记录吗？')) {
      this.clearHistory();
      this.showHistoryPanel();
    }
  }

  /**
   * 渲染缓存统计信息
   * 生成缓存统计的 HTML 字符串
   *
   * @returns {string} 缓存统计的 HTML
   *
   * @example
   * const html = cacheManager.renderCacheStats()
   */
  renderCacheStats() {
    const stats = this.getCacheStats();
    return `
      <span class="stat-item">
        <i class="fas fa-database"></i>
        缓存大小: ${stats.totalSize}
      </span>
      <span class="stat-item">
        <i class="fas fa-file"></i>
        缓存项: ${stats.itemCount}
      </span>
    `;
  }

  /**
   * 格式化时间为友好格式
   * 将时间戳转换为相对时间或绝对时间
   *
   * @param {number} timestamp - 时间戳（毫秒）
   * @returns {string} 格式化后的时间字符串
   *
   * @example
   * cacheManager.formatTime(Date.now()) // => '刚刚'
   * cacheManager.formatTime(Date.now() - 3600000) // => '1 小时前'
   */
  formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      return Math.floor(diff / 60000) + ' 分钟前';
    } else if (diff < 86400000) {
      return Math.floor(diff / 3600000) + ' 小时前';
    } else if (diff < 604800000) {
      return Math.floor(diff / 86400000) + ' 天前';
    } else {
      return new Date(timestamp).toLocaleDateString('zh-CN');
    }
  }

  // ============ 自动建议 ============

  /**
   * 初始化自动建议功能
   * 为 UID 输入框添加自动补全功能
   *
   * @returns {void}
   *
   * @example
   * cacheManager.initAutoSuggest()
   */
  initAutoSuggest() {
    const input = document.getElementById('uidInput');
    if (!input) return;

    // 创建建议容器
    const suggestContainer = document.createElement('div');
    suggestContainer.className = 'auto-suggest-container';
    suggestContainer.id = 'autoSuggest';
    input.parentElement.appendChild(suggestContainer);

    // 输入事件监听
    input.addEventListener('input', (e) => {
      this.showSuggestions(e.target.value);
    });

    // 焦点事件
    input.addEventListener('focus', (e) => {
      if (e.target.value) {
        this.showSuggestions(e.target.value);
      }
    });

    // 失焦事件
    input.addEventListener('blur', () => {
      setTimeout(() => {
        this.hideSuggestions();
      }, 200);
    });
  }

  /**
   * 显示自动建议列表
   * 根据输入值过滤并显示匹配的历史记录
   *
   * @param {string} value - 当前输入值
   * @returns {void}
   *
   * @example
   * cacheManager.showSuggestions('614')
   */
  showSuggestions(value) {
    const container = document.getElementById('autoSuggest');
    if (!container) return;

    const history = this.getUidHistory();

    if (!value || history.length === 0) {
      this.hideSuggestions();
      return;
    }

    // 过滤匹配的历史记录
    const matches = history
      .filter(
        (item) =>
          item.uid.includes(value) ||
          (item.username && item.username.toLowerCase().includes(value.toLowerCase()))
      )
      .slice(0, 5);

    if (matches.length === 0) {
      this.hideSuggestions();
      return;
    }

    container.innerHTML = `
      <div class="suggest-list">
        ${matches
          .map(
            (item) => `
          <div class="suggest-item" onclick="cacheManager.selectSuggestion('${escapeHtml(item.uid)}')">
            <div class="suggest-uid">${escapeHtml(item.uid)}</div>
            ${item.username ? `<div class="suggest-username">${escapeHtml(item.username)}</div>` : ''}
            <div class="suggest-time">${this.formatTime(item.timestamp)}</div>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    container.style.display = 'block';
  }

  /**
   * 隐藏自动建议列表
   * 隐藏建议容器
   *
   * @returns {void}
   *
   * @example
   * cacheManager.hideSuggestions()
   */
  hideSuggestions() {
    const container = document.getElementById('autoSuggest');
    if (container) {
      container.style.display = 'none';
    }
  }

  /**
   * 选择自动建议项
   * 将选中的UID填入输入框并隐藏建议列表
   *
   * @param {string} uid - 选中的UID
   * @returns {void}
   *
   * @example
   * cacheManager.selectSuggestion('614500')
   */
  selectSuggestion(uid) {
    const input = document.getElementById('uidInput');
    if (input) {
      input.value = uid;
      this.hideSuggestions();
    }
  }
}

// 创建全局实例
const cacheManager = new CacheManager();

export default cacheManager;
