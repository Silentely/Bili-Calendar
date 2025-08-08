import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { generateICS } = require('../utils/ics.cjs');

describe('utils/ics.cjs', () => {
  it('generateICS: basic calendar structure', () => {
    const sample = [{ title: '测试番', season_id: 123, is_finish: 1, index_show: '更新至第1话' }];
    const ics = generateICS(sample, '614500');
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /END:VCALENDAR/);
    assert.match(ics, /UID:123@bilibili.com/);
  });
});
