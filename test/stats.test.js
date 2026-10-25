import test from 'node:test';
import assert from 'node:assert/strict';
import { StatsService } from '../utils-es/stats-service.js';

test('statsService handles local fallback and deduplication correctly', async () => {
  const service = new StatsService({ cacheTtlMs: 0 });
  service.reset();

  await service.recordPull('614500');
  await service.recordPull('614500'); // 重复 UID
  await service.recordPull('123456'); // 新 UID

  const stats = await service.getStats();
  assert.equal(stats.usersCount, 2);
  assert.equal(stats.pullsCount, 3);
});

test('statsService respects base counts configuration', async () => {
  process.env.STATS_BASE_USERS = '100';
  process.env.STATS_BASE_PULLS = '500';

  const service = new StatsService({ cacheTtlMs: 0 });
  service.reset();

  await service.recordPull('999');
  const stats = await service.getStats();

  assert.equal(stats.usersCount, 101);
  assert.equal(stats.pullsCount, 501);

  delete process.env.STATS_BASE_USERS;
  delete process.env.STATS_BASE_PULLS;
});

test('statsService interacts with remote KV via pipeline and handles fallback on error', async () => {
  const originalFetch = globalThis.fetch;
  const mockCalls = [];

  // @ts-ignore
  globalThis.fetch = async (url, options) => {
    mockCalls.push({ url, options });
    if (url.includes('/pipeline')) {
      const body = JSON.parse(options.body);
      if (body[0][0] === 'SCARD') {
        return {
          ok: true,
          json: async () => [{ result: 15 }, { result: 120 }],
        };
      }
      return { ok: true, json: async () => [{ result: 1 }, { result: 1 }] };
    }
    return { ok: false, status: 500 };
  };

  try {
    const service = new StatsService({
      url: 'https://mock-redis.upstash.io',
      token: 'mock-token',
      cacheTtlMs: 0,
    });
    service.reset();

    await service.recordPull('test-uid');
    assert.equal(mockCalls.length, 1);
    assert.match(mockCalls[0].url, /mock-redis\.upstash\.io\/pipeline/);

    const stats = await service.getStats();
    assert.equal(stats.usersCount, 15);
    assert.equal(stats.pullsCount, 120);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
