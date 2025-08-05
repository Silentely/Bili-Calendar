// utils/http.js
// 统一的 Axios 客户端：默认超时、有限重试（429/5xx）、统一Headers注入、环境变量健壮解析
const axios = require('axios');

/** 将字符串环境变量解析为整数，带上下界与默认值 */
function parseIntEnv(name, def, min, max) {
  const raw = process.env[name];
  if (raw == null || raw === '') return def;
  const n = Number.parseInt(String(raw), 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

const DEFAULT_TIMEOUT_MS = parseIntEnv('HTTP_TIMEOUT_MS', 10000, 1000, 60000);
const RETRY_MAX = parseIntEnv('HTTP_RETRY_MAX', 2, 0, 5); // 429/5xx 最多重试次数
const RETRY_BASE_DELAY_MS = parseIntEnv('HTTP_RETRY_BASE_DELAY_MS', 300, 50, 5000);

const DEFAULT_HEADERS = {
  'User-Agent':
    process.env.HTTP_UA ||
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Referer: process.env.HTTP_REFERER || 'https://www.bilibili.com/',
  Cookie: process.env.BILIBILI_COOKIE || ''
};

const httpClient = axios.create({
  timeout: DEFAULT_TIMEOUT_MS,
  headers: DEFAULT_HEADERS
});

/** 指数退避 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

httpClient.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const cfg = error.config || {};
    const status = error.response?.status;

    // 仅对 GET 且状态为 429/5xx 的请求做有限次重试
    const shouldRetry =
      cfg?.method?.toLowerCase() === 'get' && (status === 429 || (status && status >= 500 && status < 600));

    if (!shouldRetry) {
      return Promise.reject(error);
    }

    cfg.__retryCount = (cfg.__retryCount || 0) + 1;
    if (cfg.__retryCount > RETRY_MAX) {
      return Promise.reject(error);
    }

    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, cfg.__retryCount - 1); // 300, 600, 1200...
    await sleep(delay);

    return httpClient(cfg);
  }
);

module.exports = { httpClient, DEFAULT_HEADERS, DEFAULT_TIMEOUT_MS, RETRY_MAX };