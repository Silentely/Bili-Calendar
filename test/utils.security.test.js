import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isPrivateIPAddress } = require('../utils/security.cjs');
const { extractClientIP } = require('../utils/ip.cjs');

test('isPrivateIPAddress covers IPv4-mapped IPv6 addresses', () => {
  assert.equal(isPrivateIPAddress('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateIPAddress('::ffff:192.168.1.10'), true);
  assert.equal(isPrivateIPAddress('::ffff:8.8.8.8'), false);
});

test('isPrivateIPAddress distinguishes known hostnames', () => {
  assert.equal(isPrivateIPAddress('localhost'), true);
  assert.equal(isPrivateIPAddress('example.com'), false);
});

test('extractClientIP prefers req.ip/req.ips over spoofed headers', () => {
  const ip = extractClientIP({
    ip: '203.0.113.5',
    ips: [],
    headers: { 'x-forwarded-for': '10.0.0.1' },
  });
  assert.equal(ip, '203.0.113.5');
});

test('extractClientIP normalizes IPv4-mapped inputs', () => {
  const ip = extractClientIP({
    ip: '::ffff:192.0.2.9',
    ips: [],
    headers: {},
  });
  assert.equal(ip, '192.0.2.9');
});
