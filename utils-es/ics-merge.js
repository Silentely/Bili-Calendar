// @ts-nocheck
// utils-es/ics-merge.js
// 多源 ICS 合并与冲突检测工具（ESM 版本）

import axios from 'axios';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isPrivateIPAddress } from './security.js';
import {
  parseBroadcastTime,
  parseNewEpTime,
  getNextBroadcastDate,
  formatDate,
  escapeICSText,
} from './time.js';

const DEFAULT_TZ = 'Asia/Shanghai';
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const safeLookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  dns.lookup(hostname, options, (err, address, family) => {
    if (err) {
      callback(err, address, family);
      return;
    }

    const addresses = Array.isArray(address) ? address : [{ address, family }];
    for (const addr of addresses) {
      if (isPrivateIPAddress(addr.address)) {
        const ssrfError = new Error(
          `SSRF attempt blocked: request to private IP ${addr.address} for hostname ${hostname}`
        );
        ssrfError.code = 'ERR_SSRF_BLOCKED';
        callback(ssrfError);
        return;
      }
    }

    callback(null, address, family);
  });
};

const httpAgent = new http.Agent({ lookup: safeLookup, keepAlive: true });
const httpsAgent = new https.Agent({ lookup: safeLookup, keepAlive: true });

export function buildBangumiEvents(bangumis, _uid) {
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
    description += `\n➡️ 状态: ${item.is_finish === 0 ? '连载中' : '已完结'}`;
    description += `\n✨ 番剧简介: ${item.evaluate || '暂无简介'}`;

    if (!info) {
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
    events.push({
      uid: `${item.season_id}@bilibili.com`,
      summary: titleWithSeason,
      description,
      start: firstDate,
      end: new Date(firstDate.getTime() + ONE_HOUR_MS),
      isAllDay: false,
      source: 'bilibili',
      url: `https://www.bilibili.com/bangumi/play/ss${item.season_id}`,
      rrule: item.is_finish === 0 ? `FREQ=WEEKLY;COUNT=2;BYDAY=${info.rruleDay}` : undefined,
      rawStart: formatDate(firstDate),
      dtstamp: nowIso,
    });
  }

  return events;
}

function parseIcsDateTime(raw, tzid = DEFAULT_TZ) {
  if (!raw) return null;

  if (/^\d{8}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return { date: new Date(`${y}-${m}-${d}T00:00:00${tzOffsetFor(tzid)}`), isAllDay: true };
  }

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

  if (/^\d{8}T\d{6}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    const hh = raw.slice(9, 11);
    const mm = raw.slice(11, 13);
    const ss = raw.slice(13, 15);
    return {
      date: new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}${tzOffsetFor(tzid)}`),
      isAllDay: false,
    };
  }

  return null;
}

function tzOffsetFor(tzid) {
  if (tzid === 'Asia/Shanghai' || tzid === 'Asia/Chongqing' || tzid === 'Asia/Harbin') {
    return '+08:00';
  }
  try {
    const date = new Date();
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: tzid }));
    const offsetMs = tzDate.getTime() - utcDate.getTime();
    const offsetMinutes = offsetMs / 60000;
    const hours = Math.abs(Math.floor(offsetMinutes / 60))
      .toString()
      .padStart(2, '0');
    const mins = Math.abs(offsetMinutes % 60)
      .toString()
      .padStart(2, '0');
    return `${offsetMinutes >= 0 ? '+' : '-'}${hours}:${mins}`;
  } catch {
    return '+08:00';
  }
}

export function parseIcsEvents(icsText, sourceLabel) {
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
      else if (line.startsWith('DESCRIPTION:'))
        current.description = line.replace('DESCRIPTION:', '').trim();
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
        const parsed = parseIcsDateTime(value.trim(), tzMatch ? tzMatch[1] : DEFAULT_TZ);
        if (parsed) {
          current.start = parsed.date;
          current.isAllDay = parsed.isAllDay;
          current.rawStart = value.trim();
          current.tzid = tzMatch ? tzMatch[1] : null;
        }
      } else if (line.startsWith('DTEND')) {
        const [prefix, value] = line.split(':');
        const tzMatch = prefix.match(/TZID=([^;]+)/);
        const parsed = parseIcsDateTime(value.trim(), tzMatch ? tzMatch[1] : DEFAULT_TZ);
        if (parsed) {
          current.end = parsed.date;
          current.rawEnd = value.trim();
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
      rawEnd: ev.rawEnd,
      tzid: ev.tzid,
      rrule: ev.rrule,
      baseUid: ev.uid || `${sourceLabel}-${idx}@merged.local`,
    };
  });
}

export function detectConflicts(events) {
  const conflicts = new Map();
  const sorted = expandRecurring(events).sort((a, b) => a.start.getTime() - b.start.getTime());

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (a.end <= b.start) break;
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
  const vtimezoneDefinition = `BEGIN:VTIMEZONE
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
    vtimezoneDefinition,
  ];

  const conflictMap = detectConflicts(events);

  for (const ev of events) {
    const evLines = ['BEGIN:VEVENT'];
    evLines.push(`UID:${ev.uid}`);
    evLines.push(`DTSTAMP:${ev.dtstamp || now}`);
    const tzid = ev.tzid || DEFAULT_TZ;
    if (ev.rawStart && !ev.isAllDay) {
      evLines.push(`DTSTART;TZID=${tzid}:${ev.rawStart}`);
    } else if (ev.rawStart && ev.isAllDay) {
      evLines.push(`DTSTART;VALUE=DATE:${ev.rawStart}`);
    } else {
      const formatted = formatDateTime(ev.start, ev.isAllDay);
      evLines.push(
        ev.isAllDay ? `DTSTART;VALUE=DATE:${formatted}` : `DTSTART;TZID=${tzid}:${formatted}`
      );
    }

    if (ev.end) {
      if (ev.rawEnd && !ev.isAllDay) {
        evLines.push(`DTEND;TZID=${tzid}:${ev.rawEnd}`);
      } else if (ev.rawEnd && ev.isAllDay) {
        evLines.push(`DTEND;VALUE=DATE:${ev.rawEnd}`);
      } else {
        const formattedEnd = formatDateTime(ev.end, ev.isAllDay);
        evLines.push(
          ev.isAllDay ? `DTEND;VALUE=DATE:${formattedEnd}` : `DTEND;TZID=${tzid}:${formattedEnd}`
        );
      }
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

export function generateMergedICS(bangumis, uid, externalCalendars = []) {
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

export async function fetchExternalICS(urls = []) {
  if (!Array.isArray(urls) || urls.length === 0) return [];

  const tasks = urls.map((url) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      console.warn(`⚠️ 跳过无效的URL: ${url}`);
      return Promise.resolve(null);
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      console.warn(`⚠️ 跳过不支持的协议: ${url}`);
      return Promise.resolve(null);
    }

    if (isPrivateIPAddress(parsed.hostname)) {
      console.warn(`🚫 [SSRF] 阻止访问私有地址: ${url}`);
      return Promise.resolve(null);
    }

    return axios
      .get(url, { timeout: 8000, responseType: 'text', httpAgent, httpsAgent })
      .then((res) => {
        if (typeof res.data === 'string') {
          return { url, ics: res.data };
        }
        console.warn(`⚠️ 外部 ICS 响应非文本: ${url}`);
        return null;
      })
      .catch((err) => {
        if (err.code === 'ERR_SSRF_BLOCKED') {
          console.warn(`🚫 [SSRF] Blocked request to ${url}: ${err.message}`);
        } else {
          console.warn(`⚠️ 获取外部 ICS 失败: ${url} - ${err.message}`);
        }
        return null;
      });
  });

  const settled = await Promise.all(tasks);
  return settled.filter(Boolean);
}
