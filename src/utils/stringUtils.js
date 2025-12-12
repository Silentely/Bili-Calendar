// @ts-check
/**
 * 字符串工具模块
 * 提供字符串处理相关的工具函数
 */

/**
 * 将全角数字转换为半角数字
 *
 * 全角数字范围: ０-９ (U+FF10 - U+FF19)
 * 半角数字范围: 0-9 (U+0030 - U+0039)
 *
 * @param {string} str - 待转换的字符串
 * @returns {string} 转换后的字符串
 *
 * @example
 * toHalfWidth('１２３４５')
 * // => '12345'
 *
 * toHalfWidth('UID：６１４５００')
 * // => 'UID：614500'
 */
export function toHalfWidth(str) {
  return str.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
}

/**
 * 清理字符串前后空格
 *
 * @param {string | null | undefined} str - 待清理的字符串
 * @returns {string} 清理后的字符串
 *
 * @example
 * trimString('  hello  ')
 * // => 'hello'
 *
 * trimString(null)
 * // => ''
 */
export function trimString(str) {
  return String(str || '').trim();
}

/**
 * 判断字符串是否为空
 *
 * @param {string | null | undefined} str - 待检查的字符串
 * @returns {boolean} 是否为空
 *
 * @example
 * isEmpty('')
 * // => true
 *
 * isEmpty('   ')
 * // => true
 *
 * isEmpty('hello')
 * // => false
 *
 * isEmpty(null)
 * // => true
 */
export function isEmpty(str) {
  return !str || String(str).trim() === '';
}

/**
 * 转义HTML特殊字符，防止XSS攻击
 *
 * 转义以下字符：
 * - & => &amp;
 * - < => &lt;
 * - > => &gt;
 * - " => &quot;
 * - ' => &#x27;
 * - / => &#x2F;
 *
 * @param {string | null | undefined} str - 待转义的字符串
 * @returns {string} 转义后的安全字符串
 *
 * @example
 * escapeHtml('<script>alert("XSS")</script>')
 * // => '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;'
 *
 * escapeHtml('Hello & "World"')
 * // => 'Hello &amp; &quot;World&quot;'
 *
 * escapeHtml(null)
 * // => ''
 */
export function escapeHtml(str) {
  if (!str) return '';

  const htmlEscapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return String(str).replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char]);
}

export default {
  toHalfWidth,
  trimString,
  isEmpty,
  escapeHtml,
};
