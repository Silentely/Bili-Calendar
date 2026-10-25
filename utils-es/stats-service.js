// @ts-check
// utils-es/stats-service.js
// 订阅统计持久化服务（支持 Upstash Redis REST KV 与本地降级）

import crypto from 'node:crypto';

/**
 * @typedef {Object} StatsResult
 * @property {number} usersCount - 独立 UID 总数
 * @property {number} pullsCount - 累计日历拉取成功总次数
 */

export class StatsService {
  /**
   * @param {Object} [options]
   * @param {string} [options.url]
   * @param {string} [options.token]
   * @param {number} [options.cacheTtlMs]
   */
  constructor(options = {}) {
    this.optionsUrl = options.url || '';
    this.optionsToken = options.token || '';
    this.cacheTtlMs = options.cacheTtlMs ?? 10000;

    /** @type {StatsResult|null} */
    this.cachedStats = null;
    this.cacheExpiresAt = 0;

    // 内存降级存储
    this.localUids = new Set();
    this.localPulls = 0;
  }

  /**
   * 获取远程 KV 服务地址（动态获取支持运行时环境变量注入）
   * @returns {string}
   */
  getUrl() {
    let raw = (
      this.optionsUrl ||
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.KV_REST_API_URL ||
      ''
    ).trim();

    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1).trim();
    }

    if (raw && !raw.startsWith('http://') && !raw.startsWith('https://')) {
      raw = `https://${raw}`;
    }

    while (raw.endsWith('/')) {
      raw = raw.slice(0, -1);
    }
    return raw;
  }

  /**
   * 获取远程 KV 访问令牌
   * @returns {string}
   */
  getToken() {
    let t = (
      this.optionsToken ||
      process.env.UPSTASH_REDIS_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN ||
      ''
    ).trim();

    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      t = t.slice(1, -1).trim();
    }

    return t;
  }

  /**
   * 重置本地降级状态与缓存（主要用于测试）
   */
  reset() {
    this.localUids.clear();
    this.localPulls = 0;
    this.cachedStats = null;
    this.cacheExpiresAt = 0;
  }

  /**
   * 生成 UID 的伪匿名哈希（保护隐私，截取前 16 位十六进制）
   * @param {string|number} uid
   * @returns {string}
   */
  hashUid(uid) {
    return crypto.createHash('sha256').update(String(uid).trim()).digest('hex').slice(0, 16);
  }

  /**
   * 获取基础预设计数值（支持环境变量偏移，方便平滑迁移历史累计）
   */
  getBaseCounts() {
    const rawUsers = (process.env.STATS_BASE_USERS || '').trim();
    const rawPulls = (process.env.STATS_BASE_PULLS || '').trim();
    const parsedUsers = parseInt(rawUsers, 10);
    const parsedPulls = parseInt(rawPulls, 10);
    const baseUsers = Number.isSafeInteger(parsedUsers) && parsedUsers > 0 ? parsedUsers : 0;
    const basePulls = Number.isSafeInteger(parsedPulls) && parsedPulls > 0 ? parsedPulls : 0;
    return { baseUsers, basePulls };
  }

  /**
   * 记录一次日历成功拉取
   * @param {string|number} uid
   * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
   * @returns {Promise<boolean>}
   */
  async recordPull(uid, options = {}) {
    if (!uid) return false;
    const uidHash = this.hashUid(uid);

    // 总是先更新内存降级存储
    this.localUids.add(uidHash);
    this.localPulls += 1;

    const url = this.getUrl();
    const token = this.getToken();

    // 如果未配置远程 KV，直接完成本地计数
    if (!url || !token) {
      return true;
    }

    const { signal: externalSignal, timeoutMs = 1500 } = options;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const requestSignal = externalSignal
      ? AbortSignal.any([externalSignal, timeoutSignal])
      : timeoutSignal;

    try {
      const pipelineUrl = `${url}/pipeline`;
      const commands = [
        ['INCR', 'bili_calendar:total_pulls'],
        ['SADD', 'bili_calendar:unique_uids', uidHash],
      ];

      const res = await fetch(pipelineUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
        signal: requestSignal,
      });

      if (!res.ok) {
        console.warn(`⚠️ 统计上报失败 (HTTP ${res.status})`);
        return false;
      }

      /** @type {unknown} */
      const data = await res.json();
      if (
        Array.isArray(data) &&
        data.some((item) => item && typeof item === 'object' && 'error' in item)
      ) {
        const errorMsgs = data
          .filter((item) => item?.error)
          .map((item) => item.error)
          .join('; ');
        console.warn(`⚠️ Upstash 命令级错误: ${errorMsgs}`);
        return false;
      }

      // 上报成功后主动使本地缓存失效，确保下一次查询能即时反映最新数据
      this.cachedStats = null;
      return true;
    } catch (err) {
      // 容错日志，绝不抛出异常中断正常业务
      console.warn(`⚠️ 远程统计上报异常:`, err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /**
   * 查询当前累计统计数据
   * @returns {Promise<StatsResult>}
   */
  async getStats() {
    const { baseUsers, basePulls } = this.getBaseCounts();
    const url = this.getUrl();
    const token = this.getToken();

    // 未配置远程 KV 时，直接返回新鲜的本地降级数据
    if (!url || !token) {
      return {
        usersCount: baseUsers + this.localUids.size,
        pullsCount: basePulls + this.localPulls,
      };
    }

    const now = Date.now();
    if (this.cachedStats && now < this.cacheExpiresAt) {
      return this.cachedStats;
    }

    try {
      const pipelineUrl = `${url}/pipeline`;
      const commands = [
        ['SCARD', 'bili_calendar:unique_uids'],
        ['GET', 'bili_calendar:total_pulls'],
      ];

      const res = await fetch(pipelineUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(2000),
      });

      if (res.ok) {
        /** @type {unknown} */
        const data = await res.json();
        if (
          Array.isArray(data) &&
          !data.some((item) => item && typeof item === 'object' && 'error' in item)
        ) {
          const usersRaw =
            data[0] && typeof data[0] === 'object' && 'result' in data[0]
              ? data[0].result
              : data[0];
          const pullsRaw =
            data[1] && typeof data[1] === 'object' && 'result' in data[1]
              ? data[1].result
              : data[1];

          const remoteUsers = Math.max(0, Number(usersRaw) || 0);
          const remotePulls = Math.max(0, Number(pullsRaw) || 0);

          const result = {
            usersCount: baseUsers + remoteUsers,
            pullsCount: basePulls + remotePulls,
          };

          this.cachedStats = result;
          this.cacheExpiresAt = now + this.cacheTtlMs;
          return result;
        } else {
          console.warn('⚠️ Upstash 查询返回了命令级错误，降级返回');
        }
      }
    } catch (err) {
      console.warn(
        `⚠️ 获取远程统计失败，降级返回本地数据:`,
        err instanceof Error ? err.message : String(err)
      );
    }

    // 失败降级返回本地
    const fallbackResult = {
      usersCount: baseUsers + this.localUids.size,
      pullsCount: basePulls + this.localPulls,
    };
    this.cachedStats = fallbackResult;
    this.cacheExpiresAt = now + Math.min(this.cacheTtlMs, 5000);
    return fallbackResult;
  }
}

const statsService = new StatsService();
export default statsService;
