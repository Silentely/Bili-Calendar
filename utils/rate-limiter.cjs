// utils/rate-limiter.cjs
// 速率限制器 (CommonJS)

/**
 * 创建基于内存的速率限制器实例
 *
 * 该限制器使用内存存储来追踪每个IP地址的请求次数。
 * 注意：在无状态环境（如Netlify Functions）中，内存会在函数调用之间重置。
 * 在生产环境中建议使用Redis等持久化存储。
 *
 * 环境变量配置:
 * - API_RATE_LIMIT: 时间窗口内允许的最大请求次数（默认: 3）
 * - API_RATE_WINDOW: 时间窗口大小，单位毫秒（默认: 3600000 = 1小时）
 * - ENABLE_RATE_LIMIT: 是否启用限流（默认: true，设为'false'禁用）
 *
 * @returns {Object} 速率限制器实例，包含以下方法:
 *   - check(ip): 检查IP是否超出限制并自动递增计数
 *   - getRemainingRequests(ip): 获取IP的剩余可用请求次数
 *   - getResetTime(ip): 获取IP限制重置的时间戳
 *   - cleanup(now): 清理过期的限流记录
 *
 * @example
 * const rateLimiter = createRateLimiter();
 * if (!rateLimiter.check('192.168.1.1')) {
 *   console.log('请求过于频繁');
 * }
 */

const DEFAULT_MAX_REQUESTS = 3;
const DEFAULT_TIME_WINDOW = 60 * 60 * 1000;

/**
 * 解析整型环境变量，确保数值合法
 */
function parseIntEnv(name, def, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name];
  if (raw == null || raw === '') return def;
  const n = Number.parseInt(String(raw), 10);
  if (Number.isNaN(n)) return def;
  if (n < min || n > max) return def;
  return n;
}

function createRateLimiter() {
  return {
    // 存储结构 { ip: { count: 0, resetTime: timestamp } }
    store: {},

    // 环境变量控制限制
    MAX_REQUESTS: parseIntEnv('API_RATE_LIMIT', DEFAULT_MAX_REQUESTS), // 默认每小时3次
    TIME_WINDOW: parseIntEnv('API_RATE_WINDOW', DEFAULT_TIME_WINDOW), // 默认1小时(毫秒)
    ENABLED: process.env.ENABLE_RATE_LIMIT !== 'false', // 默认启用

    /**
     * 检查IP是否允许请求，如果允许则自动递增计数
     *
     * @param {string} ip - 客户端IP地址
     * @returns {boolean} true表示允许请求，false表示已达到限制
     */
    check(ip) {
      const now = Date.now();

      // 如果功能被禁用，始终允许请求
      if (!this.ENABLED) return true;

      // 初始化或重置过期的限制
      if (!this.store[ip] || now > this.store[ip].resetTime) {
        this.store[ip] = {
          count: 1,
          resetTime: now + this.TIME_WINDOW,
        };
        return true;
      }

      // 检查是否达到限制
      if (this.store[ip].count >= this.MAX_REQUESTS) {
        return false;
      }

      // 递增计数
      this.store[ip].count += 1;
      return true;
    },

    /**
     * 获取IP地址的剩余可用请求次数
     *
     * @param {string} ip - 客户端IP地址
     * @returns {number} 剩余可用请求次数
     */
    getRemainingRequests(ip) {
      const now = Date.now();

      if (!this.store[ip] || now > this.store[ip].resetTime) {
        return this.MAX_REQUESTS;
      }

      return Math.max(0, this.MAX_REQUESTS - this.store[ip].count);
    },

    /**
     * 获取IP地址限制重置的时间戳
     *
     * @param {string} ip - 客户端IP地址
     * @returns {number} 限制重置的Unix时间戳（毫秒）
     */
    getResetTime(ip) {
      const now = Date.now();

      if (!this.store[ip] || now > this.store[ip].resetTime) {
        return now + this.TIME_WINDOW;
      }

      return this.store[ip].resetTime;
    },

    /**
     * 清理过期的限流记录以释放内存
     *
     * 该方法应该定期调用以防止内存泄漏。
     * 在生产环境中，建议使用外部存储（如Redis）的TTL特性自动过期。
     *
     * @param {number} [now=Date.now()] - 当前时间戳，用于测试
     */
    cleanup(now = Date.now()) {
      Object.keys(this.store).forEach((ip) => {
        if (now > this.store[ip].resetTime) {
          delete this.store[ip];
        }
      });
    },
  };
}

module.exports = {
  createRateLimiter,
};
