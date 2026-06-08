// @ts-nocheck
/**
 * @fileoverview HTTP 客户端工具模块（ESM）
 * 对齐 CJS 版本的默认头、连接池与指数退避重试策略
 */

import axios from 'axios';
import http from 'node:http';
import https from 'node:https';
import { parseIntEnv } from './env.js';

export const DEFAULT_TIMEOUT_MS = parseIntEnv('HTTP_TIMEOUT_MS', 25000, 5000, 60000);
export const RETRY_MAX = parseIntEnv('HTTP_RETRY_MAX', 2, 0, 5);
export const RETRY_BASE_DELAY_MS = parseIntEnv('HTTP_RETRY_BASE_DELAY_MS', 1000, 100, 5000);

const DEFAULT_HEADERS = {
  'User-Agent':
    process.env.HTTP_UA ||
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Referer: process.env.HTTP_REFERER || 'https://www.bilibili.com/',
  Cookie: process.env.BILIBILI_COOKIE || '',
};

// Serverless 环境禁用连接池，避免 EPIPE 错误
// 每次请求使用新连接，虽然性能略低但更可靠
const httpAgent = new http.Agent({
  keepAlive: false,
});

const httpsAgent = new https.Agent({
  keepAlive: false,
});

/**
 * 配置 axios 实例
 * @type {import('axios').AxiosInstance}
 */
export const httpClient = axios.create({
  timeout: DEFAULT_TIMEOUT_MS,
  maxRedirects: 3,
  headers: DEFAULT_HEADERS,
  httpAgent,
  httpsAgent,
});

let sleep = function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export function getRetryDelay(retryCount) {
  return RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1);
}

export function shouldRetryHttpError(error) {
  const cfg = error.config || {};
  const method = cfg.method?.toLowerCase();
  const status = error.response?.status;
  const errorCode = error.code;
  const errorMessage = error.message || '';
  const networkErrorHints = ['timeout', 'socket hang up', 'connect ECONNREFUSED', 'getaddrinfo ENOTFOUND'];

  return (
    method === 'get' &&
    ((status && status >= 500 && status < 600) ||
      ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EHOSTUNREACH'].includes(errorCode) ||
      networkErrorHints.some((hint) => errorMessage.includes(hint)))
  );
}

export function toHttpErrorInfo(error) {
  if (error.response) {
    return {
      type: 'http',
      status: error.response.status,
      message: error.message,
      retryable: shouldRetryHttpError(error),
    };
  }

  return {
    type: 'network',
    code: error.code || 'UNKNOWN',
    message: error.message || 'Network Error',
    retryable: shouldRetryHttpError(error),
  };
}

export function __setHttpSleepForTest(fn) {
  sleep = typeof fn === 'function' ? fn : ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
}

/**
 * 响应拦截器：对 GET 请求的 5xx/网络错误进行有限次数的指数退避重试
 */
httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const cfg = error.config || {};
    if (!shouldRetryHttpError(error)) {
      return Promise.reject(error);
    }

    cfg.__retryCount = (cfg.__retryCount || 0) + 1;
    if (cfg.__retryCount > RETRY_MAX) {
      return Promise.reject(error);
    }

    const delay = getRetryDelay(cfg.__retryCount);
    console.log(`🔄 重试第 ${cfg.__retryCount} 次请求 (${cfg.method?.toUpperCase()} ${cfg.url})，延迟 ${delay}ms`);

    await sleep(delay);
    return httpClient(cfg);
  }
);

/**
 * 设置通用请求头
 * @param {Record<string, string>} headers - 要设置的请求头对象
 */
export function setCommonHeaders(headers) {
  Object.keys(headers).forEach((key) => {
    httpClient.defaults.headers.common[key] = headers[key];
  });
}

/**
 * 添加请求拦截器
 * @param {Function} interceptor - 请求拦截器函数
 * @returns {number} 拦截器ID，可用于移除拦截器
 */
export function addRequestInterceptor(interceptor) {
  return httpClient.interceptors.request.use(interceptor);
}

/**
 * 添加响应拦截器
 * @param {Function} fulfilled - 请求成功的处理函数
 * @param {Function} rejected - 请求失败的处理函数
 * @returns {number} 拦截器ID，可用于移除拦截器
 */
export function addResponseInterceptor(fulfilled, rejected) {
  return httpClient.interceptors.response.use(fulfilled, rejected);
}
