// @ts-check
/**
 * 番剧预览数据格式化（从 AnimePreview 拆出，便于单测与复用）
 */

import i18n from '../../services/i18n.js';

export const STATUS_COLORS = {
  watching: '#00a1d6',
  finished: '#999999',
  completed: '#4caf50',
  'not-started': '#ff9800',
};

export const WEEK_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * @typedef {'watching'|'finished'|'completed'|'not-started'} AnimeStatusType
 * @typedef {{id: string, title: string, cover: string, season: string, episodes: string|number, currentEpisode: string|number, statusType: AnimeStatusType, statusColor: string, updateTime: string, rating: string, ratingValue: number|null, url: string, isFinished: boolean, updateDayKey: string, nextEpisodeTime: string|null, rawPubTime: Date|null}} PreviewAnime
 */

/**
 * @param {any} anime
 * @returns {AnimeStatusType}
 */
export function getAnimeStatusType(anime) {
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

/**
 * @param {any} anime
 * @returns {string}
 */
export function formatUpdateTime(anime) {
  if (!anime.new_ep || !anime.new_ep.pub_time) {
    return i18n.t('preview.update.none');
  }

  const date = new Date(anime.new_ep.pub_time);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return hours > 0
      ? i18n.t('preview.update.hoursAgo', { count: hours })
      : i18n.t('preview.update.justNow');
  }
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return i18n.t('preview.update.daysAgo', { count: days });
  }
  return date.toLocaleDateString(i18n.getLanguage());
}

/**
 * @param {any} anime
 * @returns {string}
 */
export function getUpdateDayKey(anime) {
  if (anime.is_finish === 1) return 'unknown';

  if (anime.new_ep && anime.new_ep.pub_time) {
    const date = new Date(anime.new_ep.pub_time);
    const dayIndex = date.getDay();
    return WEEK_KEYS[dayIndex] || 'unknown';
  }

  return 'unknown';
}

/**
 * @param {any} anime
 * @returns {string|null}
 */
export function getNextEpisodeTime(anime) {
  if (anime.is_finish === 1) return null;

  if (anime.new_ep && anime.new_ep.pub_time) {
    const lastUpdate = new Date(anime.new_ep.pub_time);
    const nextUpdate = new Date(lastUpdate);
    nextUpdate.setDate(nextUpdate.getDate() + 7);

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

/**
 * @param {string} cover
 * @returns {string}
 */
export function normalizeCoverUrl(cover) {
  let coverUrl = cover || '';
  if (coverUrl && !coverUrl.startsWith('http')) {
    coverUrl = 'https:' + coverUrl;
  }
  if (coverUrl) {
    coverUrl = coverUrl.replace('http://', 'https://');
    if (!coverUrl.includes('@')) {
      coverUrl += '@320w_200h.webp';
    }
  }
  return coverUrl;
}

/**
 * @param {any} rawData
 * @returns {PreviewAnime[]}
 */
export function formatAnimeData(rawData) {
  if (!rawData || !rawData.data) return [];

  const animeList = /** @type {any[]} */ (rawData.data.list || rawData.data || []);

  return animeList.map((anime) => {
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

    const statusType = getAnimeStatusType(anime);

    return {
      id: String(anime.media_id || anime.season_id || ''),
      title: anime.title || i18n.t('preview.meta.unknownAnime'),
      cover: normalizeCoverUrl(anime.cover || ''),
      season: anime.season_title || anime.title || i18n.t('preview.meta.unknownSeason'),
      episodes: anime.total_count || anime.new_ep?.index || i18n.t('preview.meta.unknownEpisode'),
      currentEpisode: anime.progress || anime.new_ep?.index_show || 0,
      statusType,
      statusColor: STATUS_COLORS[statusType] || STATUS_COLORS.watching,
      updateTime: formatUpdateTime(anime),
      rating,
      ratingValue,
      url: `https://www.bilibili.com/bangumi/media/md${anime.media_id}`,
      isFinished: anime.is_finish === 1,
      updateDayKey: getUpdateDayKey(anime),
      nextEpisodeTime: getNextEpisodeTime(anime),
      rawPubTime: anime.new_ep?.pub_time ? new Date(anime.new_ep.pub_time) : null,
    };
  });
}
