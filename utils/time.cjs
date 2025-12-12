// utils/time.cjs
// 时间解析与格式化相关的通用工具（CommonJS 版本）

// ==================== 常量定义 ====================

/**
 * 中文星期到数字的映射（0=周日, 1=周一, ..., 6=周六）
 * 符合 JavaScript Date.getDay() 的返回值
 */
const DAY_MAP = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

/**
 * 中文星期到 RRULE 格式的映射
 * 用于 ICS 日历文件的重复规则 (RRULE)
 */
const RRULE_MAP = { 日: 'SU', 一: 'MO', 二: 'TU', 三: 'WE', 四: 'TH', 五: 'FR', 六: 'SA' };

/**
 * 反向映射：数字到 RRULE 格式（用于日期对象转换）
 */
const RRULE_BY_INDEX = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * 预编译的正则表达式：解析播出时间字符串
 * 按优先级顺序排列，支持以下格式：
 * - "每周六 12:00"
 * - "周日 18:30"
 * - "12:00"
 * - "11月23日起 周六 12:00"
 * - "起 周六 12:00"
 */
const BROADCAST_TIME_PATTERNS = [
  /(?:(?:每周|周)([日一二三四五六]))?.*?(\d{1,2}:\d{2})/, // 每周X HH:MM 或 周X HH:MM
  /([日一二三四五六]).*?(\d{1,2}:\d{2})/, // X HH:MM
  /(\d{1,2}:\d{2})/, // 仅时间 HH:MM
  /(?:.*?日起)?([日一二三四五六])?.*?(\d{1,2}:\d{2})/, // [日期]起 [周X] HH:MM
  /(?:.*?起)?([日一二三四五六])?.*?(\d{1,2}:\d{2})/, // [...]起 [周X] HH:MM
];

/**
 * 预编译的正则表达式：解析新集播出时间
 * 支持格式："2025-11-23 12:00:00"
 */
const DATETIME_PATTERN = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/;

/**
 * 预编译的正则表达式：解析相对时间
 * 支持格式："[...]日起 周六 12:00"
 */
const RELATIVE_TIME_PATTERN = /(?:.*?日起)?([日一二三四五六])?.*?(\d{1,2}:\d{2})/;

/**
 * 预编译的正则表达式：验证时间格式
 * 支持格式："HH:MM" 或 "H:MM"
 */
const TIME_FORMAT_PATTERN = /\d{1,2}:\d{2}/;

/**
 * 默认的星期和 RRULE（当无法解析时使用）
 */
const DEFAULT_DAY = 1; // 周一
const DEFAULT_RRULE = 'MO'; // Monday

/**
 * 时区偏移量（中国标准时间：UTC+8）
 * 单位：分钟
 */
const UTC_OFFSET_MINUTES = 8 * 60;

// ==================== 核心函数 ====================

/**
 * 解析播出时间字符串
 *
 * @param {string} pubIndex - 播出时间字符串，如 "每周六 12:00"
 * @returns {Object|null} 返回解析结果或 null
 *   - dayOfWeek: number - 星期几（0-6）
 *   - time: string - 时间字符串（HH:MM）
 *   - rruleDay: string - RRULE 格式的星期（SU, MO, ...）
 *
 * @example
 * parseBroadcastTime("每周六 12:00")
 * // => { dayOfWeek: 6, time: '12:00', rruleDay: 'SA' }
 */
function parseBroadcastTime(pubIndex) {
  if (!pubIndex) return null;

  // 使用预编译的正则表达式进行匹配
  for (const pattern of BROADCAST_TIME_PATTERNS) {
    const match = pubIndex.match(pattern);
    if (match) {
      const dayChar = match[1] || '一'; // 默认周一
      const time = match[2];

      // 优先使用星期字符
      if (dayChar in DAY_MAP) {
        return {
          dayOfWeek: DAY_MAP[dayChar],
          time: time,
          rruleDay: RRULE_MAP[dayChar],
        };
      }

      // 回退：仅验证时间格式
      if (TIME_FORMAT_PATTERN.test(time)) {
        return {
          dayOfWeek: DEFAULT_DAY,
          time: time,
          rruleDay: DEFAULT_RRULE,
        };
      }
    }
  }
  return null;
}

/**
 * 解析新集播出时间
 * 支持两种格式：
 * 1. 完整日期时间："2025-11-23 12:00:00"
 * 2. 相对时间："周六 12:00" 或 "11月23日起 周六 12:00"
 *
 * @param {string} pubTime - 播出时间字符串
 * @returns {Object|null} 返回解析结果或 null
 *   - dayOfWeek: number - 星期几（0-6）
 *   - time: string - 时间字符串（HH:MM）
 *   - rruleDay: string - RRULE 格式的星期（SU, MO, ...）
 *
 * @example
 * parseNewEpTime("2025-11-23 12:00:00")
 * // => { dayOfWeek: 6, time: '12:00', rruleDay: 'SA' }
 *
 * parseNewEpTime("周六 12:00")
 * // => { dayOfWeek: 6, time: '12:00', rruleDay: 'SA' }
 */
function parseNewEpTime(pubTime) {
  if (!pubTime) return null;

  // 优先匹配完整日期时间格式（更精确）
  const dateTimeMatch = pubTime.match(DATETIME_PATTERN);
  if (dateTimeMatch) {
    const dateStr = dateTimeMatch[1]; // YYYY-MM-DD
    const timeStr = dateTimeMatch[2].substring(0, 5); // HH:MM

    // 解析为 UTC+8 时区的日期对象
    const date = new Date(`${dateStr}T${timeStr}:00+08:00`);
    const dayOfWeek = date.getUTCDay();

    return {
      dayOfWeek,
      time: timeStr,
      rruleDay: RRULE_BY_INDEX[dayOfWeek],
    };
  }

  // 回退：匹配相对时间格式
  const match = pubTime.match(RELATIVE_TIME_PATTERN);
  if (match) {
    const dayChar = match[1] || '一'; // 默认周一
    const time = match[2];

    // 优先使用星期字符
    if (dayChar in DAY_MAP) {
      return {
        dayOfWeek: DAY_MAP[dayChar],
        time,
        rruleDay: RRULE_MAP[dayChar],
      };
    }

    // 回退：仅验证时间格式
    if (TIME_FORMAT_PATTERN.test(time)) {
      return {
        dayOfWeek: DEFAULT_DAY,
        time,
        rruleDay: DEFAULT_RRULE,
      };
    }
  }

  return null;
}

/**
 * 计算下次播出日期
 * 根据目标星期和时间，计算下一次播出的日期时间
 *
 * @param {number} targetDay - 目标星期（0-6，0=周日）
 * @param {string} timeStr - 时间字符串（HH:MM）
 * @returns {Date} 下次播出的日期对象（UTC+8 时区）
 *
 * @example
 * getNextBroadcastDate(6, '12:00')
 * // => 下个周六的 12:00（UTC+8）
 */
function getNextBroadcastDate(targetDay, timeStr) {
  const now = new Date();
  const [hh, mm] = timeStr.split(':').map(Number);

  // 将当前时间转换为 UTC+8 时区
  const nowInShanghai = new Date(now.getTime() + UTC_OFFSET_MINUTES * 60 * 1000);
  const today = nowInShanghai.getUTCDay();

  // 计算到目标星期的天数差
  let diff = (targetDay - today + 7) % 7;

  // 如果是今天，检查时间是否已过
  if (diff === 0) {
    const currH = nowInShanghai.getUTCHours();
    const currM = nowInShanghai.getUTCMinutes();
    if (currH > hh || (currH === hh && currM >= mm)) {
      diff = 7; // 已过播出时间，推到下周
    }
  }

  // 计算目标日期
  const nextDate = new Date(nowInShanghai);
  nextDate.setUTCDate(nextDate.getUTCDate() + diff);
  nextDate.setUTCHours(hh, mm, 0, 0);
  return nextDate;
}

/**
 * 格式化日期为 ICS 格式
 * 将日期对象转换为 ICS 日历文件所需的日期时间格式
 *
 * @param {Date} date - 日期对象
 * @returns {string} ICS 格式的日期时间字符串（YYYYMMDDTHHmmss）
 *
 * @example
 * formatDate(new Date('2025-11-23T12:00:00Z'))
 * // => "20251123T120000"
 */
function formatDate(date) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;
}

/**
 * 转义 ICS 文本中的特殊字符
 * 根据 RFC 5545 规范转义文本内容
 *
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的文本
 *
 * @example
 * escapeICSText("Hello, World; Test\\n")
 * // => "Hello\\, World\\; Test\\n"
 */
function escapeICSText(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

module.exports = {
  parseBroadcastTime,
  parseNewEpTime,
  getNextBroadcastDate,
  formatDate,
  escapeICSText,
};
