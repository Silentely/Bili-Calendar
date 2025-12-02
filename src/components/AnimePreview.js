// 番剧预览功能模块
import i18n from '../services/i18n';

const STATUS_COLORS = {
  watching: '#00a1d6',
  finished: '#999999',
  completed: '#4caf50',
  'not-started': '#ff9800',
};

const WEEK_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const PREVIEW_MAX_EXTERNAL_SOURCES = 5;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class AnimePreview {
  constructor() {
    this.animeData = [];
    this.modalId = 'animePreviewModal';
    this.isLoading = false;
    this.activeFilter = 'all';
    this.previousActiveElement = null;
    this.focusTrapHandler = null;
    this.modalElement = null;
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
      const defaultRating = i18n.t('preview.meta.noRating');
      let rating = defaultRating;
      let ratingValue = null;
      if (anime.rating) {
        if (typeof anime.rating === 'object') {
          rating = anime.rating.score || anime.rating.value || defaultRating;
          ratingValue = parseFloat(anime.rating.score || anime.rating.value);
        } else {
          rating = anime.rating;
          ratingValue = parseFloat(anime.rating);
        }
      }

      if (Number.isNaN(ratingValue)) ratingValue = null;

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

      const statusType = this.getAnimeStatusType(anime);

      return {
        id: anime.media_id || anime.season_id,
        title: anime.title || i18n.t('preview.meta.unknownAnime'),
        cover: coverUrl,
        season: anime.season_title || anime.title || i18n.t('preview.meta.unknownSeason'),
        episodes: anime.total_count || anime.new_ep?.index || i18n.t('preview.meta.unknownEpisode'),
        currentEpisode: anime.progress || anime.new_ep?.index_show || 0,
        statusType,
        statusColor: STATUS_COLORS[statusType] || STATUS_COLORS.watching,
        updateTime: this.formatUpdateTime(anime),
        rating: rating,
        ratingValue,
        url: `https://www.bilibili.com/bangumi/media/md${anime.media_id}`,
        isFinished: anime.is_finish === 1,
        updateDayKey: this.getUpdateDayKey(anime),
        nextEpisodeTime: this.getNextEpisodeTime(anime),
        rawPubTime: anime.new_ep?.pub_time ? new Date(anime.new_ep.pub_time) : null,
      };
    });
  }

  getAnimeStatusType(anime) {
    if (anime.is_finish === 1) {
      return 'finished';
    }
    if (anime.progress && anime.total_count) {
      if (anime.progress >= anime.total_count) {
        return 'completed';
      }
      return 'watching';
    }
    return 'not-started';
  }

  // 格式化更新时间
  formatUpdateTime(anime) {
    if (!anime.new_ep || !anime.new_ep.pub_time) {
      return i18n.t('preview.update.none');
    }

    const date = new Date(anime.new_ep.pub_time);
    const now = new Date();
    const diff = now - date;

    if (diff < 86400000) {
      // 24小时内
      const hours = Math.floor(diff / 3600000);
      return hours > 0
        ? i18n.t('preview.update.hoursAgo', { count: hours })
        : i18n.t('preview.update.justNow');
    } else if (diff < 604800000) {
      // 7天内
      const days = Math.floor(diff / 86400000);
      return i18n.t('preview.update.daysAgo', { count: days });
    } else {
      return date.toLocaleDateString(i18n.getLanguage());
    }
  }

  // 获取更新日 key
  getUpdateDayKey(anime) {
    if (anime.is_finish === 1) return 'unknown';

    if (anime.new_ep && anime.new_ep.pub_time) {
      const date = new Date(anime.new_ep.pub_time);
      const dayIndex = date.getDay();
      return WEEK_KEYS[dayIndex] || 'unknown';
    }

    return 'unknown';
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
        return nextUpdate.toLocaleString(i18n.getLanguage(), {
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
    this.activeFilter = 'all';

    // 移除已存在的模态框
    this.closePreview();

    // 创建模态框
    const modal = document.createElement('div');
    modal.id = this.modalId;
    modal.className = 'anime-preview-modal';

    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'animePreviewTitle');

    const countLabel = escapeHtml(i18n.t('preview.count', { count: this.animeData.length }));
    const filterLabel = escapeHtml(i18n.t('preview.actions.filter'));
    const sortLabel = escapeHtml(i18n.t('preview.actions.sort'));
    const closeLabel = escapeHtml(i18n.t('preview.actions.close'));
    const confirmLabel = escapeHtml(i18n.t('preview.actions.confirm'));
    const reminderLabel = escapeHtml(i18n.t('preview.actions.enableReminder'));
    const pushLabel = escapeHtml(i18n.t('preview.actions.enablePush'));
    const leadPrefix = escapeHtml(i18n.t('preview.actions.reminderLeadPrefix'));
    const leadSuffix = escapeHtml(i18n.t('preview.actions.reminderLeadSuffix'));
    const reminderHint = escapeHtml(i18n.t('preview.reminder.hint'));
    const aggregatePanel = this.renderAggregatePanel();
    const filterAll = escapeHtml(i18n.t('preview.filter.all'));
    const filterWatching = escapeHtml(i18n.t('preview.filter.watching'));
    const filterFinished = escapeHtml(i18n.t('preview.filter.finished'));
    const filterNotStarted = escapeHtml(i18n.t('preview.filter.notStarted'));

    modal.innerHTML = `
      <button type="button" class="anime-preview-overlay" data-action="overlay-close" aria-label="${escapeHtml(
        i18n.t('preview.close')
      )}"></button>
      <div class="anime-preview-content" role="document">
        <div class="anime-preview-header">
          <h2 id="animePreviewTitle">
            <i class="fas fa-film"></i>
            ${escapeHtml(i18n.t('preview.title'))}
            <span class="anime-count">${countLabel}</span>
          </h2>
          <div class="anime-preview-actions">
            <button class="btn-filter" type="button" data-action="toggle-filters" aria-label="${filterLabel}" title="${filterLabel}">
              <i class="fas fa-filter"></i> ${filterLabel}
            </button>
            <button class="btn-sort" type="button" data-action="toggle-sort" aria-label="${sortLabel}" title="${sortLabel}">
              <i class="fas fa-sort"></i> ${sortLabel}
            </button>
            <button class="close-preview" type="button" data-action="close-modal" aria-label="${closeLabel}" title="${closeLabel}">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        
        <div class="anime-preview-filters" id="animeFilters" style="display: none;">
          <button class="filter-btn active" type="button" data-filter="all">${filterAll}</button>
          <button class="filter-btn" type="button" data-filter="watching">${filterWatching}</button>
          <button class="filter-btn" type="button" data-filter="finished">${filterFinished}</button>
          <button class="filter-btn" type="button" data-filter="not-started">${filterNotStarted}</button>
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
          ${aggregatePanel}
          <div class="reminder-hint">${reminderHint}</div>
          <div class="preview-actions">
            <label class="lead-select">
              <span>${leadPrefix}</span>
              <select id="reminderLead" aria-label="${leadPrefix} ${leadSuffix}">
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="15">15</option>
              </select>
              <span>${leadSuffix}</span>
            </label>
            <button class="btn-ghost" id="enableReminder" type="button" aria-label="${reminderLabel}" title="${reminderLabel}">
              <i class="fas fa-bell"></i> ${reminderLabel}
            </button>
            <button class="btn-ghost" id="enablePush" type="button" aria-label="${pushLabel}" title="${pushLabel}">
              <i class="fas fa-satellite-dish"></i> ${pushLabel}
            </button>
            <button class="btn-confirm" type="button" data-action="confirm-generate" aria-label="${confirmLabel}" title="${confirmLabel}">
              <i class="fas fa-check"></i> ${confirmLabel}
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalElement = modal;

    requestAnimationFrame(() => {
      modal.classList.add('show');
    });

    this.bindModalEvents(modal);
    this.bindFilterEvents(modal);
    this.setupListDelegation(modal);
    this.enableFocusTrap(modal);
    this.setupAggregatePreview(modal);
  }

  bindModalEvents(modal) {
    const overlay = modal.querySelector('[data-action="overlay-close"]');
    if (overlay) {
      overlay.addEventListener('click', () => this.closePreview());
    }

    const closeBtn = modal.querySelector('[data-action="close-modal"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closePreview());
    }

    const filterBtn = modal.querySelector('[data-action="toggle-filters"]');
    if (filterBtn) {
      filterBtn.addEventListener('click', () => this.showFilter());
    }

    const sortBtn = modal.querySelector('[data-action="toggle-sort"]');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => this.toggleSort());
    }

    const confirmBtn = modal.querySelector('[data-action="confirm-generate"]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirmAndGenerate());
    }
  }

  setupListDelegation(modal) {
    const listContainer = modal.querySelector('#animeList');
    if (!listContainer) return;
    listContainer.addEventListener('click', (event) => {
      const detailBtn = event.target.closest('[data-action="show-detail"]');
      if (detailBtn) {
        this.showDetail(detailBtn.dataset.animeId);
      }
    });
  }

  enableFocusTrap(modal) {
    this.previousActiveElement = document.activeElement;
    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = modal.querySelectorAll(focusableSelectors);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    this.focusTrapHandler = (event) => {
      if (event.key === 'Tab') {
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (event.key === 'Escape') {
        this.closePreview();
      }
    };
    modal.addEventListener('keydown', this.focusTrapHandler);
    first.focus();
  }

  disableFocusTrap() {
    if (this.modalElement && this.focusTrapHandler) {
      this.modalElement.removeEventListener('keydown', this.focusTrapHandler);
    }
    this.focusTrapHandler = null;
    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      this.previousActiveElement.focus();
    }
    this.previousActiveElement = null;
  }

  // 渲染番剧列表
  renderAnimeList(filter = null) {
    if (filter) {
      this.activeFilter = filter;
    }
    const effectiveFilter = this.activeFilter || 'all';
    let filteredData = this.animeData;

    if (effectiveFilter !== 'all') {
      filteredData = this.animeData.filter((anime) => {
        if (effectiveFilter === 'finished') {
          return ['finished', 'completed'].includes(anime.statusType);
        }
        return anime.statusType === effectiveFilter;
      });
    }

    if (filteredData.length === 0) {
      return `
        <div class="anime-empty">
          <i class="fas fa-inbox"></i>
          <p>${escapeHtml(i18n.t('preview.empty'))}</p>
        </div>
      `;
    }

    const fallbackAlt = encodeURIComponent(i18n.t('preview.meta.noImage'));

    return filteredData
      .map((anime) => {
        const statusText = escapeHtml(i18n.t(`preview.status.${anime.statusType}`));
        const safeTitle = escapeHtml(anime.title);
        const safeUrl = escapeHtml(anime.url);
        const animeId = escapeHtml(anime.id);
        const episodesText = escapeHtml(
          i18n.t('preview.meta.episodes', {
            current: anime.currentEpisode,
            total: anime.episodes,
          })
        );
        const updateDayText =
          anime.updateDayKey && anime.updateDayKey !== 'unknown'
            ? escapeHtml(
                i18n.t('preview.meta.updateDay', {
                  day: i18n.t(`preview.week.${anime.updateDayKey}`),
                })
              )
            : '';
        const ratingText =
          anime.rating && anime.rating !== i18n.t('preview.meta.noRating')
            ? escapeHtml(anime.rating)
            : '';
        const updateTimeText = escapeHtml(anime.updateTime);
        const nextEpisodeText = anime.nextEpisodeTime
          ? escapeHtml(i18n.t('preview.meta.nextEpisode', { time: anime.nextEpisodeTime }))
          : '';

        const coverSrc = escapeHtml(anime.cover || '');
        return `
      <div class="anime-item" data-id="${animeId}">
        <div class="anime-cover">
          <img src="${coverSrc}"
               alt="${safeTitle}"
               loading="lazy"
               onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 320 200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22320%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2214%22%3E${fallbackAlt}%3C/text%3E%3C/svg%3E'"
               referrerpolicy="no-referrer">
          <div class="anime-status-badge" style="background: ${anime.statusColor}">
            ${statusText}
          </div>
        </div>
        
        <div class="anime-info">
          <h3 class="anime-title">
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeTitle}</a>
          </h3>
          <div class="anime-meta">
            <span class="anime-episodes">
              <i class="fas fa-list"></i>
              ${episodesText}
            </span>
            ${
              updateDayText
                ? `
              <span class="anime-update-day">
                <i class="fas fa-calendar-day"></i>
                ${updateDayText}
              </span>
            `
                : ''
            }
            ${
              ratingText
                ? `
              <span class="anime-rating">
                <i class="fas fa-star"></i>
                ${ratingText}
              </span>
            `
                : ''
            }
          </div>
          <div class="anime-update-time">
            <i class="fas fa-clock"></i>
            ${updateTimeText}
          </div>
          ${
            nextEpisodeText
              ? `
            <div class="anime-next-episode">
              <i class="fas fa-bell"></i>
              ${nextEpisodeText}
            </div>
          `
              : ''
          }
        </div>
        
        <div class="anime-actions">
          <button class="btn-anime-detail" type="button" data-action="show-detail" data-anime-id="${animeId}">
            <i class="fas fa-info-circle"></i>
          </button>
        </div>
      </div>
    `;
      })
      .join('');
  }

  // 渲染统计信息
  renderStats() {
    const stats = this.computeStats();
    const weekOrder = [...WEEK_KEYS, 'unknown'];
    const weekBars = weekOrder
      .map((key) => {
        const count = stats.weekMap[key] || 0;
        if (count === 0) return '';
        const width = stats.weekMax === 0 ? 0 : Math.round((count / stats.weekMax) * 100);
        return `
          <div class="week-row">
            <span>${escapeHtml(i18n.t(`preview.week.${key}`))}</span>
            <div class="week-bar">
              <div class="week-bar-fill" style="width:${width}%"></div>
            </div>
            <span class="week-count">${count}</span>
          </div>
        `;
      })
      .join('');

    const watchingLabel = escapeHtml(i18n.t('preview.stats.status.watching'));
    const finishedLabel = escapeHtml(i18n.t('preview.stats.status.finished'));
    const notStartedLabel = escapeHtml(i18n.t('preview.stats.status.notStarted'));
    const stateTitle = escapeHtml(i18n.t('preview.stats.stateTitle'));
    const updateTitle = escapeHtml(i18n.t('preview.stats.updateTitle'));
    const todayLabel = escapeHtml(i18n.t('preview.stats.todayCount', { count: stats.todayCount }));
    const recentLabel = escapeHtml(i18n.t('preview.stats.recentCount', { count: stats.recent7 }));
    const weekTitle = escapeHtml(i18n.t('preview.stats.weekTitle'));
    const ratingTitle = escapeHtml(i18n.t('preview.stats.ratingTitle'));
    const ratingCount = escapeHtml(i18n.t('preview.stats.ratingCount', { count: stats.ratingCount }));
    const ratingValue = stats.avgRating ?? i18n.t('preview.meta.noRating');

    return `
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-title">${stateTitle}</div>
          <div class="stat-chips">
            <span class="stat-chip stat-chip-primary">
              <i class="fas fa-play-circle"></i> ${watchingLabel} ${stats.status.watching}
            </span>
            <span class="stat-chip stat-chip-success">
              <i class="fas fa-check-circle"></i> ${finishedLabel} ${stats.status.finished}
            </span>
            <span class="stat-chip stat-chip-warn">
              <i class="fas fa-clock"></i> ${notStartedLabel} ${stats.status.notStarted}
            </span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-title">${updateTitle}</div>
          <div class="stat-highlight">${todayLabel}</div>
          <div class="stat-sub">${recentLabel}</div>
        </div>

        <div class="stat-card">
          <div class="stat-title">${weekTitle}</div>
          <div class="week-chart">${weekBars || '<div class="week-empty">-</div>'}</div>
        </div>

        <div class="stat-card">
          <div class="stat-title">${ratingTitle}</div>
          <div class="stat-highlight">${escapeHtml(ratingValue)}</div>
          <div class="stat-sub">${ratingCount}</div>
        </div>
      </div>
    `;
  }

  renderAggregatePanel() {
    if (
      typeof window === 'undefined' ||
      !window.aggregateConfig ||
      typeof window.aggregateConfig.get !== 'function'
    ) {
      return '';
    }

    const config = window.aggregateConfig.get() || {};
    const enabled = !!config.enabled;
    const rawSources = config.rawSources || '';
    const title = escapeHtml(i18n.t('preview.aggregate.title'));
    const desc = escapeHtml(i18n.t('preview.aggregate.desc'));
    const applyText = escapeHtml(i18n.t('preview.aggregate.apply'));
    const sampleText = escapeHtml(i18n.t('preview.aggregate.sample'));
    const toggleLabel = escapeHtml(i18n.t('aggregate.enable'));
    const placeholder = escapeHtml(i18n.t('aggregate.placeholder'));
    const badge = escapeHtml(i18n.t('aggregate.badge'));
    const statusText = escapeHtml(this.describeAggregateStatus(enabled, rawSources));
    const toggleChecked = enabled ? 'checked' : '';
    const rawEscaped = escapeHtml(rawSources);

    return `
      <div class="preview-aggregate-panel" id="previewAggregatePanel">
        <div class="preview-aggregate-header">
          <div class="preview-aggregate-title">
            <span class="beta-badge">${badge}</span>
            <span>${title}</span>
          </div>
          <label class="aggregate-toggle">
            <input type="checkbox" id="previewAggregateToggle" ${toggleChecked} />
            <span class="aggregate-toggle-slider"></span>
            <span class="aggregate-toggle-text">${toggleLabel}</span>
          </label>
        </div>
        <p class="preview-aggregate-desc">${desc}</p>
        <textarea
          id="previewAggregateSources"
          class="aggregate-textarea"
          rows="3"
          placeholder="${placeholder}"
        >${rawEscaped}</textarea>
        <div class="preview-aggregate-actions">
          <button type="button" class="btn-ghost" data-action="aggregate-sample">
            <i class="fas fa-magic"></i>
            ${sampleText}
          </button>
          <button type="button" class="btn-primary" data-action="aggregate-apply">
            <i class="fas fa-sync"></i>
            ${applyText}
          </button>
        </div>
        <div class="preview-aggregate-status muted" id="previewAggregateStatus">${statusText}</div>
      </div>
    `;
  }

  setupAggregatePreview(modal) {
    const panel = modal.querySelector('#previewAggregatePanel');
    if (!panel || !window.aggregateConfig) return;
    const toggle = panel.querySelector('#previewAggregateToggle');
    const textarea = panel.querySelector('#previewAggregateSources');
    const statusEl = panel.querySelector('#previewAggregateStatus');
    const sampleBtn = panel.querySelector('[data-action="aggregate-sample"]');
    const applyBtn = panel.querySelector('[data-action="aggregate-apply"]');
    const sampleTemplate = i18n.t('aggregate.sampleTemplate');

    const updateStatus = () => {
      const enabled = toggle ? toggle.checked : false;
      const value = textarea ? textarea.value : '';
      const desc = this.describeAggregateStatus(enabled, value);
      if (statusEl) {
        statusEl.textContent = desc;
        statusEl.classList.remove('success', 'error', 'muted');
        if (!enabled) {
          statusEl.classList.add('muted');
        } else {
          const parsed = this.parseAggregateSources(value);
          if (parsed.error) {
            statusEl.classList.add('error');
            if (textarea) textarea.classList.add('input-error');
          } else if (parsed.sources.length > 0) {
            statusEl.classList.add('success');
            if (textarea) textarea.classList.remove('input-error');
          } else {
            statusEl.classList.add('muted');
            if (textarea) textarea.classList.remove('input-error');
          }
        }
      }
      if (!enabled && textarea) {
        textarea.classList.remove('input-error');
      }
    };

    if (toggle) {
      toggle.addEventListener('change', () => {
        updateStatus();
      });
    }

    if (textarea) {
      textarea.addEventListener('input', () => {
        updateStatus();
      });
    }

    if (sampleBtn && textarea) {
      sampleBtn.addEventListener('click', () => {
        textarea.value = sampleTemplate;
        updateStatus();
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        if (!window.aggregateConfig || typeof window.aggregateConfig.apply !== 'function') {
          window.showToast?.(i18n.t('error.server.message'), 'warning');
          return;
        }
        const enabled = toggle ? toggle.checked : false;
        const rawSources = textarea ? textarea.value : '';
        const parsed = this.parseAggregateSources(rawSources);
        if (enabled && parsed.error) {
          updateStatus();
          window.showToast?.(parsed.error, 'warning');
          return;
        }
        const result = window.aggregateConfig.apply({ enabled, rawSources });
        if (result && result.error) {
          updateStatus();
          window.showToast?.(result.error, 'warning');
          return;
        }
        window.showToast?.(i18n.t('preview.aggregate.toastSuccess'), 'success');
        updateStatus();
      });
    }

    updateStatus();
  }

  parseAggregateSources(rawValue = '') {
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

    if (tokens.length > PREVIEW_MAX_EXTERNAL_SOURCES) {
      return { error: i18n.t('aggregate.errorTooMany', { count: PREVIEW_MAX_EXTERNAL_SOURCES }) };
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

  describeAggregateStatus(enabled, rawValue = '') {
    if (!enabled) {
      return i18n.t('aggregate.feedbackDisabled');
    }
    if (!rawValue.trim()) {
      return i18n.t('aggregate.feedbackEmpty');
    }
    const parsed = this.parseAggregateSources(rawValue);
    if (parsed.error) {
      return parsed.error;
    }
    return i18n.t('aggregate.feedbackCount', { count: parsed.sources.length });
  }

  computeStats() {
    const status = { watching: 0, finished: 0, notStarted: 0 };
    const weekMap = WEEK_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), { unknown: 0 });
    const todayKey = WEEK_KEYS[new Date().getDay()];
    let todayCount = 0;
    let recent7 = 0;
    let ratingSum = 0;
    let ratingCount = 0;

    this.animeData.forEach((anime) => {
      if (anime.statusType === 'watching') status.watching += 1;
      else if (['finished', 'completed'].includes(anime.statusType)) status.finished += 1;
      else status.notStarted += 1;

      const dayKey = anime.updateDayKey || 'unknown';
      if (weekMap[dayKey] !== undefined) weekMap[dayKey] += 1;
      if (dayKey === todayKey) todayCount += 1;

      if (anime.rawPubTime instanceof Date) {
        const diff = Date.now() - anime.rawPubTime.getTime();
        if (diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000) {
          recent7 += 1;
        }
      }

      if (typeof anime.ratingValue === 'number') {
        ratingSum += anime.ratingValue;
        ratingCount += 1;
      }
    });

    const weekMax = Math.max(...Object.values(weekMap));
    const avgRating = ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : null;

    return { status, weekMap, weekMax, todayCount, recent7, avgRating, ratingCount };
  }

  // 绑定筛选事件
  bindFilterEvents(modal) {
    const filterBtns = modal.querySelectorAll('.filter-btn');
    if (!filterBtns.length) return;
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        filterBtns.forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const filter = e.currentTarget.dataset.filter;
        const listContainer = modal.querySelector('#animeList');
        if (listContainer) {
          listContainer.innerHTML = this.renderAnimeList(filter);
        }
      });
    });
  }

  // 显示筛选器
  showFilter() {
    const filters = this.modalElement?.querySelector('#animeFilters');
    if (!filters) return;
    filters.style.display = filters.style.display === 'none' ? 'flex' : 'none';
  }

  // 切换排序
  toggleSort() {
    // 按更新时间排序
    this.animeData.reverse();
    const listContainer = this.modalElement?.querySelector('#animeList');
    if (listContainer) {
      listContainer.innerHTML = this.renderAnimeList();
    }
  }

  // 显示番剧详情
  showDetail(animeId) {
    const anime = this.animeData.find((a) => a.id == animeId);
    if (!anime) return;

    // 这里可以显示更详细的信息
    // Use window.showToast which will be exposed in main.js
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
    this.disableFocusTrap();
    this.modalElement = null;
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

export default animePreview;
