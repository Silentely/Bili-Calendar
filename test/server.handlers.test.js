import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAggregateSourcesQuery, processBangumiApiError } from '../server/lib/handlers.js';

describe('server/lib/handlers.js', () => {
  it('parseAggregateSourcesQuery: 空参数得到空列表', () => {
    const result = parseAggregateSourcesQuery(undefined);
    assert.deepEqual(result.sourceList, []);
    assert.equal(result.error, undefined);
  });

  it('parseAggregateSourcesQuery: 超过 5 个源返回 400', () => {
    const sources = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}.ics`).join(',');
    const result = parseAggregateSourcesQuery(sources);
    assert.equal(result.error?.status, 400);
    assert.match(result.error?.body?.message || '', /最多支持/);
  });

  it('parseAggregateSourcesQuery: 非法编码返回 400', () => {
    const result = parseAggregateSourcesQuery('%E0%A4%A');
    assert.equal(result.error?.status, 400);
  });

  it('processBangumiApiError: 隐私码写入空日历', () => {
    /** @type {any} */
    let status = null;
    /** @type {any} */
    let body = null;
    const res = {
      set() {},
      status(code) {
        status = code;
        return this;
      },
      send(payload) {
        body = payload;
      },
    };
    // respondWithEmptyCalendar 走 res.set + res.send，不设 status
    const handled = processBangumiApiError(res, { code: 53013, message: 'privacy' }, '123');
    assert.equal(handled, true);
    assert.match(String(body), /隐私|privacy|VCALENDAR/i);
    assert.equal(status, null);
  });

  it('processBangumiApiError: 其他错误码 500', () => {
    let status = 0;
    let body = '';
    const res = {
      status(code) {
        status = code;
        return this;
      },
      send(payload) {
        body = String(payload);
      },
    };
    const handled = processBangumiApiError(res, { code: 1, message: 'fail' }, '1');
    assert.equal(handled, true);
    assert.equal(status, 500);
    assert.match(body, /fail/);
  });

  it('processBangumiApiError: code 缺失或 0 时不处理', () => {
    const res = {
      status() {
        throw new Error('should not set status');
      },
      send() {
        throw new Error('should not send');
      },
    };
    assert.equal(processBangumiApiError(res, { code: 0 }, '1'), false);
    assert.equal(processBangumiApiError(res, {}, '1'), false);
    assert.equal(processBangumiApiError(res, null, '1'), false);
  });

  it('parseAggregateSourcesQuery: 合法单源通过 SSRF 校验', () => {
    const result = parseAggregateSourcesQuery('https://example.com/a.ics');
    assert.equal(result.error, undefined);
    assert.deepEqual(result.sourceList, ['https://example.com/a.ics']);
  });
});
