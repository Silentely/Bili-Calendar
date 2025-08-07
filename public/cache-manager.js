// 本地缓存和历史记录管理模块

class CacheManager {
  constructor() {
    this.cachePrefix = 'bili_calendar_';
    this.maxCacheAge = 3600000; // 1小时缓存有效期
    this.maxHistoryItems = 20;
    this.maxCacheSize = 5 * 1024 * 1024; // 5MB 最大缓存大小
  }

  // ============ 缓存管理 ============

  // 获取缓存键名
  getCacheKey(type, identifier) {
    return `${this.cachePrefix}${type}_${identifier}`;
  }

  // 保存到缓存
  saveToCache(type, identifier, data) {
    try {
      const cacheKey = this.getCacheKey(type, identifier);
      const cacheData = {
        data: data,
        timestamp: Date.now(),
        version: '1.0.0'
      };
      
      // 检查缓存大小
      const dataSize = JSON.stringify(cacheData).length;
      if (dataSize > this.maxCacheSize) {
        console.warn('数据过大，无法缓存');
        return false;
      }
      
      // 清理过期缓存
      this.cleanExpiredCache();
      
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
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

  // 从缓存读取
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

  // 清理过期缓存
  cleanExpiredCache() {
    try {
      const keys = Object.keys(localStorage);
      const now = Date.now();
      
      keys.forEach(key => {
        if (key.startsWith(this.cachePrefix)) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            if (data.timestamp && (now - data.timestamp) > this.maxCacheAge) {
              localStorage.removeItem(key);
            }
          } catch (e) {
            // 如果解析失败，删除这个项目
            localStorage.removeItem(key);
          }
        }
      });
    } catch (e) {
      console.error('清理缓存失败:', e);
    }
  }

  // 清除所有缓存
  clearAllCache() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.cachePrefix)) {
          localStorage.removeItem(key);
        }
      });
      showToast('缓存已清理', 'success');
    } catch (e) {
      console.error('清除缓存失败:', e);
    }
  }

  // 获取缓存统计信息
  getCacheStats() {
    let totalSize = 0;
    let itemCount = 0;
    let oldestTimestamp = Date.now();
    
    try {
      const keys = Object.keys(localStorage);
      
      keys.forEach(key => {
        if (key.startsWith(this.cachePrefix)) {
          const item = localStorage.getItem(key);
          totalSize += item.length;
          itemCount++;
          
          try {
            const data = JSON.parse(item);
            if (data.timestamp && data.timestamp < oldestTimestamp) {
              oldestTimestamp = data.timestamp;
            }
          } catch (e) {}
        }
      });
    } catch (e) {
      console.error('获取缓存统计失败:', e);
    }
    
    return {
      totalSize: this.formatSize(totalSize),
      itemCount: itemCount,
      oldestItem: new Date(oldestTimestamp).toLocaleString('zh-CN')
    };
  }

  // 格式化文件大小
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  // ============ 历史记录管理 ============

  // 保存UID历史
  saveUidHistory(uid, username = null) {
    try {
      let history = this.getUidHistory();
      
      // 查找是否已存在
      const existingIndex = history.findIndex(item => item.uid === uid);
      
      const historyItem = {
        uid: uid,
        username: username,
        timestamp: Date.now(),
        visitCount: 1
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

  // 获取UID历史
  getUidHistory() {
    try {
      const history = localStorage.getItem('uid_history');
      return history ? JSON.parse(history) : [];
    } catch (e) {
      console.error('获取历史记录失败:', e);
      return [];
    }
  }

  // 删除历史记录项
  removeHistoryItem(uid) {
    try {
      let history = this.getUidHistory();
      history = history.filter(item => item.uid !== uid);
      localStorage.setItem('uid_history', JSON.stringify(history));
      return true;
    } catch (e) {
      console.error('删除历史记录失败:', e);
      return false;
    }
  }

  // 清除所有历史记录
  clearHistory() {
    try {
      localStorage.removeItem('uid_history');
      showToast('历史记录已清除', 'success');
      return true;
    } catch (e) {
      console.error('清除历史记录失败:', e);
      return false;
    }
  }

  // ============ UI 组件 ============

  // 显示历史记录面板
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
          ${history.length === 0 ? `
            <div class="history-empty">
              <i class="fas fa-inbox"></i>
              <p>暂无历史记录</p>
            </div>
          ` : `
            <div class="history-list">
              ${history.map(item => `
                <div class="history-item" data-uid="${item.uid}">
                  <div class="history-item-info">
                    <div class="history-uid">${item.uid}</div>
                    ${item.username ? `<div class="history-username">${item.username}</div>` : ''}
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
                    <button class="btn-use-history" onclick="cacheManager.useHistory('${item.uid}')">
                      <i class="fas fa-play"></i> 使用
                    </button>
                    <button class="btn-delete-history" onclick="cacheManager.deleteHistory('${item.uid}')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
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

  // 关闭历史记录面板
  closeHistoryPanel() {
    const panel = document.getElementById('historyPanel');
    if (panel) {
      panel.classList.remove('show');
      setTimeout(() => {
        panel.remove();
      }, 300);
    }
  }

  // 使用历史记录
  useHistory(uid) {
    const input = document.getElementById('uidInput');
    if (input) {
      input.value = uid;
      this.closeHistoryPanel();
      
      // 自动触发生成
      if (typeof handleSubscribe === 'function') {
        handleSubscribe();
      }
    }
  }

  // 删除历史记录
  deleteHistory(uid) {
    if (this.removeHistoryItem(uid)) {
      // 刷新面板
      this.showHistoryPanel();
      showToast('已删除历史记录', 'success');
    }
  }

  // 确认清除历史记录
  clearHistoryWithConfirm() {
    if (confirm('确定要清除所有历史记录吗？')) {
      this.clearHistory();
      this.showHistoryPanel();
    }
  }

  // 渲染缓存统计
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

  // 格式化时间
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

  // 初始化自动建议
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

  // 显示建议
  showSuggestions(value) {
    const container = document.getElementById('autoSuggest');
    if (!container) return;
    
    const history = this.getUidHistory();
    
    if (!value || history.length === 0) {
      this.hideSuggestions();
      return;
    }
    
    // 过滤匹配的历史记录
    const matches = history.filter(item => 
      item.uid.includes(value) || 
      (item.username && item.username.toLowerCase().includes(value.toLowerCase()))
    ).slice(0, 5);
    
    if (matches.length === 0) {
      this.hideSuggestions();
      return;
    }
    
    container.innerHTML = `
      <div class="suggest-list">
        ${matches.map(item => `
          <div class="suggest-item" onclick="cacheManager.selectSuggestion('${item.uid}')">
            <div class="suggest-uid">${item.uid}</div>
            ${item.username ? `<div class="suggest-username">${item.username}</div>` : ''}
            <div class="suggest-time">${this.formatTime(item.timestamp)}</div>
          </div>
        `).join('')}
      </div>
    `;
    
    container.style.display = 'block';
  }

  // 隐藏建议
  hideSuggestions() {
    const container = document.getElementById('autoSuggest');
    if (container) {
      container.style.display = 'none';
    }
  }

  // 选择建议
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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  cacheManager.initAutoSuggest();
  
  // 定期清理过期缓存
  setInterval(() => {
    cacheManager.cleanExpiredCache();
  }, 600000); // 每10分钟清理一次
});

// 导出给其他模块使用
window.cacheManager = cacheManager;