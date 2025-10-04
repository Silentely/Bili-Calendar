// utils/rate-limiter.cjs
// 速率限制器 (CommonJS)

/**
 * 创建内存存储的速率限制器
 * @returns {Object} 速率限制器实例
 */
function createRateLimiter() {
  return {
    // 存储结构 { ip: { count: 0, resetTime: timestamp } }
    store: {},

    // 环境变量控制限制
    MAX_REQUESTS: process.env.API_RATE_LIMIT || 3, // 默认每小时3次
    TIME_WINDOW: process.env.API_RATE_WINDOW || 60 * 60 * 1000, // 默认1小时(毫秒)
    ENABLED: process.env.ENABLE_RATE_LIMIT !== 'false', // 默认启用

    // 检查并递增计数
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

    // 获取剩余可用次数
    getRemainingRequests(ip) {
      const now = Date.now();

      if (!this.store[ip] || now > this.store[ip].resetTime) {
        return this.MAX_REQUESTS;
      }

      return Math.max(0, this.MAX_REQUESTS - this.store[ip].count);
    },

    // 获取重置时间
    getResetTime(ip) {
      const now = Date.now();

      if (!this.store[ip] || now > this.store[ip].resetTime) {
        return now + this.TIME_WINDOW;
      }

      return this.store[ip].resetTime;
    },

    // 清理过期的条目 (使用 Object.keys 更高效)
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
