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

  it('应该分页拉取全部追番列表后再过滤', async () => {
    const page1 = Array.from({ length: 30 }, (_, i) => ({
      title: `连载-${i + 1}`,
      is_finish: 0,
      pub_index: '每周一 10:00',
    }));
    const page2 = [
      { title: '连载-31', is_finish: 0, pub_index: '每周二 20:00' },
      { title: '完结-32', is_finish: 1, pub_index: '每周三 20:00' },
    ];
    const httpMock = createHttpClientMock(async (url) => {
      if (url.includes('pn=1')) return createSuccessPayload(page1);
      if (url.includes('pn=2')) return createSuccessPayload(page2);
      return createSuccessPayload([]);
    });
    __setBangumiHttpClientForTest(httpMock);

    const result = await getBangumiData('999');

    assert.equal(httpMock.calls.length, 2, '应请求两页');
    assert.equal(result.original_count, 32);
    assert.equal(result.filtered_count, 31);
    assert.equal(result.data.list[30].title, '连载-31');
    assert.match(httpMock.calls[0], /pn=1&ps=30/);
    assert.match(httpMock.calls[1], /pn=2&ps=30/);
  });

  it('后续页网络失败时应保留已拉取数据', async () => {
    const page1 = Array.from({ length: 30 }, (_, i) => ({
      title: `连载-${i + 1}`,
      is_finish: 0,
      pub_index: '每周一 10:00',
    }));
    const httpMock = createHttpClientMock(async (url) => {
      if (url.includes('pn=1')) return createSuccessPayload(page1);
      const error = new Error('timeout');
      error.code = 'ETIMEDOUT';
      throw error;
    });
    __setBangumiHttpClientForTest(httpMock);

    const result = await getBangumiData('888');

    assert.equal(result.code, 0);
    assert.equal(result.original_count, 30);
    assert.equal(result.filtered_count, 30);
    assert.equal(httpMock.calls.length, 2);
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
