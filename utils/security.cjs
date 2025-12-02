// utils/security.cjs
// 输入校验与安全相关的通用工具函数

function validateUID(uid) {
  return /^\d{1,20}$/.test(String(uid || '').trim());
}

function isPrivateIPAddress(hostname) {
  if (!hostname) return true;
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '0.0.0.0' || lower === '::1') return true;
  if (lower.endsWith('.local')) return true;
  const ipv4Match = lower.match(/^\d{1,3}(?:\.\d{1,3}){3}$/);
  if (ipv4Match) {
    const parts = lower.split('.').map((n) => Number.parseInt(n, 10));
    if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    return false;
  }
  if (lower.includes('::')) {
    // 粗略阻止 IPv6 本地/链路地址
    return lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd') || lower === '::1';
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
};
