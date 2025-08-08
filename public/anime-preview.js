// 番剧预览功能模块

class AnimePreview {
  constructor() {
    this.animeData = [];
    this.modalId = 'animePreviewModal';
    this.isLoading = false;
  }

  // 获取番剧数据
  async fetchAnimeData(uid) {
    if (this.isLoading) return;

    this.isLoading = true;
    try {
      const response = await fetch(`/api/bangumi/${uid}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // 处理和格式化数据
      this.animeData = this.formatAnimeData(data);

      return this.animeData;
    } catch (error) {
      console.error('获取番剧数据失败:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  // 格式化番剧数据
  formatAnimeData(rawData) {
    if (!rawData || !rawData.data) return [];

    // 处理API返回的数据结构 - data.list
    const animeList = rawData.data.list || rawData.data || [];

    return animeList.map((anime) => {
      // 处理评分数据
      let rating = '暂无评分';
      if (anime.rating) {
        if (typeof anime.rating === 'object') {
          rating = anime.rating.score || anime.rating.value || '暂无评分';
        } else {
          rating = anime.rating;
        }
      }

      // 处理图片防盗链 - 使用B站的referrer策略
      let coverUrl = anime.cover || '';
      if (coverUrl && !coverUrl.startsWith('http')) {
        coverUrl = 'https:' + coverUrl;
      }
      // 添加webp格式和大小参数优化加载
      if (coverUrl) {
        coverUrl = coverUrl.replace('http://', 'https://');
        if (!coverUrl.includes('@')) {
          coverUrl += '@320w_200h.webp';
        }
      }

      return {
        id: anime.media_id || anime.season_id,
        title: anime.title || '未知番剧',
        cover: coverUrl,
        season: anime.season_title || anime.title || '未知',
        episodes: anime.total_count || anime.new_ep?.index || '未知',
        currentEpisode: anime.progress || anime.new_ep?.index_show || 0,
        status: this.getAnimeStatus(anime),
        updateTime: this.formatUpdateTime(anime),
        rating: rating,
        url: `https://www.bilibili.com/bangumi/media/md${anime.media_id}`,
        isFinished: anime.is_finish === 1,
        updateDay: this.getUpdateDay(anime),
        nextEpisodeTime: this.getNextEpisodeTime(anime),
      };
    });
  }

  // 获取番剧状态
  getAnimeStatus(anime) {
    if (anime.is_finish === 1) {
      return { text: '已完结', type: 'finished', color: '#999' };
    }
    if (anime.progress && anime.total_count) {
      if (anime.progress >= anime.total_count) {
        return { text: '已看完', type: 'completed', color: '#4caf50' };
      }
      return { text: '追番中', type: 'watching', color: '#00a1d6' };
    }
    return { text: '未开始', type: 'not-started', color: '#ff9800' };
  }

  // 格式化更新时间
  formatUpdateTime(anime) {
    if (!anime.new_ep || !anime.new_ep.pub_time) {
      return '暂无更新';
    }

    const date = new Date(anime.new_ep.pub_time);
    const now = new Date();
    const diff = now - date;

    if (diff < 86400000) {
      // 24小时内
      const hours = Math.floor(diff / 3600000);
      return hours > 0 ? `${hours}小时前更新` : '刚刚更新';
    } else if (diff < 604800000) {
      // 7天内
      const days = Math.floor(diff / 86400000);
      return `${days}天前更新`;
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  }

  // 获取更新日
  getUpdateDay(anime) {
    if (anime.is_finish === 1) return null;

    // 尝试从API数据中解析更新日
    if (anime.new_ep && anime.new_ep.pub_time) {
      const date = new Date(anime.new_ep.pub_time);
      const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      return days[date.getDay()];
    }

    return null;
  }

  // 获取下一集更新时间
  getNextEpisodeTime(anime) {
    if (anime.is_finish === 1) return null;

    // 这里需要根据实际API返回的数据结构调整
    if (anime.new_ep && anime.new_ep.pub_time) {
      const lastUpdate = new Date(anime.new_ep.pub_time);
      const nextUpdate = new Date(lastUpdate);
      nextUpdate.setDate(nextUpdate.getDate() + 7); // 假设每周更新

      if (nextUpdate > new Date()) {
        return nextUpdate.toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }

    return null;
  }

  // 显示预览模态框
  showPreview(animeData = null) {
    if (animeData) {
      this.animeData = animeData;
    }

    // 移除已存在的模态框
    this.closePreview();

    // 创建模态框
    const modal = document.createElement('div');
    modal.id = this.modalId;
    modal.className = 'anime-preview-modal';

    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'animePreviewTitle');
    modal.innerHTML = `
      <div class="anime-preview-overlay" onclick="animePreview.closePreview()"></div>
      <div class="anime-preview-content">
        <div class="anime-preview-header">
          <h2 id="animePreviewTitle">
            <i class="fas fa-film"></i>
            番剧预览
            <span class="anime-count">${this.animeData.length} 部</span>
          </h2>
          <div class="anime-preview-actions">
            <button class="btn-filter" onclick="animePreview.showFilter()" aria-label="筛选" title="筛选">
              <i class="fas fa-filter"></i> 筛选
            </button>
            <button class="btn-sort" onclick="animePreview.toggleSort()" aria-label="排序" title="排序">
              <i class="fas fa-sort"></i> 排序
            </button>
            <button class="close-preview" onclick="animePreview.closePreview()" aria-label="关闭预览" title="关闭预览">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        
        <div class="anime-preview-filters" id="animeFilters" style="display: none;">
          <button class="filter-btn active" data-filter="all">全部</button>
          <button class="filter-btn" data-filter="watching">追番中</button>
          <button class="filter-btn" data-filter="finished">已完结</button>
          <button class="filter-btn" data-filter="not-started">未开始</button>
        </div>
        
        <div class="anime-preview-body">
          <div class="anime-list" id="animeList">
            ${this.renderAnimeList()}
          </div>
        </div>
        
        <div class="anime-preview-footer">
          <div class="anime-stats">
            ${this.renderStats()}
          </div>
          <button class="btn-confirm" onclick="animePreview.confirmAndGenerate()" aria-label="确认并生成订阅" title="确认并生成订阅">
            <i class="fas fa-check"></i> 确认并生成订阅
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 添加动画
    setTimeout(() => {
      modal.classList.add('show');
      // 将焦点移动到关闭按钮，建立简单的焦点圈
      const closeBtn = modal.querySelector('.close-preview');
      if (closeBtn) closeBtn.focus();
      // ESC 关闭
      const onKeydown = (e) => {
        if (e.key === 'Escape') {
          this.closePreview();
          document.removeEventListener('keydown', onKeydown);
        }
      };
      document.addEventListener('keydown', onKeydown);
    }, 10);

    // 绑定筛选事件
    this.bindFilterEvents();
  }

  // 渲染番剧列表
  renderAnimeList(filter = 'all') {
    let filteredData = this.animeData;

    if (filter !== 'all') {
      filteredData = this.animeData.filter((anime) => anime.status.type === filter);
    }

    if (filteredData.length === 0) {
      return `
        <div class="anime-empty">
          <i class="fas fa-inbox"></i>
          <p>没有找到相关番剧</p>
        </div>
      `;
    }

    return filteredData
      .map(
        (anime) => `
      <div class="anime-item" data-id="${anime.id}">
        <div class="anime-cover">
          <img src="${anime.cover}"
               alt="${anime.title}"
               loading="lazy"
               onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 320 200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22320%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2214%22%3E暂无图片%3C/text%3E%3C/svg%3E'"
               referrerpolicy="no-referrer">
          <div class="anime-status-badge" style="background: ${anime.status.color}">
            ${anime.status.text}
          </div>
        </div>
        
        <div class="anime-info">
          <h3 class="anime-title">
            <a href="${anime.url}" target="_blank">${anime.title}</a>
          </h3>
          <div class="anime-meta">
            <span class="anime-episodes">
              <i class="fas fa-list"></i>
              ${anime.currentEpisode}/${anime.episodes} 集
            </span>
            ${
              anime.updateDay
                ? `
              <span class="anime-update-day">
                <i class="fas fa-calendar-day"></i>
                ${anime.updateDay}更新
              </span>
            `
                : ''
            }
            ${
              anime.rating !== '暂无评分'
                ? `
              <span class="anime-rating">
                <i class="fas fa-star"></i>
                ${anime.rating}
              </span>
            `
                : ''
            }
          </div>
          <div class="anime-update-time">
            <i class="fas fa-clock"></i>
            ${anime.updateTime}
          </div>
          ${
            anime.nextEpisodeTime
              ? `
            <div class="anime-next-episode">
              <i class="fas fa-bell"></i>
              下集：${anime.nextEpisodeTime}
            </div>
          `
              : ''
          }
        </div>
        
        <div class="anime-actions">
          <button class="btn-anime-detail" onclick="animePreview.showDetail('${anime.id}')">
            <i class="fas fa-info-circle"></i>
          </button>
        </div>
      </div>
    `
      )
      .join('');
  }

  // 渲染统计信息
  renderStats() {
    const watching = this.animeData.filter((a) => a.status.type === 'watching').length;
    const finished = this.animeData.filter((a) => a.status.type === 'finished').length;
    const notStarted = this.animeData.filter((a) => a.status.type === 'not-started').length;

    return `
      <span class="stat-item">
        <i class="fas fa-play-circle" style="color: #00a1d6"></i>
        追番中 ${watching}
      </span>
      <span class="stat-item">
        <i class="fas fa-check-circle" style="color: #4caf50"></i>
        已完结 ${finished}
      </span>
      <span class="stat-item">
        <i class="fas fa-clock" style="color: #ff9800"></i>
        未开始 ${notStarted}
      </span>
    `;
  }

  // 绑定筛选事件
  bindFilterEvents() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        // 更新按钮状态
        filterBtns.forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');

        // 重新渲染列表
        const filter = e.target.dataset.filter;
        const listContainer = document.getElementById('animeList');
        listContainer.innerHTML = this.renderAnimeList(filter);
      });
    });
  }

  // 显示筛选器
  showFilter() {
    const filters = document.getElementById('animeFilters');
    filters.style.display = filters.style.display === 'none' ? 'flex' : 'none';
  }

  // 切换排序
  toggleSort() {
    // 按更新时间排序
    this.animeData.reverse();
    const listContainer = document.getElementById('animeList');
    listContainer.innerHTML = this.renderAnimeList();
  }

  // 显示番剧详情
  showDetail(animeId) {
    const anime = this.animeData.find((a) => a.id == animeId);
    if (!anime) return;

    // 这里可以显示更详细的信息
    if (window.showToast) {
      window.showToast(
        `《${anime.title}》\n状态：${anime.status.text}\n进度：${anime.currentEpisode}/${anime.episodes}`,
        'info',
        5000
      );
    }
  }

  // 关闭预览
  closePreview() {
    const modal = document.getElementById(this.modalId);
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => {
        modal.remove();
      }, 300);
    }
  }

  // 确认并生成订阅
  confirmAndGenerate() {
    this.closePreview();
    // 继续原来的生成流程
    if (window.currentGenerateCallback) {
      window.currentGenerateCallback();
    }
  }
}

// 创建全局实例
const animePreview = new AnimePreview();

// 导出给其他模块使用
window.animePreview = animePreview;
