import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateICS } from '../utils-es/ics.js';

describe('utils-es/ics.js', () => {
  it('generateICS: basic calendar structure', () => {
    const sample = [{ title: '测试番', season_id: 123, is_finish: 1, index_show: '更新至第1话' }];
    const ics = generateICS(sample, '614500');
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /END:VCALENDAR/);
    assert.match(ics, /UID:123@bilibili.com/);
  });

  it('连载番剧应使用长期周重复规则并包含 DTEND 与 VALARM', () => {
    const sample = [
      {
        title: '连载番',
        season_id: 456,
        is_finish: 0,
        pub_index: '每周一 10:00',
        index_show: '更新至第3话',
      },
    ];
    const ics = generateICS(sample, '614500');
    assert.match(ics, /RRULE:FREQ=WEEKLY;COUNT=52;BYDAY=MO/);
    assert.match(ics, /DTSTART;TZID=Asia\/Shanghai:/);
    assert.match(ics, /DTEND;TZID=Asia\/Shanghai:/);
    assert.match(ics, /BEGIN:VALARM/);
    assert.match(ics, /TRIGGER:-PT15M/);
  });

  it('完结番剧不应包含 RRULE', () => {
    const sample = [
      {
        title: '完结番',
        season_id: 789,
        is_finish: 1,
        pub_index: '每周三 22:00',
      },
    ];
    const ics = generateICS(sample, '1');
    assert.doesNotMatch(ics, /RRULE:/);
    assert.match(ics, /DTEND;TZID=Asia\/Shanghai:/);
  });
});
