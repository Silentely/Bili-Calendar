// test/utils.request-dedup.test.js
// 请求去重单元测试
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createRequestDedup } = require('../utils/request-dedup.cjs');

describe('Request Deduplication', () => {
  let dedupManager;

  beforeEach(() => {
    dedupManager = createRequestDedup();
  });

  it('should execute unique requests', async () => {
    let executionCount = 0;

    const executor = async () => {
      executionCount++;
      return 'result';
    };

    const result = await dedupManager.dedupe('key1', executor);

    assert.strictEqual(executionCount, 1, '执行器应该被调用一次');
    assert.strictEqual(result, 'result', '应该返回正确的结果');
  });

  it('should deduplicate concurrent requests with same key', async () => {
    let executionCount = 0;

    const executor = async () => {
      executionCount++;
      // 模拟异步操作
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'result';
    };

    // 同时发起三个相同的请求
    const [result1, result2, result3] = await Promise.all([
      dedupManager.dedupe('key1', executor),
      dedupManager.dedupe('key1', executor),
      dedupManager.dedupe('key1', executor),
    ]);

    assert.strictEqual(executionCount, 1, '执行器应该只被调用一次');
    assert.strictEqual(result1, 'result', '第一个请求应该返回正确结果');
    assert.strictEqual(result2, 'result', '第二个请求应该返回相同结果');
    assert.strictEqual(result3, 'result', '第三个请求应该返回相同结果');
  });

  it('should handle different keys independently', async () => {
    let count1 = 0;
    let count2 = 0;

    const executor1 = async () => {
      count1++;
      return 'result1';
    };

    const executor2 = async () => {
      count2++;
      return 'result2';
    };

    const [result1, result2] = await Promise.all([
      dedupManager.dedupe('key1', executor1),
      dedupManager.dedupe('key2', executor2),
    ]);

    assert.strictEqual(count1, 1, '执行器1应该被调用一次');
    assert.strictEqual(count2, 1, '执行器2应该被调用一次');
    assert.strictEqual(result1, 'result1', '应该返回key1的结果');
    assert.strictEqual(result2, 'result2', '应该返回key2的结果');
  });

  it('should cleanup after request completion', async () => {
    const executor = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'result';
    };

    assert.strictEqual(dedupManager.getPendingCount(), 0, '初始应该没有待处理请求');

    const promise = dedupManager.dedupe('key1', executor);
    assert.strictEqual(dedupManager.getPendingCount(), 1, '应该有1个待处理请求');

    await promise;
    assert.strictEqual(dedupManager.getPendingCount(), 0, '完成后应该清理');
  });

  it('should handle rejected promises', async () => {
    const executor = async () => {
      throw new Error('Test error');
    };

    await assert.rejects(
      async () => {
        await dedupManager.dedupe('key1', executor);
      },
      {
        name: 'Error',
        message: 'Test error',
      },
      '应该正确传播错误'
    );

    // 错误后应该清理
    assert.strictEqual(dedupManager.getPendingCount(), 0, '错误后应该清理');
  });

  it('should allow new request after previous completes', async () => {
    let executionCount = 0;

    const executor = async () => {
      executionCount++;
      return 'result' + executionCount;
    };

    const result1 = await dedupManager.dedupe('key1', executor);
    const result2 = await dedupManager.dedupe('key1', executor);

    assert.strictEqual(executionCount, 2, '执行器应该被调用两次');
    assert.strictEqual(result1, 'result1', '第一个结果应该正确');
    assert.strictEqual(result2, 'result2', '第二个结果应该正确');
  });
});
