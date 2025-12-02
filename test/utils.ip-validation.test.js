// test/utils.ip-validation.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import security from '../utils/security.cjs';

const { isPrivateIPAddress, validateExternalSource, validateUID } = security;

describe('Security Utils', () => {
  describe('validateUID', () => {
    it('应该接受正确的 UID', () => {
      assert.strictEqual(validateUID('123456'), true);
      assert.strictEqual(validateUID('1'), true);
      assert.strictEqual(validateUID('99999999999999999999'), true);
    });

    it('应该拒绝非法 UID', () => {
      assert.strictEqual(validateUID(''), false);
      assert.strictEqual(validateUID('abc'), false);
      assert.strictEqual(validateUID('123456789012345678901'), false);
      assert.strictEqual(validateUID('12 34'), false);
    });
  });

  describe('isPrivateIPAddress', () => {
    it('应该识别 localhost', () => {
      assert.strictEqual(isPrivateIPAddress('localhost'), true);
      assert.strictEqual(isPrivateIPAddress('127.0.0.1'), true);
      assert.strictEqual(isPrivateIPAddress('::1'), true);
    });

    it('应该识别私有IP范围', () => {
      assert.strictEqual(isPrivateIPAddress('10.0.0.1'), true);
      assert.strictEqual(isPrivateIPAddress('192.168.1.1'), true);
      assert.strictEqual(isPrivateIPAddress('172.16.0.1'), true);
      assert.strictEqual(isPrivateIPAddress('172.31.255.255'), true);
      assert.strictEqual(isPrivateIPAddress('169.254.1.1'), true);
    });

    it('应该识别公网IP', () => {
      assert.strictEqual(isPrivateIPAddress('8.8.8.8'), false);
      assert.strictEqual(isPrivateIPAddress('1.1.1.1'), false);
      assert.strictEqual(isPrivateIPAddress('114.114.114.114'), false);
    });

    it('应该识别域名', () => {
      assert.strictEqual(isPrivateIPAddress('example.com'), false);
      assert.strictEqual(isPrivateIPAddress('google.com'), false);
      assert.strictEqual(isPrivateIPAddress('test.local'), true);
    });
  });

  describe('validateExternalSource', () => {
    it('应该拒绝私有地址', () => {
      assert.notStrictEqual(validateExternalSource('http://localhost/calendar.ics'), null);
      assert.notStrictEqual(validateExternalSource('http://127.0.0.1/calendar.ics'), null);
      assert.notStrictEqual(validateExternalSource('http://192.168.1.1/calendar.ics'), null);
      assert.notStrictEqual(validateExternalSource('http://10.0.0.1/calendar.ics'), null);
    });

    it('应该允许公网地址', () => {
      assert.strictEqual(validateExternalSource('https://example.com/calendar.ics'), null);
      assert.strictEqual(validateExternalSource('https://google.com/calendar.ics'), null);
      assert.strictEqual(validateExternalSource('http://8.8.8.8/calendar.ics'), null);
    });

    it('应该拒绝非 http/https 协议', () => {
      assert.notStrictEqual(validateExternalSource('ftp://example.com/calendar.ics'), null);
      assert.notStrictEqual(validateExternalSource('file:///etc/passwd'), null);
      assert.notStrictEqual(validateExternalSource('javascript:alert(1)'), null);
    });

    it('应该拒绝无效 URL', () => {
      assert.notStrictEqual(validateExternalSource('not a url'), null);
      assert.notStrictEqual(validateExternalSource(''), null);
    });
  });
});
