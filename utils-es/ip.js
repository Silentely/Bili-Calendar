// @ts-nocheck
// utils-es/ip.js
// IP 地址解析和清理工具（ESM 版本）

import net from 'node:net';

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

  // 处理 IPv4-mapped IPv6 地址（点分十进制 ::ffff:127.0.0.1 或 WHATWG URL 规范化的十六进制 ::ffff:7f00:1）
  const mappedMatch = ip.match(/^::ffff:(.+)$/i);
  if (mappedMatch) {
    const rest = mappedMatch[1];
    if (net.isIPv4(rest)) {
      return rest;
    }
    const hexParts = rest.split(':');
    if (hexParts.length === 2) {
      const high = parseInt(hexParts[0], 16);
      const low = parseInt(hexParts[1], 16);
      if (!isNaN(high) && !isNaN(low) && high >= 0 && high <= 0xffff && low >= 0 && low <= 0xffff) {
        const b1 = (high >> 8) & 0xff;
        const b2 = high & 0xff;
        const b3 = (low >> 8) & 0xff;
        const b4 = low & 0xff;
        return `${b1}.${b2}.${b3}.${b4}`;
      }
    }
  }

  return ip;
}

/**
 * 从请求对象中提取并清理客户端 IP
 *
 * 优先级：
 * 1. Express trust proxy 解析结果（req.ips / req.ip）
 * 2. 若处于可信代理/平台环境，信任边缘注入真实 IP（Netlify / Cloudflare 等）
 * 3. 直连 socket remoteAddress
 * 4. 非代理环境下的平台头作为降级（如无 socket 信息的无状态或模拟测试环境）
 * 5. 可信代理环境下的 X-Forwarded-For 最左侧
 * 6. remote-addr 低可信度兜底
 *
 * @param {import('express').Request|object} req
 * @returns {string}
 */
export function extractClientIP(req) {
  if (!req) return '';

  const candidates = [];

  if (Array.isArray(req.ips) && req.ips.length > 0) {
    candidates.push(...req.ips);
  }

  if (req.ip) {
    candidates.push(req.ip);
  }

  const platformHeaders = [
    'x-nf-client-connection-ip', // Netlify
    'cf-connecting-ip', // Cloudflare
    'true-client-ip', // Akamai 等
  ];

  const directAddress =
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.connection?.socket?.remoteAddress;

  const trustedProxy = isTrustedProxyEnvironment();

  // 1. 若处于可信代理/平台环境，优先信任边缘层写入的平台头
  if (trustedProxy) {
    for (const name of platformHeaders) {
      const value = firstForwardedIP(getHeaderValue(req.headers, name));
      if (value) candidates.push(value);
    }
  }

  // 2. 直连 socket 地址：非代理环境下具有最高可信度，防止客户端伪造平台头绕过限流
  if (directAddress) {
    candidates.push(directAddress);
  }

  // 3. 非代理环境但在缺少直连 socket 时（如 Mock 或 Serverless 事件），平台头作为候选
  if (!trustedProxy) {
    for (const name of platformHeaders) {
      const value = firstForwardedIP(getHeaderValue(req.headers, name));
      if (value) candidates.push(value);
    }
  }

  // 仅在仍无候选且处于可信代理/平台环境时，使用 X-Forwarded-For 最左侧
  if (candidates.length === 0 && trustedProxy) {
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

export function generateRequestId(req) {
  const existingId = req?.headers?.['x-request-id'];
  if (existingId) {
    return String(existingId);
  }
  // 基于时间戳和随机数生成唯一请求ID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
