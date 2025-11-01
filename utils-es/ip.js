// utils-es/ip.js
function pickFirstIp(value) {
  if (!value) return null;
  const first = String(value)
    .split(',')
    .map((item) => item.trim())
    .find(Boolean);
  return first || null;
}

function stripPort(ip) {
  if (!ip) return null;
  let clean = String(ip).trim();
  if (!clean) return null;

  // IPv6 地址带端口时通常为 [addr]:port
  if (clean.startsWith('[')) {
    const closing = clean.indexOf(']');
    if (closing !== -1) {
      clean = clean.slice(1, closing);
    }
  } else {
    const colonCount = (clean.match(/:/g) || []).length;
    if (colonCount === 1) {
      // 仅有一个冒号，视为 IPv4:port 组合
      clean = clean.slice(0, clean.lastIndexOf(':'));
    }
  }

  // 处理 ::ffff:127.0.0.1 形式的 IPv4 映射地址
  if (clean.startsWith('::ffff:')) {
    clean = clean.replace(/^::ffff:/i, '');
  }

  return clean || null;
}

function resolveIp(req) {
  const headerCandidates = [
    pickFirstIp(req.headers['x-forwarded-for']),
    pickFirstIp(req.headers['x-real-ip']),
    pickFirstIp(req.headers['cf-connecting-ip']),
    pickFirstIp(req.headers['true-client-ip']),
    pickFirstIp(req.headers['x-client-ip']),
    pickFirstIp(req.headers['fastly-client-ip']),
  ];

  for (const candidate of headerCandidates) {
    const normalized = stripPort(candidate);
    if (normalized) return normalized;
  }

  const socketCandidates = [
    req.connection?.remoteAddress,
    req.socket?.remoteAddress,
    req.connection?.socket?.remoteAddress,
    req.ip,
  ];

  for (const candidate of socketCandidates) {
    const normalized = stripPort(candidate);
    if (normalized) return normalized;
  }

  return 'unknown';
}

export function extractClientIP(req) {
  return resolveIp(req);
}

export function generateRequestId(req) {
  const existingId = req.headers['x-request-id'];
  if (existingId) {
    return String(existingId);
  }
  // 基于时间戳和随机数生成唯一请求ID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
