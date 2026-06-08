// @ts-nocheck
// utils-es/bangumi.js (ES6 模块版本)
import { httpClient } from './http.js';
import {
  BILIBILI_API_BASE_URL,
  BILIBILI_API_SUCCESS_CODE,
  BILIBILI_PRIVACY_ERROR_CODE,
} from './constants.js';
import { createRequestDedup } from './request-dedup.js';

// 创建请求去重管理器实例
const dedupManager = createRequestDedup();
const BANGUMI_CACHE_TTL_MS = 5 * 60 * 1000;
const BANGUMI_CACHE_MAX_SIZE = 100;
const bangumiCache = new Map();
let activeHttpClient = httpClient;

function normalizeUID(uid) {
  return String(uid ?? '').trim();
}

function getCachedBangumi(uid, now = Date.now()) {
  const cacheKey = normalizeUID(uid);
  const cached = bangumiCache.get(cacheKey);
  if (!cached) return null;

  if (now - cached.timestamp > BANGUMI_CACHE_TTL_MS) {
    bangumiCache.delete(cacheKey);
    return null;
  }

  // 刷新插入顺序，保持 Map 的简单 LRU 语义
  bangumiCache.delete(cacheKey);
  bangumiCache.set(cacheKey, cached);
  return structuredClone(cached.value);
}

function setCachedBangumi(uid, value, now = Date.now()) {
  const cacheKey = normalizeUID(uid);
  if (!cacheKey) return;

  if (bangumiCache.has(cacheKey)) {
    bangumiCache.delete(cacheKey);
  }

  bangumiCache.set(cacheKey, {
    timestamp: now,
    value: structuredClone(value),
  });

  while (bangumiCache.size > BANGUMI_CACHE_MAX_SIZE) {
    const oldestKey = bangumiCache.keys().next().value;
    bangumiCache.delete(oldestKey);
  }
}

function filterAiringBangumi(responseData, uid) {
  if (!responseData.data || !Array.isArray(responseData.data.list)) {
    return responseData;
  }

  const originalCount = responseData.data.list.length;
  const currentlyAiring = responseData.data.list.filter((bangumi) => {
    const isOngoing = bangumi.is_finish === 0;
    const hasBroadcastInfo =
      (bangumi.pub_index && bangumi.pub_index.trim() !== '') ||
      (bangumi.renewal_time && bangumi.renewal_time.trim() !== '') ||
      (bangumi.new_ep && bangumi.new_ep.pub_time && bangumi.new_ep.pub_time.trim() !== '');
    return isOngoing && hasBroadcastInfo;
  });

  responseData.data.list = currentlyAiring;
  console.log(
    `📊 [UID:${uid}] 总共 ${originalCount} 部番剧，过滤后 ${currentlyAiring.length} 部正在播出`
  );
  responseData.filtered = true;
  responseData.filtered_count = currentlyAiring.length;
  responseData.original_count = originalCount;
  return responseData;
}

/**
 * 获取B站用户追番数据并过滤正在播出的番剧
 *
 * 该函数从B站API获取用户的追番列表，并自动过滤出正在播出的番剧。
 * 过滤条件：is_finish === 0（未完结）且具有播出时间信息。
 *
 * @param {string|number} uid - B站用户UID，必须是纯数字
 * @returns {Promise<Object|null>} 返回值说明：
 *   - 成功: { code: 0, data: { list: Array, ... }, filtered: true, filtered_count: number, original_count: number }
 *   - 业务错误: { code: number, message: string, error: string }
 *   - 网络/系统错误: null
 * @throws {Error} 当网络请求失败时不抛出异常，而是返回null或错误对象
 *
 * @example
 * const data = await getBangumiData('123456');
 * if (data && data.code === 0) {
 *   console.log(`找到 ${data.filtered_count} 部正在播出的番剧`);
 * }
 */
export async function getBangumiData(uid) {
  const sanitizedUID = normalizeUID(uid);
  const cached = getCachedBangumi(sanitizedUID);
  if (cached) {
    return cached;
  }

  // 使用请求去重，防止并发相同请求
  return dedupManager.dedupe(`bangumi:${sanitizedUID}`, async () => {
    try {
      console.log(`🔍 获取用户 ${sanitizedUID} 的追番数据`);
      const url = `${BILIBILI_API_BASE_URL}/x/space/bangumi/follow/list?type=1&follow_status=0&vmid=${sanitizedUID}&pn=1&ps=30`;

      const response = await activeHttpClient.get(url);

      // 检查B站API返回的错误码
      if (response.data.code !== BILIBILI_API_SUCCESS_CODE) {
        console.warn(
          `⚠️ B站API返回业务错误: code=${response.data.code}, message=${response.data.message}`
        );

        // 特殊处理一些常见错误
        if (response.data.code === BILIBILI_PRIVACY_ERROR_CODE) {
          return {
            error: 'Privacy Settings',
            message: '该用户的追番列表已设为隐私，无法获取',
            code: response.data.code,
          };
        }

        // 返回原始错误
        return response.data;
      }

      const data = filterAiringBangumi(response.data, sanitizedUID);
      setCachedBangumi(sanitizedUID, data);
      return data;
    } catch (err) {
      console.error(`❌ 获取追番数据失败:`, err);
      if (err.response) {
        return {
          error: 'Bilibili API Error',
          message: `B站API返回错误: ${err.response.status}`,
          details: err.response.data,
        };
      }
      return null;
    }
  });
}

export function __setBangumiHttpClientForTest(client) {
  activeHttpClient = client || httpClient;
}

export function __clearBangumiCacheForTest() {
  bangumiCache.clear();
}

export function __getBangumiCacheSizeForTest() {
  return bangumiCache.size;
}
