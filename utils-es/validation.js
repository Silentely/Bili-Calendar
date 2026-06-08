// utils-es/validation.js
// 统一的输入验证工具模块（ESM 版本）

import { isPrivateIPAddress } from './security.js';

export const UID_MIN_LENGTH = 1;
export const UID_MAX_LENGTH = 20;
export const UID_PATTERN = /^\d{1,20}$/;
export const ALLOWED_URL_PROTOCOLS = ['http:', 'https:'];

export function validateUID(uid) {
  if (uid === null || uid === undefined || uid === '') {
    return {
      valid: false,
      error: 'UID 不能为空',
      sanitized: null,
    };
  }

  const uidStr = String(uid).trim();
  if (uidStr === '') {
    return {
      valid: false,
      error: 'UID 不能为空',
      sanitized: null,
    };
  }

  if (!UID_PATTERN.test(uidStr)) {
    return {
      valid: false,
      error: 'UID 必须是纯数字',
      sanitized: null,
    };
  }

  if (uidStr.length < UID_MIN_LENGTH || uidStr.length > UID_MAX_LENGTH) {
    return {
      valid: false,
      error: `UID 长度必须在 ${UID_MIN_LENGTH}-${UID_MAX_LENGTH} 位之间`,
      sanitized: null,
    };
  }

  return {
    valid: true,
    error: null,
    sanitized: uidStr,
  };
}

export function validateURL(url, options = {}) {
  const { allowPrivateIP = false } = options;

  if (!url || typeof url !== 'string') {
    return {
      valid: false,
      error: 'URL 不能为空',
      parsed: null,
    };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return {
      valid: false,
      error: 'URL 格式无效',
      parsed: null,
    };
  }

  if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
    return {
      valid: false,
      error: `不支持的协议: ${parsed.protocol}`,
      parsed: null,
    };
  }

  if (!allowPrivateIP && isPrivateIPAddress(parsed.hostname)) {
    return {
      valid: false,
      error: '不允许访问私有 IP 地址',
      parsed: null,
    };
  }

  return {
    valid: true,
    error: null,
    parsed,
  };
}

export function validateArray(arr, fieldName = '数组') {
  if (!Array.isArray(arr)) {
    return {
      valid: false,
      error: `${fieldName} 必须是数组类型`,
    };
  }

  if (arr.length === 0) {
    return {
      valid: false,
      error: `${fieldName} 不能为空`,
    };
  }

  return {
    valid: true,
    error: null,
  };
}

export function validateStringLength(str, min, max, fieldName = '字符串') {
  if (typeof str !== 'string') {
    return {
      valid: false,
      error: `${fieldName} 必须是字符串类型`,
    };
  }

  const length = str.length;
  if (length < min || length > max) {
    return {
      valid: false,
      error: `${fieldName} 长度必须在 ${min}-${max} 之间`,
    };
  }

  return {
    valid: true,
    error: null,
  };
}

export function validateEnum(value, allowedValues, fieldName = '字段') {
  if (!allowedValues.includes(value)) {
    return {
      valid: false,
      error: `${fieldName} 的值必须是: ${allowedValues.join(', ')}`,
    };
  }

  return {
    valid: true,
    error: null,
  };
}

export default {
  validateUID,
  validateURL,
  validateArray,
  validateStringLength,
  validateEnum,
  UID_MIN_LENGTH,
  UID_MAX_LENGTH,
  UID_PATTERN,
  ALLOWED_URL_PROTOCOLS,
};
