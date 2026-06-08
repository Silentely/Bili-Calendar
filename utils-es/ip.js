// @ts-nocheck
// utils-es/ip.js
// IP 地址解析和清理工具（ESM 版本）

export function normalizeIPAddress(value = '') {
  let ip = String(value || '').trim();
  if (!ip) return '';

  const zoneIndex = ip.indexOf('%');
  if (zoneIndex >= 0) {
    ip = ip.slice(0, zoneIndex);
  }

  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }

  return ip.replace(/^::ffff:/i, '');
}

export function extractClientIP(req) {
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

  // remote-addr 仅在无其他来源时作为低可信度兜底，可能被客户端伪造
  const fallback = req.headers?.['remote-addr'];
  if (fallback && candidates.length === 0) {
    candidates.push(fallback);
  }

  const ip =
    candidates.find((item) => item && item !== '::1' && item !== '::') || candidates[0] || '';

  return normalizeIPAddress(ip);
}

export function generateRequestId(req) {
  const existingId = req?.headers?.['x-request-id'];
  if (existingId) {
    return String(existingId);
  }
  // 基于时间戳和随机数生成唯一请求ID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
