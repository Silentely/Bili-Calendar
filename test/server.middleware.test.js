import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRateLimiterMiddleware } from '../server/lib/middleware.js';

/**
 * 限流中间件单测：验证 429 响应携带 Retry-After 与限流头
 */
describe('server/lib/middleware.js - createRateLimiterMiddleware', () => {
  /** 构造最小响应对象 */
  function createMockRes() {
    return {
      statusCode: 0,
      headers: {},
      body: null,
      setHeader(k, v) {
        this.headers[k] = v;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
  }

  it('限流时应返回 429 并携带 Retry-After 头', () => {
    const resetMs = Date.now() + 60 * 1000;
    const rateLimiter = {
      check: () => false,
      getResetTime: () => resetMs,
      getRemainingRequests: () => 0,
      MAX_REQUESTS: 100,
      TIME_WINDOW: 60 * 60 * 1000,
    };

    const middleware = createRateLimiterMiddleware(rateLimiter);
    const req = { headers: {} };
    const res = createMockRes();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(nextCalled, false, '限流时不应继续执行 next');
    assert.ok(
      Number(res.headers['Retry-After']) >= 1 && Number(res.headers['Retry-After']) <= 60,
      'Retry-After 应为秒数且在 1-60 之间'
    );
    assert.strictEqual(res.headers['X-RateLimit-Limit'], 100);
    assert.strictEqual(res.headers['X-RateLimit-Remaining'], 0);
    assert.ok(res.headers['X-RateLimit-Reset'], '应携带重置时间');
    assert.ok(res.body.window.includes('分钟'), '窗口标签应基于配置动态生成');
  });

  it('未限流时应放行并设置剩余配额头', () => {
    const rateLimiter = {
      check: () => true,
      getResetTime: () => Date.now() + 60 * 1000,
      getRemainingRequests: () => 99,
      MAX_REQUESTS: 100,
      TIME_WINDOW: 60 * 60 * 1000,
    };

    const middleware = createRateLimiterMiddleware(rateLimiter);
    const req = { headers: {} };
    const res = createMockRes();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, '未限流时应调用 next');
    assert.strictEqual(res.headers['X-RateLimit-Remaining'], 99);
    assert.strictEqual(res.headers['Retry-After'], undefined, '正常响应不应携带 Retry-After');
  });
});
