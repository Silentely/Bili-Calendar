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
    this.url =
      options.url || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
    this.token =
      options.token || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
    this.cacheTtlMs = options.cacheTtlMs ?? 60000;

    /** @type {StatsResult|null} */
    this.cachedStats = null;
    this.cacheExpiresAt = 0;

    // 内存降级存储
    this.localUids = new Set();
    this.localPulls = 0;
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
   * 生成 UID 的匿名哈希（保护隐私，截取前 16 位十六进制）
   * @param {string|number} uid
   * @returns {string}
   */
  hashUid(uid) {
    return crypto.createHash('sha256').update(String(uid).trim()).digest('hex').slice(0, 16);
  }

  /**
   * 获取基础预设计数值（支持环境变量偏移，方便平滑迁移历史累计）
   */
  getCleanUrl() {
    let u = this.url.trim();
    while (u.endsWith('/')) {
      u = u.slice(0, -1);
    }
    return u;
  }

  getBaseCounts() {
    const baseUsers = Math.max(0, parseInt(process.env.STATS_BASE_USERS || '0', 10) || 0);
    const basePulls = Math.max(0, parseInt(process.env.STATS_BASE_PULLS || '0', 10) || 0);
    return { baseUsers, basePulls };
  }

  /**
   * 记录一次日历成功拉取
   * @param {string|number} uid
   * @returns {Promise<void>}
   */
  async recordPull(uid) {
    if (!uid) return;
    const uidHash = this.hashUid(uid);

    // 总是先更新内存降级存储
    this.localUids.add(uidHash);
    this.localPulls += 1;

    // 如果未配置远程 KV，直接返回
    if (!this.url || !this.token) {
      return;
    }

    try {
      const pipelineUrl = `${this.getCleanUrl()}/pipeline`;
      const commands = [
        ['INCR', 'bili_calendar:total_pulls'],
        ['SADD', 'bili_calendar:unique_uids', uidHash],
      ];

      const res = await fetch(pipelineUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(3000),
      });

      if (!res.ok) {
        console.warn(`⚠️ 统计上报失败 (HTTP ${res.status})`);
      }
    } catch (err) {
      // 容错日志，绝不抛出异常阻断正常业务
      console.warn(`⚠️ 远程统计上报异常:`, err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * 查询当前累计统计数据
   * @returns {Promise<StatsResult>}
   */
  async getStats() {
    const now = Date.now();
    if (this.cachedStats && now < this.cacheExpiresAt) {
      return this.cachedStats;
    }

    const { baseUsers, basePulls } = this.getBaseCounts();

    // 未配置远程 KV，使用本地降级数据
    if (!this.url || !this.token) {
      const result = {
        usersCount: baseUsers + this.localUids.size,
        pullsCount: basePulls + this.localPulls,
      };
      this.cachedStats = result;
      this.cacheExpiresAt = now + this.cacheTtlMs;
      return result;
    }

    try {
      const pipelineUrl = `${this.getCleanUrl()}/pipeline`;
      const commands = [
        ['SCARD', 'bili_calendar:unique_uids'],
        ['GET', 'bili_calendar:total_pulls'],
      ];

      const res = await fetch(pipelineUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        /** @type {Array<{result: unknown}|unknown>} */
        const data = await res.json();
        const usersRaw =
          data[0] && typeof data[0] === 'object' && 'result' in data[0] ? data[0].result : data[0];
        const pullsRaw =
          data[1] && typeof data[1] === 'object' && 'result' in data[1] ? data[1].result : data[1];

        const remoteUsers = Math.max(0, Number(usersRaw) || 0);
        const remotePulls = Math.max(0, Number(pullsRaw) || 0);

        const result = {
          usersCount: baseUsers + remoteUsers,
          pullsCount: basePulls + remotePulls,
        };

        this.cachedStats = result;
        this.cacheExpiresAt = now + this.cacheTtlMs;
        return result;
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
    this.cacheExpiresAt = now + Math.min(this.cacheTtlMs, 10000); // 降级缓存 10 秒后重试
    return fallbackResult;
  }
}

const statsService = new StatsService();
export default statsService;
