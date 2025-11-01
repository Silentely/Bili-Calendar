// utils/bangumi.cjs (CommonJS)
const { httpClient } = require('./http.cjs');
const { BILIBILI_API_BASE_URL, BILIBILI_API_SUCCESS_CODE, BILIBILI_PRIVACY_ERROR_CODE } = require('./constants.cjs');
const { createRequestDedup } = require('./request-dedup.cjs');

// 创建请求去重管理器实例
const dedupManager = createRequestDedup();

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
async function getBangumiData(uid) {
  // 使用请求去重，防止并发相同请求
  return dedupManager.dedupe(`bangumi:${uid}`, async () => {
    try {
      console.log(`🔍 获取用户 ${uid} 的追番数据`);
      const url = `${BILIBILI_API_BASE_URL}/x/space/bangumi/follow/list?type=1&follow_status=0&vmid=${uid}&pn=1&ps=30`;

      const response = await httpClient.get(url);

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

      // 如果API返回成功，过滤出正在播出的番剧
      if (response.data.data && response.data.data.list) {
        const originalCount = response.data.data.list.length;

        const currentlyAiring = response.data.data.list.filter((bangumi) => {
          const isOngoing = bangumi.is_finish === 0;
          const hasBroadcastInfo =
            (bangumi.pub_index && bangumi.pub_index.trim() !== '') ||
            (bangumi.renewal_time && bangumi.renewal_time.trim() !== '') ||
            (bangumi.new_ep && bangumi.new_ep.pub_time && bangumi.new_ep.pub_time.trim() !== '');
          return isOngoing && hasBroadcastInfo;
        });

        response.data.data.list = currentlyAiring;
        console.log(
          `📊 [UID:${uid}] 总共 ${originalCount} 部番剧，过滤后 ${currentlyAiring.length} 部正在播出`
        );
        response.data.filtered = true;
        response.data.filtered_count = currentlyAiring.length;
        response.data.original_count = originalCount;
      }

      return response.data;
    } catch (err) {
      console.error(`❌ 获取追番数据失败:`, err);
      
      // 增强错误处理，提供更详细的诊断信息
      if (err.response) {
        // HTTP响应错误
        const status = err.response.status;
        const statusText = err.response.statusText;
        const data = err.response.data;
        
        console.error(`📡 HTTP错误详情:`, {
          status,
          statusText,
          url: err.config?.url,
          method: err.config?.method,
          headers: err.response.headers,
          data
        });
        
        return {
          error: 'Bilibili API Error',
          message: `B站API返回错误: ${status} ${statusText}`,
          details: data,
          status,
          url: err.config?.url,
          retryable: status >= 500 || status === 429, // 5xx和429错误可重试
        };
      } else if (err.request) {
        // 网络错误 - 请求发送但没有收到响应
        const errorCode = err.code;
        const errorMessage = err.message;
        
        console.error(`🌐 网络错误详情:`, {
          code: errorCode,
          message: errorMessage,
          url: err.config?.url,
          method: err.config?.method,
          timeout: err.config?.timeout,
          isNetworkError: true
        });
        
        return {
          error: 'Network Error',
          message: `网络连接失败: ${errorMessage}`,
          code: errorCode,
          details: {
            url: err.config?.url,
            method: err.config?.method,
            timeout: err.config?.timeout,
          },
          retryable: ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'EHOSTUNREACH'].includes(errorCode),
        };
      } else {
        // 其他错误 - 请求配置或处理错误
        console.error(`⚙️ 请求配置错误:`, {
          message: err.message,
          url: err.config?.url,
          method: err.config?.method,
        });
        
        return {
          error: 'Request Error',
          message: `请求配置错误: ${err.message}`,
          details: {
            url: err.config?.url,
            method: err.config?.method,
          },
          retryable: false,
        };
      }
      
      // 如果都无法识别，返回null
      console.error(`❓ 未知错误类型:`, err);
      return null;
    }
  });
}

module.exports = {
  getBangumiData,
};
