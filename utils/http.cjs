// utils/http.cjs
// 统一的 Axios 客户端：默认超时、有限重试（429/5xx）、统一Headers注入、环境变量健壮解析、连接池优化
const axios = require('axios');
const http = require('http');
const https = require('https');

/**
 * 将字符串环境变量解析为整数，带上下界与默认值
 * 
 * @param {string} name - 环境变量名称
 * @param {number} def - 默认值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 解析后的整数值
 */
function parseIntEnv(name, def, min, max) {
  const raw = process.env[name];
  if (raw == null || raw === '') return def;
  const n = Number.parseInt(String(raw), 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

const DEFAULT_TIMEOUT_MS = parseIntEnv('HTTP_TIMEOUT_MS', 25000, 5000, 60000); // 增加到25秒，优化Serverless环境
const RETRY_MAX = parseIntEnv('HTTP_RETRY_MAX', 3, 0, 5); // 增加重试次数到3次
const RETRY_BASE_DELAY_MS = parseIntEnv('HTTP_RETRY_BASE_DELAY_MS', 500, 100, 5000); // 增加基础延迟到500ms

const DEFAULT_HEADERS = {
  'User-Agent':
    process.env.HTTP_UA ||
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Referer: process.env.HTTP_REFERER || 'https://www.bilibili.com/',
  Cookie: process.env.BILIBILI_COOKIE || '',
};

// 创建连接池以提高性能，适配Serverless环境
// Serverless环境中连接生命周期较短，需要优化配置
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 15000, // 减少到15秒，适配Serverless短生命周期
  maxSockets: 10, // 减少到10个，Serverless环境中不需要太多并发连接
  maxFreeSockets: 5, // 减少空闲socket数量
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 15000,
  maxSockets: 10,
  maxFreeSockets: 5,
});

const httpClient = axios.create({
  timeout: DEFAULT_TIMEOUT_MS,
  headers: DEFAULT_HEADERS,
  httpAgent,
  httpsAgent,
});

/** 指数退避延迟函数 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 响应拦截器：对429、5xx和网络错误进行有限次数的指数退避重试
 *
 * 重试策略：
 * - 仅对GET请求重试
 * - 对以下错误类型重试：
 *   * 429（限流）
 *   * 5xx（服务器错误）
 *   * ETIMEDOUT（超时）
 *   * ECONNRESET（连接重置）
 *   * ENOTFOUND（DNS解析失败）
 *   * 网络中断/连接错误
 * - 使用指数退避：500ms, 1000ms, 2000ms...
 * - 最多重试RETRY_MAX次
 */
httpClient.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const cfg = error.config || {};
    const status = error.response?.status;
    const errorCode = error.code;
    const errorMessage = error.message;

    // 检查是否为可重试的错误
    const shouldRetry =
      cfg?.method?.toLowerCase() === 'get' && (
        // HTTP状态码错误
        status === 429 || (status && status >= 500 && status < 600) ||
        // 网络相关错误
        errorCode === 'ETIMEDOUT' ||
        errorCode === 'ECONNRESET' ||
        errorCode === 'ENOTFOUND' ||
        errorCode === 'ECONNREFUSED' ||
        errorCode === 'EHOSTUNREACH' ||
        errorMessage?.includes('timeout') ||
        errorMessage?.includes('socket hang up') ||
        errorMessage?.includes('connect ECONNREFUSED') ||
        errorMessage?.includes('getaddrinfo ENOTFOUND')
      );

    if (!shouldRetry) {
      return Promise.reject(error);
    }

    cfg.__retryCount = (cfg.__retryCount || 0) + 1;
    if (cfg.__retryCount > RETRY_MAX) {
      return Promise.reject(error);
    }

    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, cfg.__retryCount - 1); // 500, 1000, 2000...
    console.log(`🔄 重试第 ${cfg.__retryCount} 次请求 (${cfg.method?.toUpperCase()} ${cfg.url})，延迟 ${delay}ms`);
    console.log(`❌ 错误类型: ${error.code || 'HTTP_' + status}, 消息: ${error.message}`);
    
    await sleep(delay);

    return httpClient(cfg);
  }
);

module.exports = { httpClient, DEFAULT_HEADERS, DEFAULT_TIMEOUT_MS, RETRY_MAX };
