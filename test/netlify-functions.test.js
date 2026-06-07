import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { handler } from '../netlify/functions/server.js';
import {
  __clearBangumiCacheForTest,
  __setBangumiHttpClientForTest,
} from '../utils-es/bangumi.js';

const TEST_UID = '123456';

function createBangumiPayload() {
  return {
    data: {
      code: 0,
      message: 'success',
      data: {
        list: [
          {
            media_id: 101,
            season_id: 202,
            title: '测试番剧',
            season_title: '测试季度',
            is_finish: 0,
            pub_index: '每周一 10:00',
            index_show: '更新至第1话',
            evaluate: '测试简介',
          },
        ],
      },
    },
  };
}

function setBangumiMock() {
  __setBangumiHttpClientForTest({
    async get() {
      return createBangumiPayload();
    },
  });
}

async function request(path, options = {}) {
  const queryStringParameters = options.query || null;
  const response = await handler(
    {
      httpMethod: 'GET',
      path,
      headers: {
        accept: options.accept || 'application/json',
        'x-forwarded-for': options.ip || '127.0.0.1',
      },
      queryStringParameters,
      body: null,
      isBase64Encoded: false,
    },
    {}
  );
  return response;
}

describe('netlify/functions/server.js', () => {
  beforeEach(() => {
    __clearBangumiCacheForTest();
    setBangumiMock();
  });

  afterEach(() => {
    __clearBangumiCacheForTest();
    __setBangumiHttpClientForTest(null);
  });

  it('GET /:uid 应返回 ICS 日历', async () => {
    const response = await request(`/${TEST_UID}`, { accept: 'text/calendar' });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /text\/calendar/);
    assert.match(response.body, /BEGIN:VCALENDAR/);
    assert.match(response.body, /测试番剧/);
  });

  it('GET /api/bangumi/:uid 应返回番剧 JSON', async () => {
    const response = await request(`/api/bangumi/${TEST_UID}`);
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.code, 0);
    assert.equal(body.filtered_count, 1);
    assert.equal(body.data.list[0].title, '测试番剧');
  });

  it('GET /status 应返回服务状态', async () => {
    const response = await request('/status', {
      accept: 'application/json',
      query: { format: 'json' },
    });
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.uptimeMs, 'number');
    assert.ok(body.metrics);
  });

  it('GET /aggregate/:uid.ics 应返回聚合 ICS 日历', async () => {
    const response = await request(`/aggregate/${TEST_UID}.ics`, { accept: 'text/calendar' });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'], /text\/calendar/);
    assert.match(response.body, /BEGIN:VCALENDAR/);
    assert.match(response.body, /B站追番聚合/);
    assert.match(response.body, /测试番剧/);
  });
});
