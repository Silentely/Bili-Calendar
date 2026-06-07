import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  __clearBangumiCacheForTest,
  __getBangumiCacheSizeForTest,
  __setBangumiHttpClientForTest,
  getBangumiData,
} from '../utils-es/bangumi.js';

function createHttpClientMock(handler) {
  const calls = [];
  return {
    calls,
    async get(url) {
      calls.push(url);
      return handler(url);
    },
  };
}

function createSuccessPayload(list) {
  return {
    data: {
      code: 0,
      message: 'success',
      data: { list },
    },
  };
}

describe('utils-es/bangumi.js', () => {
  beforeEach(() => {
    __clearBangumiCacheForTest();
    __setBangumiHttpClientForTest(null);
  });

  it('应该正常获取并缓存追番数据', async () => {
    const httpMock = createHttpClientMock(async () =>
      createSuccessPayload([
        {
          title: '连载番',
          is_finish: 0,
          pub_index: '每周一 10:00',
        },
      ])
    );
    __setBangumiHttpClientForTest(httpMock);

    const first = await getBangumiData('123');
    const second = await getBangumiData('123');

    assert.equal(first.code, 0);
    assert.equal(first.filtered_count, 1);
    assert.deepEqual(second, first);
    assert.equal(httpMock.calls.length, 1, '相同 UID 应命中内存缓存');
    assert.equal(__getBangumiCacheSizeForTest(), 1);
  });

  it('应该返回 B站 API 业务错误且不缓存', async () => {
    const httpMock = createHttpClientMock(async () => ({
      data: {
        code: 53013,
        message: 'privacy',
      },
    }));
    __setBangumiHttpClientForTest(httpMock);

    const first = await getBangumiData('456');
    const second = await getBangumiData('456');

    assert.equal(first.error, 'Privacy Settings');
    assert.equal(first.code, 53013);
    assert.equal(second.error, 'Privacy Settings');
    assert.equal(httpMock.calls.length, 2, '业务错误不应写入成功缓存');
    assert.equal(__getBangumiCacheSizeForTest(), 0);
  });

  it('网络超时时应该返回 null 且不缓存', async () => {
    const httpMock = createHttpClientMock(async () => {
      const error = new Error('timeout of 1000ms exceeded');
      error.code = 'ETIMEDOUT';
      throw error;
    });
    __setBangumiHttpClientForTest(httpMock);

    const result = await getBangumiData('789');

    assert.equal(result, null);
    assert.equal(httpMock.calls.length, 1);
    assert.equal(__getBangumiCacheSizeForTest(), 0);
  });

  it('应该过滤已完结或缺少播出信息的番剧', async () => {
    const httpMock = createHttpClientMock(async () =>
      createSuccessPayload([
        { title: '保留-发布时间', is_finish: 0, pub_index: '每周二 20:00' },
        { title: '保留-更新时间', is_finish: 0, renewal_time: '周三 21:00' },
        { title: '保留-新集时间', is_finish: 0, new_ep: { pub_time: '2025-01-01 12:00:00' } },
        { title: '过滤-已完结', is_finish: 1, pub_index: '每周四 20:00' },
        { title: '过滤-无播出信息', is_finish: 0 },
      ])
    );
    __setBangumiHttpClientForTest(httpMock);

    const result = await getBangumiData('100');

    assert.equal(result.original_count, 5);
    assert.equal(result.filtered_count, 3);
    assert.deepEqual(
      result.data.list.map((item) => item.title),
      ['保留-发布时间', '保留-更新时间', '保留-新集时间']
    );
  });

  it('空数据应该返回空列表并写入缓存', async () => {
    const httpMock = createHttpClientMock(async () => createSuccessPayload([]));
    __setBangumiHttpClientForTest(httpMock);

    const result = await getBangumiData('101');

    assert.equal(result.code, 0);
    assert.equal(result.original_count, 0);
    assert.equal(result.filtered_count, 0);
    assert.deepEqual(result.data.list, []);
    assert.equal(__getBangumiCacheSizeForTest(), 1);
  });
});
