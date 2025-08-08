// utils/bangumi.cjs (CommonJS)
const { httpClient } = require('./http.cjs');

/**
 * 获取B站用户追番数据
 * @param {string} uid - B站用户UID
 * @returns {Promise<Object|null>} B站API返回的数据或null（出错时）
 */
async function getBangumiData(uid) {
  try {
    console.log(`🔍 获取用户 ${uid} 的追番数据`);
    const url = `https://api.bilibili.com/x/space/bangumi/follow/list?type=1&follow_status=0&vmid=${uid}&pn=1&ps=30`;

    const response = await httpClient.get(url);

    // 检查B站API返回的错误码
    if (response.data.code !== 0) {
      console.warn(
        `⚠️ B站API返回业务错误: code=${response.data.code}, message=${response.data.message}`
      );

      // 特殊处理一些常见错误
      if (response.data.code === 53013) {
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
    if (err.response) {
      return {
        error: 'Bilibili API Error',
        message: `B站API返回错误: ${err.response.status}`,
        details: err.response.data,
      };
    }
    return null;
  }
}

module.exports = {
  getBangumiData,
};
