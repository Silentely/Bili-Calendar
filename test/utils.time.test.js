import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  parseBroadcastTime,
  parseNewEpTime,
  getNextBroadcastDate,
  formatDate,
} = require('../utils/time.cjs');

describe('utils/time.cjs', () => {
  it('parseBroadcastTime: standard patterns', () => {
    const a = parseBroadcastTime('每周四 21:00 更新');
    assert.equal(a.rruleDay, 'TH');
    assert.equal(a.time, '21:00');

    const b = parseBroadcastTime('周日 09:30');
    assert.equal(b.rruleDay, 'SU');
    assert.equal(b.time, '09:30');

    const c = parseBroadcastTime('仅 12:00 显示');
    assert.equal(c.rruleDay, 'MO');
    assert.equal(c.time, '12:00');
  });

  it('parseNewEpTime: standard datetime', () => {
    const n = parseNewEpTime('2024-08-08 18:30:00');
    assert.equal(n.time, '18:30');
    assert.ok(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].includes(n.rruleDay));
  });

  it('getNextBroadcastDate and formatDate', () => {
    const info = { dayOfWeek: 3, time: '10:15' }; // 周三 10:15
    const date = getNextBroadcastDate(info.dayOfWeek, info.time);
    const str = formatDate(date);
    assert.match(str, /^\d{8}T\d{4}00$/);
  });
});
