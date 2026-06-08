import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  __setHttpSleepForTest,
  DEFAULT_TIMEOUT_MS,
  RETRY_MAX,
  addRequestInterceptor,
  getRetryDelay,
  httpClient,
  shouldRetryHttpError,
  toHttpErrorInfo,
} from '../utils-es/http.js';

const originalAdapter = httpClient.defaults.adapter;

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
  __setHttpSleepForTest(null);
});

function createAxiosError(config, overrides = {}) {
  const error = new Error(overrides.message || 'Request failed');
  error.config = config;
  if (overrides.code) error.code = overrides.code;
  if (overrides.response) error.response = overrides.response;
  return error;
}

describe('utils-es/http.js', () => {
  it('请求拦截器应该能修改请求配置', async () => {
    const interceptorId = addRequestInterceptor((config) => {
      config.headers.set('X-Test-Interceptor', 'ok');
      return config;
    });

    httpClient.defaults.adapter = async (config) => {
      assert.equal(config.headers.get('X-Test-Interceptor'), 'ok');
      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    try {
      const response = await httpClient.get('https://example.com/test');
      assert.deepEqual(response.data, { ok: true });
    } finally {
      httpClient.interceptors.request.eject(interceptorId);
    }
  });

  it('应该把默认超时时间传给 axios 配置', async () => {
    httpClient.defaults.adapter = async (config) => {
      assert.equal(config.timeout, DEFAULT_TIMEOUT_MS);
      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    await httpClient.get('https://example.com/timeout-check');
  });

  it('应该只对 GET 网络错误和 5xx 错误重试', () => {
    assert.equal(
      shouldRetryHttpError(createAxiosError({ method: 'get' }, { response: { status: 500 } })),
      true
    );
    assert.equal(
      shouldRetryHttpError(createAxiosError({ method: 'get' }, { code: 'ETIMEDOUT' })),
      true
    );
    assert.equal(
      shouldRetryHttpError(createAxiosError({ method: 'get' }, { response: { status: 429 } })),
      false
    );
    assert.equal(
      shouldRetryHttpError(createAxiosError({ method: 'post' }, { response: { status: 503 } })),
      false
    );
    assert.equal(
      shouldRetryHttpError(createAxiosError({ method: 'get' }, { response: { status: 404 } })),
      false
    );
  });

  it('应该使用最多 2 次指数退避重试后返回成功响应', async () => {
    const delays = [];
    let attempts = 0;
    __setHttpSleepForTest(async (ms) => {
      delays.push(ms);
    });

    httpClient.defaults.adapter = async (config) => {
      attempts += 1;
      if (attempts <= RETRY_MAX) {
        throw createAxiosError(config, {
          response: { status: 500 },
          message: 'server error',
        });
      }
      return {
        data: { attempt: attempts },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const response = await httpClient.get('https://example.com/retry');

    assert.equal(response.data.attempt, 3);
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [getRetryDelay(1), getRetryDelay(2)]);
  });

  it('应该转换 HTTP 和网络错误信息', () => {
    const httpError = toHttpErrorInfo(
      createAxiosError(
        { method: 'get' },
        {
          response: { status: 503 },
          message: 'Service Unavailable',
        }
      )
    );
    assert.deepEqual(httpError, {
      type: 'http',
      status: 503,
      message: 'Service Unavailable',
      retryable: true,
    });

    const networkError = toHttpErrorInfo(
      createAxiosError(
        { method: 'get' },
        {
          code: 'ETIMEDOUT',
          message: 'timeout',
        }
      )
    );
    assert.deepEqual(networkError, {
      type: 'network',
      code: 'ETIMEDOUT',
      message: 'timeout',
      retryable: true,
    });
  });
});
