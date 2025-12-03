// utils/security.cjs
// 输入校验与安全相关的通用工具函数

const net = require('node:net');
const { normalizeIPAddress } = require('./ip.cjs');

function validateUID(uid) {
  return /^\d{1,20}$/.test(String(uid || '').trim());
}

/**
 * 检测给定的主机名或IP地址是否为私有/本地地址
 * 
 * @param {string} hostname - 主机名或IP地址
 * @returns {boolean} true表示私有/本地地址，false表示公网地址
 */
function isPrivateIPAddress(hostname) {
  if (!hostname) return true;

  const normalized = normalizeIPAddress(hostname);
  const ipVersion = net.isIP(normalized);

  // 不是有效 IP，可能是域名
  if (ipVersion === 0) {
    const lower = hostname.toLowerCase();
    // 只处理已知的本地主机名
    if (lower === 'localhost' || lower.endsWith('.local')) {
      return true;
    }
    // 对于其他域名，检查应该在 DNS 解析后进行
    // 这里假设是公网域名
    return false;
  }

  // 检查 IPv4 私有地址范围
  if (ipVersion === 4) {
    const parts = normalized.split('.').map(Number);
    return (
      parts[0] === 10 || // 10.0.0.0/8
      parts[0] === 127 || // 127.0.0.0/8 (loopback)
      (parts[0] === 192 && parts[1] === 168) || // 192.168.0.0/16
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
      (parts[0] === 169 && parts[1] === 254) || // 169.254.0.0/16 (link-local)
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || // 100.64.0.0/10 (CGNAT)
      parts[0] === 0 // 0.0.0.0/8
    );
  }

  // 检查 IPv6 私有/本地地址范围
  if (ipVersion === 6) {
    const lower = normalized.toLowerCase();
    return (
      lower === '::1' || // Loopback
      lower.startsWith('fe80:') || // Link-local
      lower.startsWith('fc00:') || // Unique local
      lower.startsWith('fd00:') || // Unique local
      lower === '::' // Unspecified
    );
  }

  return false;
}

function validateExternalSource(urlString) {
  try {
    const parsed = new URL(urlString);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '仅支持 http/https 协议';
    }
    if (isPrivateIPAddress(parsed.hostname)) {
      return '不允许访问私有或本地地址';
    }
    return null;
  } catch {
    return 'URL格式无效';
  }
}

module.exports = {
  validateUID,
  isPrivateIPAddress,
  validateExternalSource,
  normalizeIPAddress,
};
