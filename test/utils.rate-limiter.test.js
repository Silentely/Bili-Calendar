// test/utils.rate-limiter.test.js
// 速率限制器单元测试
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createRateLimiter } = require('../utils/rate-limiter.cjs');

describe('Rate Limiter', () => {
  let rateLimiter;
  const testIP = '192.168.1.1';

  beforeEach(() => {
    // 为测试创建新的限制器实例
    rateLimiter = createRateLimiter();
    rateLimiter.MAX_REQUESTS = 3;
    rateLimiter.TIME_WINDOW = 1000; // 1秒用于测试
  });

  it('should allow requests under the limit', () => {
    assert.strictEqual(rateLimiter.check(testIP), true, '第一个请求应该被允许');
    assert.strictEqual(rateLimiter.check(testIP), true, '第二个请求应该被允许');
    assert.strictEqual(rateLimiter.check(testIP), true, '第三个请求应该被允许');
  });

  it('should block requests over the limit', () => {
    // 使用完所有允许的请求
    rateLimiter.check(testIP);
    rateLimiter.check(testIP);
    rateLimiter.check(testIP);
    
    // 第四个请求应该被阻止
    assert.strictEqual(rateLimiter.check(testIP), false, '超出限制的请求应该被阻止');
  });

  it('should return correct remaining requests', () => {
    assert.strictEqual(rateLimiter.getRemainingRequests(testIP), 3, '初始应该有3个剩余请求');
    
    rateLimiter.check(testIP);
    assert.strictEqual(rateLimiter.getRemainingRequests(testIP), 2, '使用一个后应该有2个剩余');
    
    rateLimiter.check(testIP);
    assert.strictEqual(rateLimiter.getRemainingRequests(testIP), 1, '使用两个后应该有1个剩余');
    
    rateLimiter.check(testIP);
    assert.strictEqual(rateLimiter.getRemainingRequests(testIP), 0, '使用完后应该没有剩余');
  });

  it('should handle multiple IPs independently', () => {
    const ip1 = '192.168.1.1';
    const ip2 = '192.168.1.2';
    
    rateLimiter.check(ip1);
    rateLimiter.check(ip1);
    
    // IP2应该有完整的配额
    assert.strictEqual(rateLimiter.getRemainingRequests(ip2), 3, 'IP2应该有完整配额');
    assert.strictEqual(rateLimiter.getRemainingRequests(ip1), 1, 'IP1应该只剩1个配额');
  });

  it('should cleanup expired entries', () => {
    const now = Date.now();
    
    // 手动添加过期条目
    rateLimiter.store[testIP] = {
      count: 3,
      resetTime: now - 1000, // 已过期
    };
    
    rateLimiter.cleanup(now);
    
    assert.strictEqual(Object.keys(rateLimiter.store).length, 0, '过期条目应该被清理');
  });

  it('should respect disabled state', () => {
    rateLimiter.ENABLED = false;
    
    // 即使超出限制也应该允许
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(rateLimiter.check(testIP), true, '禁用时所有请求都应该被允许');
    }
  });
});
