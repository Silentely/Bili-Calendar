// test/utils.validation.test.js
// 验证工具模块的单元测试

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  validateUID,
  validateURL,
  validateArray,
  validateStringLength,
  validateEnum,
  UID_MIN_LENGTH,
  UID_MAX_LENGTH,
} = require('../utils/validation.cjs');

describe('utils/validation.cjs', () => {
  // ==================== validateUID 测试 ====================
  describe('validateUID', () => {
    it('应该接受有效的 UID（字符串）', () => {
      const result = validateUID('123456');
      assert.equal(result.valid, true);
      assert.equal(result.error, null);
      assert.equal(result.sanitized, '123456');
    });

    it('应该接受有效的 UID（数字）', () => {
      const result = validateUID(123456);
      assert.equal(result.valid, true);
      assert.equal(result.error, null);
      assert.equal(result.sanitized, '123456');
    });

    it('应该接受带空格的 UID 并自动清理', () => {
      const result = validateUID('  123456  ');
      assert.equal(result.valid, true);
      assert.equal(result.error, null);
      assert.equal(result.sanitized, '123456');
    });

    it('应该接受最短 UID（1位）', () => {
      const result = validateUID('1');
      assert.equal(result.valid, true);
      assert.equal(result.sanitized, '1');
    });

    it('应该接受最长 UID（20位）', () => {
      const result = validateUID('12345678901234567890');
      assert.equal(result.valid, true);
      assert.equal(result.sanitized, '12345678901234567890');
    });

    it('应该拒绝空值（null）', () => {
      const result = validateUID(null);
      assert.equal(result.valid, false);
      assert.match(result.error, /不能为空/);
      assert.equal(result.sanitized, null);
    });

    it('应该拒绝空值（undefined）', () => {
      const result = validateUID(undefined);
      assert.equal(result.valid, false);
      assert.match(result.error, /不能为空/);
    });

    it('应该拒绝空字符串', () => {
      const result = validateUID('');
      assert.equal(result.valid, false);
      assert.match(result.error, /不能为空/);
    });

    it('应该拒绝仅包含空格的字符串', () => {
      const result = validateUID('   ');
      assert.equal(result.valid, false);
      assert.match(result.error, /不能为空/);
    });

    it('应该拒绝包含非数字字符的 UID', () => {
      const result = validateUID('abc123');
      assert.equal(result.valid, false);
      assert.match(result.error, /必须是纯数字/);
    });

    it('应该拒绝包含特殊字符的 UID', () => {
      const result = validateUID('123-456');
      assert.equal(result.valid, false);
      assert.match(result.error, /必须是纯数字/);
    });

    it('应该拒绝超过最大长度的 UID', () => {
      const result = validateUID('123456789012345678901'); // 21位
      assert.equal(result.valid, false);
      // 注意：由于使用正则表达式一次性验证，超长的数字会在格式验证阶段被拒绝
      assert.match(result.error, /必须是纯数字/);
    });

    it('应该拒绝负数', () => {
      const result = validateUID(-123);
      assert.equal(result.valid, false);
      assert.match(result.error, /必须是纯数字/);
    });

    it('应该拒绝浮点数', () => {
      const result = validateUID(123.456);
      assert.equal(result.valid, false);
      assert.match(result.error, /必须是纯数字/);
    });
  });

  // ==================== validateURL 测试 ====================
  describe('validateURL', () => {
    it('应该接受有效的 HTTP URL', () => {
      const result = validateURL('http://example.com');
      assert.equal(result.valid, true);
      assert.equal(result.error, null);
      assert.ok(result.parsed);
      assert.equal(result.parsed.hostname, 'example.com');
    });

    it('应该接受有效的 HTTPS URL', () => {
      const result = validateURL('https://example.com/path?query=value');
      assert.equal(result.valid, true);
      assert.equal(result.parsed.hostname, 'example.com');
    });

    it('应该拒绝空值', () => {
      const result = validateURL('');
      assert.equal(result.valid, false);
      assert.match(result.error, /不能为空/);
    });

    it('应该拒绝无效的 URL 格式', () => {
      const result = validateURL('not-a-url');
      assert.equal(result.valid, false);
      assert.match(result.error, /格式无效/);
    });

    it('应该拒绝不支持的协议', () => {
      const result = validateURL('ftp://example.com');
      assert.equal(result.valid, false);
      assert.match(result.error, /不支持的协议/);
    });

    it('应该默认拒绝 localhost', () => {
      const result = validateURL('http://localhost:3000');
      assert.equal(result.valid, false);
      assert.match(result.error, /私有 IP/);
    });

    it('应该默认拒绝 127.0.0.1', () => {
      const result = validateURL('http://127.0.0.1:3000');
      assert.equal(result.valid, false);
      assert.match(result.error, /私有 IP/);
    });

    it('应该默认拒绝 10.x.x.x', () => {
      const result = validateURL('http://10.0.0.1');
      assert.equal(result.valid, false);
      assert.match(result.error, /私有 IP/);
    });

    it('应该默认拒绝 192.168.x.x', () => {
      const result = validateURL('http://192.168.1.1');
      assert.equal(result.valid, false);
      assert.match(result.error, /私有 IP/);
    });

    it('当 allowPrivateIP=true 时应该接受 localhost', () => {
      const result = validateURL('http://localhost:3000', { allowPrivateIP: true });
      assert.equal(result.valid, true);
    });
  });

  // ==================== validateArray 测试 ====================
  describe('validateArray', () => {
    it('应该接受非空数组', () => {
      const result = validateArray([1, 2, 3], 'items');
      assert.equal(result.valid, true);
      assert.equal(result.error, null);
    });

    it('应该拒绝空数组', () => {
      const result = validateArray([], 'items');
      assert.equal(result.valid, false);
      assert.match(result.error, /不能为空/);
    });

    it('应该拒绝非数组类型', () => {
      const result = validateArray('not-array', 'items');
      assert.equal(result.valid, false);
      assert.match(result.error, /必须是数组类型/);
    });

    it('应该使用自定义字段名', () => {
      const result = validateArray([], 'customField');
      assert.match(result.error, /customField 不能为空/);
    });
  });

  // ==================== validateStringLength 测试 ====================
  describe('validateStringLength', () => {
    it('应该接受在范围内的字符串', () => {
      const result = validateStringLength('Hello', 1, 10, 'username');
      assert.equal(result.valid, true);
      assert.equal(result.error, null);
    });

    it('应该接受最短长度的字符串', () => {
      const result = validateStringLength('A', 1, 10);
      assert.equal(result.valid, true);
    });

    it('应该接受最长长度的字符串', () => {
      const result = validateStringLength('1234567890', 1, 10);
      assert.equal(result.valid, true);
    });

    it('应该拒绝过短的字符串', () => {
      const result = validateStringLength('', 1, 10, 'username');
      assert.equal(result.valid, false);
      assert.match(result.error, /长度必须在/);
    });

    it('应该拒绝过长的字符串', () => {
      const result = validateStringLength('12345678901', 1, 10, 'username');
      assert.equal(result.valid, false);
      assert.match(result.error, /长度必须在/);
    });

    it('应该拒绝非字符串类型', () => {
      const result = validateStringLength(123, 1, 10, 'username');
      assert.equal(result.valid, false);
      assert.match(result.error, /必须是字符串类型/);
    });
  });

  // ==================== validateEnum 测试 ====================
  describe('validateEnum', () => {
    it('应该接受允许的值', () => {
      const result = validateEnum('active', ['active', 'inactive'], 'status');
      assert.equal(result.valid, true);
      assert.equal(result.error, null);
    });

    it('应该拒绝不允许的值', () => {
      const result = validateEnum('deleted', ['active', 'inactive'], 'status');
      assert.equal(result.valid, false);
      assert.match(result.error, /的值必须是/);
      assert.match(result.error, /active, inactive/);
    });

    it('应该使用自定义字段名', () => {
      const result = validateEnum('invalid', ['valid'], 'customField');
      assert.match(result.error, /customField 的值必须是/);
    });
  });

  // ==================== 常量导出测试 ====================
  describe('Constants', () => {
    it('应该导出 UID 相关常量', () => {
      assert.equal(UID_MIN_LENGTH, 1);
      assert.equal(UID_MAX_LENGTH, 20);
    });
  });
});
