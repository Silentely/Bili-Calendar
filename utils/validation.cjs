// utils/validation.cjs
// 统一的输入验证工具模块（CommonJS 版本）

// ==================== 常量定义 ====================

/**
 * UID 验证规则常量
 */
const UID_MIN_LENGTH = 1;
const UID_MAX_LENGTH = 20;
const UID_PATTERN = /^\d{1,20}$/; // 纯数字，1-20位

/**
 * URL 验证规则常量
 */
const ALLOWED_URL_PROTOCOLS = ['http:', 'https:'];
const BLOCKED_PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^localhost$/i,
];

// ==================== 验证函数 ====================

/**
 * 验证 B站用户 UID
 *
 * 验证规则：
 * 1. 不能为空（null, undefined, ''）
 * 2. 必须是纯数字字符串或数字类型
 * 3. 长度必须在 1-20 位之间
 *
 * @param {string|number} uid - 待验证的 UID
 * @returns {Object} 验证结果
 *   - valid: boolean - 是否通过验证
 *   - error: string | null - 错误信息（验证通过时为 null）
 *   - sanitized: string | null - 清理后的值（验证失败时为 null）
 *
 * @example
 * validateUID('123456')
 * // => { valid: true, error: null, sanitized: '123456' }
 *
 * validateUID('abc123')
 * // => { valid: false, error: 'UID 必须是纯数字', sanitized: null }
 *
 * validateUID(null)
 * // => { valid: false, error: 'UID 不能为空', sanitized: null }
 */
function validateUID(uid) {
  // 检查空值
  if (uid === null || uid === undefined || uid === '') {
    return {
      valid: false,
      error: 'UID 不能为空',
      sanitized: null,
    };
  }

  // 转换为字符串（支持数字类型输入）
  const uidStr = String(uid).trim();

  // 检查是否为空字符串（去除空格后）
  if (uidStr === '') {
    return {
      valid: false,
      error: 'UID 不能为空',
      sanitized: null,
    };
  }

  // 检查是否为纯数字
  if (!UID_PATTERN.test(uidStr)) {
    return {
      valid: false,
      error: 'UID 必须是纯数字',
      sanitized: null,
    };
  }

  // 检查长度
  if (uidStr.length < UID_MIN_LENGTH || uidStr.length > UID_MAX_LENGTH) {
    return {
      valid: false,
      error: `UID 长度必须在 ${UID_MIN_LENGTH}-${UID_MAX_LENGTH} 位之间`,
      sanitized: null,
    };
  }

  // 验证通过
  return {
    valid: true,
    error: null,
    sanitized: uidStr,
  };
}

/**
 * 验证 URL 格式和安全性
 *
 * 验证规则：
 * 1. 必须是有效的 URL 格式
 * 2. 协议必须是 http 或 https
 * 3. 不能指向私有 IP 地址（防止 SSRF 攻击）
 *
 * @param {string} url - 待验证的 URL
 * @param {Object} options - 验证选项
 *   - allowPrivateIP: boolean - 是否允许私有 IP（默认：false）
 * @returns {Object} 验证结果
 *   - valid: boolean - 是否通过验证
 *   - error: string | null - 错误信息
 *   - parsed: URL | null - 解析后的 URL 对象
 *
 * @example
 * validateURL('https://example.com')
 * // => { valid: true, error: null, parsed: URL {...} }
 *
 * validateURL('http://127.0.0.1')
 * // => { valid: false, error: '不允许访问私有 IP 地址', parsed: null }
 */
function validateURL(url, options = {}) {
  const { allowPrivateIP = false } = options;

  // 检查空值
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
  } catch (err) {
    return {
      valid: false,
      error: 'URL 格式无效',
      parsed: null,
    };
  }

  // 检查协议
  if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
    return {
      valid: false,
      error: `不支持的协议: ${parsed.protocol}`,
      parsed: null,
    };
  }

  // 检查私有 IP（SSRF 防护）
  if (!allowPrivateIP) {
    const hostname = parsed.hostname;
    for (const pattern of BLOCKED_PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return {
          valid: false,
          error: '不允许访问私有 IP 地址',
          parsed: null,
        };
      }
    }
  }

  return {
    valid: true,
    error: null,
    parsed,
  };
}

/**
 * 验证数组非空
 *
 * @param {Array} arr - 待验证的数组
 * @param {string} fieldName - 字段名称（用于错误信息）
 * @returns {Object} 验证结果
 *
 * @example
 * validateArray([1, 2, 3], 'items')
 * // => { valid: true, error: null }
 *
 * validateArray([], 'items')
 * // => { valid: false, error: 'items 不能为空' }
 */
function validateArray(arr, fieldName = '数组') {
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

/**
 * 验证字符串长度
 *
 * @param {string} str - 待验证的字符串
 * @param {number} min - 最小长度
 * @param {number} max - 最大长度
 * @param {string} fieldName - 字段名称（用于错误信息）
 * @returns {Object} 验证结果
 *
 * @example
 * validateStringLength('Hello', 1, 10, 'username')
 * // => { valid: true, error: null }
 *
 * validateStringLength('', 1, 10, 'username')
 * // => { valid: false, error: 'username 长度必须在 1-10 之间' }
 */
function validateStringLength(str, min, max, fieldName = '字符串') {
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

/**
 * 验证枚举值
 *
 * @param {any} value - 待验证的值
 * @param {Array} allowedValues - 允许的值列表
 * @param {string} fieldName - 字段名称（用于错误信息）
 * @returns {Object} 验证结果
 *
 * @example
 * validateEnum('active', ['active', 'inactive'], 'status')
 * // => { valid: true, error: null }
 *
 * validateEnum('deleted', ['active', 'inactive'], 'status')
 * // => { valid: false, error: 'status 的值必须是: active, inactive' }
 */
function validateEnum(value, allowedValues, fieldName = '字段') {
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

// ==================== 导出 ====================

module.exports = {
  // 验证函数
  validateUID,
  validateURL,
  validateArray,
  validateStringLength,
  validateEnum,

  // 常量（可选，供外部使用）
  UID_MIN_LENGTH,
  UID_MAX_LENGTH,
  UID_PATTERN,
  ALLOWED_URL_PROTOCOLS,
};
