// @ts-nocheck
// utils-es/ics.js
// 生成与响应 ICS 的通用工具（ES6 模块版本）
import {
  parseBroadcastTime,
  parseNewEpTime,
  getNextBroadcastDate,
  formatDate,
  escapeICSText,
} from './time.js';

/** 连载番剧默认重复周数（约一年），避免 COUNT=2 过短 */
export const DEFAULT_AIRING_RRULE_COUNT = 52;
/** 默认事件时长（分钟） */
export const DEFAULT_EVENT_DURATION_MINUTES = 30;
/** 默认提前提醒（分钟） */
export const DEFAULT_ALARM_LEAD_MINUTES = 15;
/** ICS 响应默认缓存秒数 */
export const ICS_CACHE_MAX_AGE_SECONDS = 3600;

const VTIMEZONE_DEFINITION = `BEGIN:VTIMEZONE
TZID:Asia/Shanghai
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0800
TZOFFSETTO:+0800
TZNAME:CST
END:STANDARD
END:VTIMEZONE`;

/**
 * @param {any} item
 * @returns {string}
 */
function buildTitle(item) {
  if (item.season_title && !item.title.includes(item.season_title)) {
    return `${item.title} ${item.season_title}`;
  }
  return item.title;
}

/**
 * @param {any} item
 * @returns {string}
 */
function buildDescription(item) {
  let description = '';
  if (item.index_show) {
    description += `🌟 更新状态: ${item.index_show}`;
  } else if (item.new_ep?.index_show) {
    description += `🌟 更新状态: ${item.new_ep.index_show}`;
  }
  description += `\n➡️ 状态: ${item.is_finish === 0 ? '连载中' : '已完结'}`;
  description += `\n✨ 番剧简介: ${item.evaluate || '暂无简介'}`;
  return description;
}

/**
 * @param {any} item
 * @returns {{dayOfWeek: number, time: string, rruleDay: string}|null}
 */
function resolveBroadcastInfo(item) {
  let info = parseBroadcastTime(item.pub_index);
  if (!info && item?.new_ep?.pub_time) {
    info = parseNewEpTime(item.new_ep.pub_time);
  }
  if (!info && item?.renewal_time) {
    info = parseBroadcastTime(item.renewal_time);
  }
  return info;
}

/**
 * @param {Date} start
 * @param {number} durationMinutes
 * @returns {Date}
 */
function addMinutes(start, durationMinutes) {
  return new Date(start.getTime() + durationMinutes * 60 * 1000);
}

/**
 * 生成 VALARM 块
 * @param {number} [leadMinutes=DEFAULT_ALARM_LEAD_MINUTES]
 * @returns {string[]}
 */
export function buildValarmLines(leadMinutes = DEFAULT_ALARM_LEAD_MINUTES) {
  const minutes = Math.max(1, Number(leadMinutes) || DEFAULT_ALARM_LEAD_MINUTES);
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:番剧更新提醒`,
    `TRIGGER:-PT${minutes}M`,
    'END:VALARM',
  ];
}

/**
 * 生成连载 RRULE
 * @param {string} rruleDay
 * @param {number} [count=DEFAULT_AIRING_RRULE_COUNT]
 * @returns {string}
 */
export function buildAiringRrule(rruleDay, count = DEFAULT_AIRING_RRULE_COUNT) {
  const safeCount = Math.max(1, Number(count) || DEFAULT_AIRING_RRULE_COUNT);
  return `FREQ=WEEKLY;COUNT=${safeCount};BYDAY=${rruleDay}`;
}

export function generateICS(bangumis, uid, options = {}) {
  const alarmMinutes = options.alarmMinutes ?? DEFAULT_ALARM_LEAD_MINUTES;
  const rruleCount = options.rruleCount ?? DEFAULT_AIRING_RRULE_COUNT;
  const durationMinutes = options.durationMinutes ?? DEFAULT_EVENT_DURATION_MINUTES;
  const includeAlarm = options.includeAlarm !== false;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BiliCalendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:B站追番 (UID: ${uid})`,
    'X-WR-TIMEZONE:Asia/Shanghai',
    VTIMEZONE_DEFINITION,
  ];

  const now = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';

  for (const item of bangumis) {
    if (!item || !item.title || !item.season_id) continue;

    const info = resolveBroadcastInfo(item);
    const titleWithSeason = buildTitle(item);
    const description = buildDescription(item);

    if (!info) {
      const defaultDate = new Date();
      lines.push(
        'BEGIN:VEVENT',
        `UID:${item.season_id}@bilibili.com`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${defaultDate.toISOString().split('T')[0].replace(/-/g, '')}`,
        `SUMMARY:${escapeICSText('[时间未知] ' + titleWithSeason)}`,
        `DESCRIPTION:${escapeICSText(description)}`,
        `URL;VALUE=URI:https://www.bilibili.com/bangumi/play/ss${item.season_id}`,
        'END:VEVENT'
      );
      continue;
    }

    const firstDate = getNextBroadcastDate(info.dayOfWeek, info.time);
    const endDate = addMinutes(firstDate, durationMinutes);
    const dtstart = formatDate(firstDate);
    const dtend = formatDate(endDate);

    const eventLines = [
      'BEGIN:VEVENT',
      `UID:${item.season_id}@bilibili.com`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=Asia/Shanghai:${dtstart}`,
      `DTEND;TZID=Asia/Shanghai:${dtend}`,
    ];

    if (item.is_finish === 0) {
      eventLines.push(`RRULE:${buildAiringRrule(info.rruleDay, rruleCount)}`);
    }

    eventLines.push(
      `SUMMARY:${escapeICSText(titleWithSeason)}`,
      `DESCRIPTION:${escapeICSText(description)}`,
      `URL;VALUE=URI:https://www.bilibili.com/bangumi/play/ss${item.season_id}`
    );

    if (includeAlarm) {
      eventLines.push(...buildValarmLines(alarmMinutes));
    }

    eventLines.push('END:VEVENT');
    lines.push(...eventLines);
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * @param {import('express').Response} res
 * @param {string} content
 * @param {string|number} uid
 * @param {{maxAgeSeconds?: number}} [options]
 */
export function respondWithICS(res, content, uid, options = {}) {
  const maxAge = options.maxAgeSeconds ?? ICS_CACHE_MAX_AGE_SECONDS;
  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="bili_bangumi_${uid}.ics"`,
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    'CDN-Cache-Control': `public, max-age=${maxAge}`,
  });
  res.send(content);
}

export function respondWithEmptyCalendar(res, uid, reason) {
  const now = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BiliCalendarGenerator//CFW//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:B站追番（无内容）',
    'X-WR-TIMEZONE:Asia/Shanghai',
    'BEGIN:VEVENT',
    'UID:error-' + uid + '@bilibili.com',
    'DTSTAMP:' + now,
    'DTSTART;VALUE=DATE:' + date,
    'SUMMARY:无法获取番剧信息：' + (reason || '未知'),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="bili_bangumi_${uid}_empty.ics"`,
  });
  res.send(lines.join('\r\n'));
}
