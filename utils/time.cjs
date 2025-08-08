// utils/time.cjs
// 时间解析与格式化相关的通用工具（CommonJS 版本）

function parseBroadcastTime(pubIndex) {
  if (!pubIndex) return null;

  const dayMap = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  const rruleMap = { 日: 'SU', 一: 'MO', 二: 'TU', 三: 'WE', 四: 'TH', 五: 'FR', 六: 'SA' };

  const patterns = [
    /(?:(?:每周|周)([日一二三四五六]))?.*?(\d{1,2}:\d{2})/,
    /([日一二三四五六]).*?(\d{1,2}:\d{2})/,
    /(\d{1,2}:\d{2})/,
    /(?:.*?日起)?([日一二三四五六])?.*?(\d{1,2}:\d{2})/,
    /(?:.*?起)?([日一二三四五六])?.*?(\d{1,2}:\d{2})/,
  ];

  for (const pattern of patterns) {
    const match = pubIndex.match(pattern);
    if (match) {
      const dayChar = match[1] || '一';
      const time = match[2];
      if (dayChar in dayMap) {
        return { dayOfWeek: dayMap[dayChar], time: time, rruleDay: rruleMap[dayChar] };
      } else if (time.match(/\d{1,2}:\d{2}/)) {
        return { dayOfWeek: 1, time: time, rruleDay: 'MO' };
      }
    }
  }
  return null;
}

function parseNewEpTime(pubTime) {
  if (!pubTime) return null;
  const dayMap = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  const rruleMap = { 日: 'SU', 一: 'MO', 二: 'TU', 三: 'WE', 四: 'TH', 五: 'FR', 六: 'SA' };

  const dateTimePattern = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/;
  const dateTimeMatch = pubTime.match(dateTimePattern);
  if (dateTimeMatch) {
    const dateStr = dateTimeMatch[1];
    const timeStr = dateTimeMatch[2].substring(0, 5);
    const date = new Date(dateStr + 'T' + timeStr + ':00+08:00');
    const dayOfWeek = date.getUTCDay();
    const rruleDay = rruleMap[Object.keys(dayMap)[dayOfWeek]];
    return { dayOfWeek, time: timeStr, rruleDay };
  }

  const pattern = /(?:.*?日起)?([日一二三四五六])?.*?(\d{1,2}:\d{2})/;
  const match = pubTime.match(pattern);
  if (match) {
    const dayChar = match[1] || '一';
    const time = match[2];
    if (dayChar in dayMap) {
      return { dayOfWeek: dayMap[dayChar], time, rruleDay: rruleMap[dayChar] };
    } else if (time.match(/\d{1,2}:\d{2}/)) {
      return { dayOfWeek: 1, time, rruleDay: 'MO' };
    }
  }
  return null;
}

function getNextBroadcastDate(targetDay, timeStr) {
  const now = new Date();
  const [hh, mm] = timeStr.split(':').map(Number);
  const utcOffset = 8 * 60;
  const nowInShanghai = new Date(now.getTime() + utcOffset * 60 * 1000);
  const today = nowInShanghai.getUTCDay();
  let diff = (targetDay - today + 7) % 7;
  if (diff === 0) {
    const currH = nowInShanghai.getUTCHours();
    const currM = nowInShanghai.getUTCMinutes();
    if (currH > hh || (currH === hh && currM >= mm)) {
      diff = 7;
    }
  }
  const nextDate = new Date(nowInShanghai);
  nextDate.setUTCDate(nextDate.getUTCDate() + diff);
  nextDate.setUTCHours(hh, mm, 0, 0);
  return nextDate;
}

function formatDate(date) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;
}

function escapeICSText(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

module.exports = {
  parseBroadcastTime,
  parseNewEpTime,
  getNextBroadcastDate,
  formatDate,
  escapeICSText,
};
