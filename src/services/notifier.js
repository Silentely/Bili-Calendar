// notifier.js - 本地通知/提醒工具（浏览器权限内）

const DEFAULT_LEAD_MINUTES = 5;

let timers = [];

function clearTimers() {
  timers.forEach((id) => clearTimeout(id));
  timers = [];
}

function hasSupport() {
  return typeof Notification !== 'undefined' && typeof navigator !== 'undefined';
}

async function ensurePermission() {
  if (!hasSupport()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const res = await Notification.requestPermission();
  return res === 'granted';
}

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
 * 依据番剧数据安排未来 24h 内的提醒
 * @param {Array} animeList 来自 AnimePreview 的数据
 * @param {object} options
 * @param {number} options.leadMinutes 提前几分钟提醒
 * @returns {Promise<{scheduled:number, denied:boolean}>}
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
      showNotification('番剧即将更新', `${item.anime.title} 将在 ${leadMinutes} 分钟后更新`);
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
