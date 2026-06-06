// utils/ics.cjs
// 生成与响应 ICS 的通用工具（CommonJS 版本）
const {
  parseBroadcastTime,
  parseNewEpTime,
  getNextBroadcastDate,
  formatDate,
  escapeICSText,
} = require('./time.cjs');

function generateICS(bangumis, uid) {
  const VTIMEZONE_DEFINITION = `BEGIN:VTIMEZONE
TZID:Asia/Shanghai
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0800
TZOFFSETTO:+0800
TZNAME:CST
END:STANDARD
END:VTIMEZONE`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bili-Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:B站追番 (UID: ${uid})`,
    'X-WR-TIMEZONE:Asia/Shanghai',
    VTIMEZONE_DEFINITION,
  ];

  const now = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';

  for (const item of bangumis) {
    if (!item || !item.title || !item.season_id) continue;

    let info = parseBroadcastTime(item.pub_index);
    if (!info && item?.new_ep?.pub_time) {
      info = parseNewEpTime(item.new_ep.pub_time);
    }
    if (!info && item?.renewal_time) {
      info = parseBroadcastTime(item.renewal_time);
    }

    if (!info) {
      const defaultDate = new Date();
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
    const dtstart = formatDate(firstDate);

    const eventLines = [
      'BEGIN:VEVENT',
      `UID:${item.season_id}@bilibili.com`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=Asia/Shanghai:${dtstart}`,
    ];

    if (item.is_finish === 0) {
      eventLines.push(`RRULE:FREQ=WEEKLY;COUNT=2;BYDAY=${info.rruleDay}`);
    }

    const normalTitleWithSeason =
      item.season_title && !item.title.includes(item.season_title)
        ? `${item.title} ${item.season_title}`
        : item.title;

    let normalDescription = '';
    if (item.index_show) {
      normalDescription += `🌟 更新状态: ${item.index_show}`;
    } else if (item.new_ep?.index_show) {
      normalDescription += `🌟 更新状态: ${item.new_ep.index_show}`;
    }
    normalDescription += `\n➡️ 状态: ${item.is_finish === 0 ? '连载中' : '已完结'}`;
    normalDescription += `\n✨ 番剧简介: ${item.evaluate || '暂无简介'}`;

    eventLines.push(
      `SUMMARY:${escapeICSText(normalTitleWithSeason)}`,
      `DESCRIPTION:${escapeICSText(normalDescription)}`,
      `URL;VALUE=URI:https://www.bilibili.com/bangumi/play/ss${item.season_id}`,
      'END:VEVENT'
    );

    lines.push(...eventLines);
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function respondWithICS(res, content, uid) {
  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="bili_bangumi_${uid}.ics"`,
    'Cache-Control': 'public, max-age=3600',
  });
  res.send(content);
}

function respondWithEmptyCalendar(res, uid, reason) {
  const now = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bili-Calendar//EN',
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

module.exports = {
  generateICS,
  respondWithICS,
  respondWithEmptyCalendar,
};
