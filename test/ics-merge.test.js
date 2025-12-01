import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parseIcsEvents, detectConflicts, generateMergedICS } = require('../utils/ics-merge.cjs');
const { getNextBroadcastDate } = require('../utils/time.cjs');

test('parseIcsEvents should parse timed and all-day events', () => {
  const ics = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:abc\nSUMMARY:Test Event\nDTSTART;TZID=Asia/Shanghai:20250105T200000\nDTEND;TZID=Asia/Shanghai:20250105T210000\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:All Day\nDTSTART;VALUE=DATE:20250106\nEND:VEVENT\nEND:VCALENDAR`;

  const events = parseIcsEvents(ics, 'ext');
  assert.equal(events.length, 2);
  assert.equal(events[0].summary, 'Test Event');
  assert.equal(events[0].isAllDay, false);
  assert.equal(events[1].isAllDay, true);
});

test('detectConflicts should flag overlapping events', () => {
  const now = new Date('2025-01-01T10:00:00Z');
  const events = [
    { uid: 'a', summary: 'A', start: now, end: new Date(now.getTime() + 60 * 60 * 1000) },
    {
      uid: 'b',
      summary: 'B',
      start: new Date(now.getTime() + 30 * 60 * 1000),
      end: new Date(now.getTime() + 90 * 60 * 1000),
    },
    { uid: 'c', summary: 'C', start: new Date(now.getTime() + 2 * 60 * 60 * 1000), end: new Date(now.getTime() + 3 * 60 * 60 * 1000) },
  ];

  const conflicts = detectConflicts(events);
  assert.equal(conflicts.get('a')?.has('B'), true);
  assert.equal(conflicts.get('b')?.has('A'), true);
  assert.equal(conflicts.has('c'), false);
});

test('generateMergedICS should include conflict note between bangumi and external ICS', () => {
  const bangumiList = [
    {
      season_id: '1',
      title: '番剧A',
      season_title: '',
      pub_index: '每周一 10:00',
      new_ep: { pub_time: '2025-01-06 10:00:00' },
      is_finish: 0,
      evaluate: '测试',
    },
  ];

  const nextSlot = getNextBroadcastDate(1, '10:00');
  const rawStart = nextSlot.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const rawEndDate = new Date(nextSlot.getTime() + 60 * 60 * 1000);
  const rawEnd = rawEndDate.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const externalIcs = [
    {
      url: 'https://example.com/work.ics',
      ics: `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:work-1\nSUMMARY:Meeting\nDTSTART:${rawStart}\nDTEND:${rawEnd}\nEND:VEVENT\nEND:VCALENDAR`,
    },
  ];

  const merged = generateMergedICS(bangumiList, '123', externalIcs);
  assert.ok(merged.includes('番剧A'));
  assert.ok(merged.includes('Meeting'));
  assert.ok(merged.includes('⚠️ 与'));
});

test('detectConflicts considers weekly recurrence next slot', () => {
  const base = new Date('2025-01-01T10:00:00Z');
  const events = [
    {
      uid: 'weekly',
      summary: 'Weekly A',
      start: base,
      end: new Date(base.getTime() + 60 * 60 * 1000),
      rrule: 'FREQ=WEEKLY;COUNT=2;BYDAY=MO',
      baseUid: 'weekly',
    },
    {
      uid: 'nextweek',
      summary: 'Next Week Clash',
      start: new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      end: new Date(base.getTime() + 7 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000),
      baseUid: 'nextweek',
    },
  ];

  const map = detectConflicts(events);
  assert.equal(map.get('weekly')?.has('Next Week Clash'), true);
});
