// utils/request-dedup.cjs
// 请求去重工具：防止并发重复请求

/**
 * 创建请求去重管理器
 * 
 * 当多个客户端同时请求相同的资源时，只执行一次实际请求，
 * 其他请求会等待并共享相同的结果。这可以显著减少后端负载。
 * 
 * @returns {Object} 请求去重管理器实例
 * 
 * @example
 * const dedupManager = createRequestDedup();
 * const result = await dedupManager.dedupe('user:123', () => fetchUserData(123));
 */
function createRequestDedup() {
  // 存储正在进行的请求 { key: Promise }
  const pendingRequests = new Map();
  
  return {
    /**
     * 对请求进行去重处理
     * 
     * 如果相同key的请求正在进行，则等待该请求完成并返回相同结果。
     * 否则，执行新请求并缓存Promise供后续请求使用。
     * 
     * @param {string} key - 请求的唯一标识符
     * @param {Function} executor - 返回Promise的执行函数
     * @returns {Promise<*>} 请求结果
     */
    async dedupe(key, executor) {
      // 检查是否有相同的请求正在进行
      if (pendingRequests.has(key)) {
        console.log(`⚡ 请求去重: ${key} (等待现有请求)`);
        return pendingRequests.get(key);
      }
      
      // 执行新请求
      console.log(`🔄 请求去重: ${key} (执行新请求)`);
      const promise = executor()
        .finally(() => {
          // 请求完成后清理缓存
          pendingRequests.delete(key);
        });
      
      // 缓存Promise供其他请求使用
      pendingRequests.set(key, promise);
      
      return promise;
    },
    
    /**
     * 获取当前正在进行的请求数量
     * 
     * @returns {number} 正在进行的请求数量
     */
    getPendingCount() {
      return pendingRequests.size;
    },
    
    /**
     * 清除所有待处理的请求
     * 
     * 注意：这不会取消实际的请求，只是清除内部缓存
     */
    clear() {
      pendingRequests.clear();
    }
  };
}

module.exports = {
  createRequestDedup,
};
