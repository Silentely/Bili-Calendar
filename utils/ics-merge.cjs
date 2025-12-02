// utils/ics-merge.cjs
// 多源 ICS 合并与冲突检测工具 (CommonJS)

const axios = require('axios');
const {
  parseBroadcastTime,
  parseNewEpTime,
  getNextBroadcastDate,
  formatDate,
  escapeICSText,
} = require('./time.cjs');

const DEFAULT_TZ = 'Asia/Shanghai';
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/**
 * 将番剧列表转换为通用事件对象
 * @param {Array} bangumis
 * @param {string} uid
 * @returns {Array<{uid:string,summary:string,description:string,start:Date,end:Date,isAllDay:boolean,source:string,url?:string,rrule?:string,rawStart?:string}>}
 */
function buildBangumiEvents(bangumis, _uid) {
  const nowIso = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';
  const events = [];

  for (const item of bangumis) {
    if (!item || !item.title || !item.season_id) continue;

    let info = parseBroadcastTime(item.pub_index);
    if (!info && item?.new_ep?.pub_time) {
      info = parseNewEpTime(item.new_ep.pub_time);
    }
    if (!info && item?.renewal_time) {
      info = parseBroadcastTime(item.renewal_time);
    }

    const titleWithSeason =
      item.season_title && !item.title.includes(item.season_title)
        ? `${item.title} ${item.season_title}`
        : item.title;

    let description = '';
    if (item.index_show) {
      description += `🌟 更新状态: ${item.index_show}`;
    } else if (item.new_ep?.index_show) {
      description += `🌟 更新状态: ${item.new_ep.index_show}`;
    }
    description += ` ➡️ 状态: ${item.is_finish === 0 ? '连载中' : '已完结'}`;
    description += ` ✨ 番剧简介: ${item.evaluate || '暂无简介'}`;

    if (!info) {
      // 时间未知：创建全天事件
      const start = new Date();
      events.push({
        uid: `${item.season_id}@bilibili.com`,
        summary: `[时间未知] ${titleWithSeason}`,
        description,
        start,
        end: new Date(start.getTime() + ONE_DAY_MS),
        isAllDay: true,
        source: 'bilibili',
        url: `https://www.bilibili.com/bangumi/play/ss${item.season_id}`,
        rawStart: start.toISOString().split('T')[0].replace(/-/g, ''),
        dtstamp: nowIso,
      });
      continue;
    }

    const firstDate = getNextBroadcastDate(info.dayOfWeek, info.time);
    const start = firstDate;
    const end = new Date(start.getTime() + ONE_HOUR_MS);

    events.push({
      uid: `${item.season_id}@bilibili.com`,
      summary: titleWithSeason,
      description,
      start,
      end,
      isAllDay: false,
      source: 'bilibili',
      url: `https://www.bilibili.com/bangumi/play/ss${item.season_id}`,
      rrule: item.is_finish === 0 ? `FREQ=WEEKLY;COUNT=2;BYDAY=${info.rruleDay}` : undefined,
      rawStart: formatDate(start),
      dtstamp: nowIso,
    });
  }

  return events;
}

/**
 * 解析 ICS 时间字符串
 * 支持：
 * - DTSTART;TZID=Asia/Shanghai:20250105T200000
 * - DTSTART:20250105T120000Z
 * - DTSTART;VALUE=DATE:20250105
 */
function parseIcsDateTime(raw, tzid = DEFAULT_TZ) {
  if (!raw) return null;

  // All-day
  if (/^\d{8}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return { date: new Date(`${y}-${m}-${d}T00:00:00${tzOffsetFor(tzid)}`), isAllDay: true };
  }

  // UTC
  if (/Z$/.test(raw)) {
    const base = raw.replace(/Z$/, '');
    const y = base.slice(0, 4);
    const m = base.slice(4, 6);
    const d = base.slice(6, 8);
    const hh = base.slice(9, 11) || '00';
    const mm = base.slice(11, 13) || '00';
    const ss = base.slice(13, 15) || '00';
    return { date: new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`), isAllDay: false };
  }

  // Floating or TZID
  if (/^\d{8}T\d{6}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    const hh = raw.slice(9, 11);
    const mm = raw.slice(11, 13);
    const ss = raw.slice(13, 15);
    return { date: new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}${tzOffsetFor(tzid)}`), isAllDay: false };
  }

  return null;
}

function tzOffsetFor(tzid) {
  // 仅处理默认时区，其他情况退化为本地偏移
  if (tzid === 'Asia/Shanghai' || tzid === 'Asia/Chongqing' || tzid === 'Asia/Harbin') {
    return '+08:00';
  }
  const offsetMinutes = new Date().getTimezoneOffset();
  const hours = Math.abs(Math.floor(offsetMinutes / 60))
    .toString()
    .padStart(2, '0');
  const mins = Math.abs(offsetMinutes % 60)
    .toString()
    .padStart(2, '0');
  return `${offsetMinutes <= 0 ? '+' : '-'}${hours}:${mins}`;
}

/**
 * 从 ICS 文本解析事件
 * @param {string} icsText
 * @param {string} sourceLabel
 */
function parseIcsEvents(icsText, sourceLabel) {
  const lines = icsText.split(/\r?\n/);
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = {};
    } else if (line.startsWith('END:VEVENT')) {
      if (current && current.start) {
        events.push(current);
      }
      current = null;
    } else if (current) {
      if (line.startsWith('SUMMARY:')) current.summary = line.replace('SUMMARY:', '').trim();
      else if (line.startsWith('DESCRIPTION:')) current.description = line.replace('DESCRIPTION:', '').trim();
      else if (line.startsWith('UID:')) current.uid = line.replace('UID:', '').trim();
      else if (line.startsWith('URL')) {
        const idx = line.indexOf(':');
        current.url = line.slice(idx + 1).trim();
      } else if (line.startsWith('RRULE')) {
        const idx = line.indexOf(':');
        current.rrule = line.slice(idx + 1).trim();
      } else if (line.startsWith('DTSTART')) {
        const [prefix, value] = line.split(':');
        const tzMatch = prefix.match(/TZID=([^;]+)/);
        const raw = value.trim();
        const parsed = parseIcsDateTime(raw, tzMatch ? tzMatch[1] : DEFAULT_TZ);
        if (parsed) {
          current.start = parsed.date;
          current.isAllDay = parsed.isAllDay;
          current.rawStart = raw;
        }
      } else if (line.startsWith('DTEND')) {
        const [prefix, value] = line.split(':');
        const tzMatch = prefix.match(/TZID=([^;]+)/);
        const raw = value.trim();
        const parsed = parseIcsDateTime(raw, tzMatch ? tzMatch[1] : DEFAULT_TZ);
        if (parsed) {
          current.end = parsed.date;
        }
      }
    }
  }

  return events.map((ev, idx) => {
    const duration = ev.end && ev.start ? ev.end.getTime() - ev.start.getTime() : ONE_HOUR_MS;
    return {
      uid: ev.uid || `${sourceLabel}-${idx}@merged.local`,
      summary: ev.summary || '未命名事件',
      description: ev.description || '',
      start: ev.start,
      end: ev.end || new Date(ev.start.getTime() + duration),
      isAllDay: ev.isAllDay || false,
      source: sourceLabel,
      url: ev.url,
      rawStart: ev.rawStart,
      rrule: ev.rrule,
      baseUid: ev.uid || `${sourceLabel}-${idx}@merged.local`,
    };
  });
}

/**
 * 检测事件冲突并返回映射
 * @param {Array} events
 * @returns {Map<string, Set<string>>}
 */
function detectConflicts(events) {
  const conflicts = new Map();
  const expanded = expandRecurring(events);
  const sorted = expanded.sort((a, b) => a.start.getTime() - b.start.getTime());
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a.end <= b.start) break; // 已按时间排序，可提前终止
      if (isOverlap(a, b)) {
        const au = a.baseUid || a.uid;
        const bu = b.baseUid || b.uid;
        if (!conflicts.has(au)) conflicts.set(au, new Set());
        if (!conflicts.has(bu)) conflicts.set(bu, new Set());
        conflicts.get(au).add(b.summary);
        conflicts.get(bu).add(a.summary);
      }
    }
  }
  return conflicts;
}

function expandRecurring(events) {
  const out = [];
  events.forEach((ev) => {
    out.push(ev);
    if (ev.rrule && /FREQ=WEEKLY/i.test(ev.rrule) && ev.start && ev.end) {
      const delta = 7 * ONE_DAY_MS;
      out.push({
        ...ev,
        start: new Date(ev.start.getTime() + delta),
        end: new Date(ev.end.getTime() + delta),
        uid: `${ev.uid}#r1`,
      });
    }
  });
  return out;
}

function isOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function formatDateTime(dt, isAllDay) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = dt.getFullYear();
  const m = pad(dt.getMonth() + 1);
  const d = pad(dt.getDate());
  if (isAllDay) return `${y}${m}${d}`;
  const hh = pad(dt.getHours());
  const mm = pad(dt.getMinutes());
  const ss = pad(dt.getSeconds());
  return `${y}${m}${d}T${hh}${mm}${ss}`;
}

function buildICSFromEvents(events, { uid, title }) {
  const VTIMEZONE_DEFINITION = `BEGIN:VTIMEZONE
TZID:${DEFAULT_TZ}
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0800
TZOFFSETTO:+0800
TZNAME:CST
END:STANDARD
END:VTIMEZONE`;

  const now = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bili-Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${title || `B站追番聚合 (UID: ${uid})`}`,
    `X-WR-TIMEZONE:${DEFAULT_TZ}`,
    VTIMEZONE_DEFINITION,
  ];

  const conflictMap = detectConflicts(events);

  for (const ev of events) {
    const evLines = ['BEGIN:VEVENT'];
    evLines.push(`UID:${ev.uid}`);
    evLines.push(`DTSTAMP:${ev.dtstamp || now}`);
    if (ev.rawStart && !ev.isAllDay) {
      evLines.push(`DTSTART;TZID=${DEFAULT_TZ}:${ev.rawStart}`);
    } else if (ev.rawStart && ev.isAllDay) {
      evLines.push(`DTSTART;VALUE=DATE:${ev.rawStart}`);
    } else {
      const formatted = formatDateTime(ev.start, ev.isAllDay);
      if (ev.isAllDay) evLines.push(`DTSTART;VALUE=DATE:${formatted}`);
      else evLines.push(`DTSTART;TZID=${DEFAULT_TZ}:${formatted}`);
    }

    if (ev.end) {
      const formattedEnd = formatDateTime(ev.end, ev.isAllDay);
      if (ev.isAllDay) evLines.push(`DTEND;VALUE=DATE:${formattedEnd}`);
      else evLines.push(`DTEND;TZID=${DEFAULT_TZ}:${formattedEnd}`);
    }

    if (ev.rrule) evLines.push(`RRULE:${ev.rrule}`);

    let desc = ev.description || '';
    if (conflictMap.has(ev.uid)) {
      const conflictList = Array.from(conflictMap.get(ev.uid)).join(', ');
      desc += `\n⚠️ 与 ${conflictList} 时间重叠`;
    }

    evLines.push(`SUMMARY:${escapeICSText(ev.summary)}`);
    if (desc) evLines.push(`DESCRIPTION:${escapeICSText(desc)}`);
    if (ev.url) evLines.push(`URL;VALUE=URI:${ev.url}`);
    evLines.push(`X-BC-SOURCE:${ev.source}`);
    evLines.push('END:VEVENT');
    lines.push(...evLines);
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * 聚合番剧 + 外部 ICS 并返回 ICS 文本
 * @param {Array} bangumis
 * @param {string} uid
 * @param {Array<{url:string,ics:string}>} externalCalendars
 */
function generateMergedICS(bangumis, uid, externalCalendars = []) {
  const events = buildBangumiEvents(bangumis, uid);

  for (const calendar of externalCalendars) {
    try {
      const parsed = parseIcsEvents(calendar.ics, calendar.url || 'external');
      parsed.forEach((ev) => events.push(ev));
    } catch (err) {
      console.warn(`⚠️ 解析外部 ICS 失败: ${calendar.url} - ${err.message}`);
    }
  }

  if (events.length === 0) return null;

  return buildICSFromEvents(events, {
    uid,
    title: `B站追番聚合 (UID: ${uid}, 外部源 ${externalCalendars.length} 个)`,
  });
}

async function fetchExternalICS(urls = []) {
  if (!Array.isArray(urls) || urls.length === 0) return [];

  const tasks = urls.map((url) =>
    axios
      .get(url, { timeout: 8000, responseType: 'text' })
      .then((res) => {
        if (typeof res.data === 'string') {
          return { url, ics: res.data };
        }
        console.warn(`⚠️ 外部 ICS 响应非文本: ${url}`);
        return null;
      })
      .catch((err) => {
        console.warn(`⚠️ 获取外部 ICS 失败: ${url} - ${err.message}`);
        return null;
      })
  );

  const settled = await Promise.all(tasks);
  return settled.filter(Boolean);
}

module.exports = {
  buildBangumiEvents,
  parseIcsEvents,
  detectConflicts,
  generateMergedICS,
  fetchExternalICS,
};
