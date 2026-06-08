// @ts-nocheck
// utils-es/security.js
// 输入校验与安全相关的通用工具函数（ESM 版本）

import net from 'node:net';
import { normalizeIPAddress } from './ip.js';

/**
 * 快速校验 UID 是否为合法数字格式（1-20位纯数字）
 * 与 validation.js 的 validateUID 不同：此版本返回布尔值，用于简单守卫判断
 */
export function isValidUID(uid) {
  return /^\d{1,20}$/.test(String(uid || '').trim());
}

/** @deprecated 请使用 isValidUID，与 validation.js 的 validateUID 区分 */
export const validateUID = isValidUID;

export function isPrivateIPAddress(hostname) {
  if (!hostname) return true;

  const normalized = normalizeIPAddress(hostname);
  const ipVersion = net.isIP(normalized);

  if (ipVersion === 0) {
    const lower = String(hostname).toLowerCase();
    if (lower === 'localhost' || lower.endsWith('.local')) {
      return true;
    }
    return false;
  }

  if (ipVersion === 4) {
    const parts = normalized.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
      parts[0] === 0
    );
  }

  if (ipVersion === 6) {
    const lower = normalized.toLowerCase();
    return (
      lower === '::1' ||
      lower.startsWith('fe80:') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe') ||
      lower === '::'
    );
  }

  return false;
}

export function validateExternalSource(urlString) {
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

export default {
  isValidUID,
  validateUID,
  isPrivateIPAddress,
  validateExternalSource,
  normalizeIPAddress,
};
