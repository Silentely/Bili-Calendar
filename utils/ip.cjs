// utils/ip.cjs
// IP 地址解析和清理工具 (CommonJS)

/**
 * 读取单个请求头（兼容 string | string[]）
 * @param {Record<string, string|string[]|undefined>|undefined} headers
 * @param {string} name
 * @returns {string}
 */
function getHeaderValue(headers, name) {
  if (!headers) return '';
  const raw = headers[name];
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return String(raw || '').trim();
}

/**
 * 从可能含逗号分隔列表的头中取第一个 IP
 * @param {string} value
 * @returns {string}
 */
function firstForwardedIP(value) {
  if (!value) return '';
  return String(value).split(',')[0].trim();
}

/**
 * 是否处于可信代理/平台边缘之后（可安全使用 X-Forwarded-For 兜底）
 * @returns {boolean}
 */
function isTrustedProxyEnvironment() {
  const trust = process.env.TRUST_PROXY;
  if (trust != null && String(trust).trim() !== '') {
    const lowered = String(trust).trim().toLowerCase();
    if (lowered === 'false' || lowered === '0') return false;
    return true;
  }
  // Netlify / AWS Lambda 由平台注入客户端 IP 相关头
  return Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

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
 * 从请求对象中提取并清理客户端IP地址
 *
 * 优先级：
 * 1. Express trust proxy 解析结果（req.ips / req.ip）
 * 2. 平台边缘写入的真实连接 IP（Netlify / Cloudflare 等）
 * 3. 直连 socket remoteAddress
 * 4. 可信代理环境下的 X-Forwarded-For 最左侧
 * 5. remote-addr 低可信度兜底
 *
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

  // 平台注入的真实客户端 IP（边缘层写入，优先于可伪造的通用转发头）
  const platformHeaders = [
    'x-nf-client-connection-ip', // Netlify
    'cf-connecting-ip', // Cloudflare
    'true-client-ip', // Akamai 等
  ];
  for (const name of platformHeaders) {
    const value = firstForwardedIP(getHeaderValue(req.headers, name));
    if (value) candidates.push(value);
  }

  const directAddress =
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress;

  if (directAddress) {
    candidates.push(directAddress);
  }

  // 仅在仍无候选且处于可信代理/平台环境时，使用 X-Forwarded-For 最左侧
  if (candidates.length === 0 && isTrustedProxyEnvironment()) {
    const xff = firstForwardedIP(getHeaderValue(req.headers, 'x-forwarded-for'));
    if (xff) candidates.push(xff);
  }

  // remote-addr 仅在无其他来源时作为低可信度兜底，可能被客户端伪造
  const fallback = getHeaderValue(req.headers, 'remote-addr');
  if (fallback && candidates.length === 0) {
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
  const existingId = req.headers?.['x-request-id'];
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
