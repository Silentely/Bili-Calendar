// @ts-check
/**
 * 本地通知/提醒工具模块
 * 提供浏览器原生通知功能，支持番剧更新提醒
 */

/**
 * 默认提前提醒时间（分钟）
 * @type {number}
 */
const DEFAULT_LEAD_MINUTES = 5;

/**
 * 存储定时器 ID 的数组
 * @type {NodeJS.Timeout[]}
 */
let timers = [];

/**
 * 清除所有已安排的定时器
 * 用于取消所有待触发的通知提醒
 *
 * @returns {void}
 *
 * @example
 * import notifier from './services/notifier.js'
 *
 * // 取消所有提醒
 * notifier.clearTimers()
 */
function clearTimers() {
  timers.forEach((id) => clearTimeout(id));
  timers = [];
}

/**
 * 检查浏览器是否支持通知 API
 * 验证 Notification API 和 navigator 对象是否可用
 *
 * @returns {boolean} 支持返回 true，否则返回 false
 *
 * @example
 * import notifier from './services/notifier.js'
 *
 * if (notifier.hasSupport()) {
 *   console.log('浏览器支持通知')
 * } else {
 *   console.log('浏览器不支持通知')
 * }
 */
function hasSupport() {
  return typeof Notification !== 'undefined' && typeof navigator !== 'undefined';
}

/**
 * 确保获得通知权限
 * 如果未授权则请求用户授权
 *
 * @returns {Promise<boolean>} 获得权限返回 true，被拒绝或不支持返回 false
 *
 * @example
 * import notifier from './services/notifier.js'
 *
 * const permitted = await notifier.ensurePermission()
 * if (permitted) {
 *   console.log('已获得通知权限')
 * } else {
 *   console.log('未获得通知权限')
 * }
 */
async function ensurePermission() {
  if (!hasSupport()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const res = await Notification.requestPermission();
  return res === 'granted';
}

/**
 * 显示浏览器通知
 * 优先使用 Service Worker 显示持久通知，降级使用普通通知
 *
 * @param {string} title - 通知标题
 * @param {string} body - 通知内容
 * @returns {Promise<boolean>} 成功显示返回 true，失败返回 false
 *
 * @example
 * import notifier from './services/notifier.js'
 *
 * const success = await notifier.showNotification(
 *   '番剧更新',
 *   '《测试番剧》第1话已更新'
 * )
 */
async function showNotification(title, body) {
  if (!hasSupport()) return false;
  const ok = await ensurePermission();
  if (!ok) return false;

  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        tag: 'bili-calendar-reminder',
        renotify: true,
      });
      return true;
    }
    // Fallback
    new Notification(title, { body });
    return true;
  } catch (err) {
    console.warn('通知展示失败:', err);
    return false;
  }
}


/**
 * 番剧提醒选项
 * @typedef {Object} ReminderOptions
 * @property {number} [leadMinutes] - 提前几分钟提醒，默认5分钟
 */

/**
 * 番剧数据结构
 * @typedef {Object} AnimeData
 * @property {string} title - 番剧标题
 * @property {Date} rawPubTime - 播出时间
 * @property {string} [pub_index] - 播出信息
 * @property {number} [season_id] - 番剧 ID
 */

/**
 * 提醒安排结果
 * @typedef {Object} ScheduleResult
 * @property {number} scheduled - 成功安排的提醒数量
 * @property {boolean} denied - 是否被拒绝权限
 */

/**
 * 依据番剧数据安排未来 24 小时内的提醒
 * 自动计算下次播出时间并安排提醒通知（最多5条）
 *
 * @param {AnimeData[]} [animeList=[]] - 番剧数据列表，来自 AnimePreview
 * @param {ReminderOptions} [options={}] - 提醒选项
 * @returns {Promise<ScheduleResult>} 返回安排结果
 *
 * @example
 * import notifier from './services/notifier.js'
 *
 * const animeList = [
 *   {
 *     title: '测试番剧',
 *     rawPubTime: new Date('2025-12-12T12:00:00'),
 *     pub_index: '每周六 12:00'
 *   }
 * ]
 *
 * const result = await notifier.scheduleAnimeReminders(animeList, {
 *   leadMinutes: 10
 * })
 *
 * console.log(`已安排 ${result.scheduled} 条提醒`)
 */
async function scheduleAnimeReminders(animeList = [], options = {}) {
  const leadMinutes = options.leadMinutes || DEFAULT_LEAD_MINUTES;
  clearTimers();

  if (!hasSupport()) return { scheduled: 0, denied: true };
  const permitted = await ensurePermission();
  if (!permitted) return { scheduled: 0, denied: true };

  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const candidate = [];

  // 动态导入 i18n（避免在测试环境加载时出错）
  const { default: i18n } = await import('./i18n.js');

  animeList.forEach((anime) => {
    if (!(anime.rawPubTime instanceof Date)) return;
    const next = new Date(anime.rawPubTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    const triggerAt = next.getTime() - leadMinutes * 60 * 1000;
    if (triggerAt > now && triggerAt - now <= oneDay) {
      candidate.push({ anime, triggerAt, next });
    }
  });

  candidate.sort((a, b) => a.triggerAt - b.triggerAt);
  const top = candidate.slice(0, 5); // 控制最多 5 条，避免滥用

  top.forEach((item) => {
    const delay = item.triggerAt - now;
    const id = setTimeout(() => {
      showNotification(
        i18n.t('notification.animeUpdateSoon'),
        i18n.t('notification.animeWillUpdate', { title: item.anime.title, minutes: leadMinutes })
      );
    }, delay);
    timers.push(id);
  });

  return { scheduled: top.length, denied: false };
}

export default {
  scheduleAnimeReminders,
  clearTimers,
  hasSupport,
  ensurePermission,
};
