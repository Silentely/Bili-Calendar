// utils/ip.cjs
// IP 地址解析和清理工具 (CommonJS)

/**
 * 从请求对象中提取并清理客户端IP地址
 * 处理代理转发和IPv6地址格式
 * @param {Object} req - Express 请求对象
 * @returns {string} 清理后的IP地址
 */
function extractClientIP(req) {
  // 优先从 x-forwarded-for 获取IP (处理代理情况)
  let ip =
    req.headers['x-forwarded-for'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress ||
    '';

  // 转换为字符串并处理多IP情况 (x-forwarded-for 可能包含多个IP)
  ip = ip.toString().split(',')[0].trim();

  // 移除IPv6前缀 (例如：::ffff:127.0.0.1 -> 127.0.0.1)
  if (ip.includes('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }

  return ip;
}

/**
 * 生成简单的请求ID
 * @param {Object} req - Express 请求对象
 * @returns {string} 请求ID
 */
function generateRequestId(req) {
  // 优先使用现有的 x-request-id
  const existingId = req.headers['x-request-id'];
  if (existingId) {
    return String(existingId);
  }

  // 生成新的请求ID (时间戳+随机字符串)
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  extractClientIP,
  generateRequestId,
};
