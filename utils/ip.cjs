// utils/ip.cjs
// IP 地址解析和清理工具 (CommonJS)

/**
 * 统一清理 IP 表示，剔除 IPv6 zone-id、IPv4-mapped 前缀等噪声
 * @param {string} value
 * @returns {string}
 */
function normalizeIPAddress(value = '') {
  let ip = String(value || '').trim();
  if (!ip) return '';

  const zoneIndex = ip.indexOf('%');
  if (zoneIndex >= 0) {
    ip = ip.slice(0, zoneIndex);
  }

  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }

  ip = ip.replace(/^::ffff:/i, '');

  return ip;
}

/**
 * 从请求对象中提取并清理客户端IP地址，遵循 Express trust proxy 配置
 * @param {Object} req - Express 请求对象
 * @returns {string} 清理后的IP地址
 */
function extractClientIP(req) {
  if (!req) return '';

  const candidates = [];

  if (Array.isArray(req.ips) && req.ips.length > 0) {
    candidates.push(...req.ips);
  }

  if (req.ip) {
    candidates.push(req.ip);
  }

  const directAddress =
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress;

  if (directAddress) {
    candidates.push(directAddress);
  }

  const fallback = req.headers?.['remote-addr'];
  if (fallback) {
    candidates.push(fallback);
  }

  const ip =
    candidates.find((item) => item && item !== '::1' && item !== '::') || candidates[0] || '';

  return normalizeIPAddress(ip);
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
  normalizeIPAddress,
};
