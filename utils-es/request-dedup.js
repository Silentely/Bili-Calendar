// @ts-nocheck
// utils-es/request-dedup.js
export function createRequestDedup() {
  const activeRequests = new Map();

  return {
    /**
     * 对请求进行去重处理
     * @param {string} key - 请求的唯一标识
     * @param {Function} executor - 执行请求的函数
     * @returns {Promise} 请求结果的Promise
     */
    async dedupe(key, executor) {
      // 检查是否已有相同请求在执行
      if (activeRequests.has(key)) {
        // 如果有相同请求在执行，等待该请求完成
        console.log(`⚡ 请求去重: ${key} (等待现有请求)`);
        return activeRequests.get(key);
      }

      // 创建新请求
      console.log(`🔄 请求去重: ${key} (执行新请求)`);
      const promise = executor().finally(() => {
        // 请求完成后，从活跃请求中移除
        activeRequests.delete(key);
      });

      // 将请求添加到活跃请求映射中
      activeRequests.set(key, promise);

      try {
        const result = await promise;
        return result;
      } catch (error) {
        // 如果请求失败，也要从活跃请求中移除
        activeRequests.delete(key);
        throw error;
      }
    },

    getPendingCount() {
      return activeRequests.size;
    },

    clear() {
      activeRequests.clear();
    },
  };
}
