import assert from 'node:assert/strict';
import test from 'node:test';
import { isPrivateIPAddress } from '../utils-es/security.js';
import { extractClientIP } from '../utils-es/ip.js';

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

test('extractClientIP uses Netlify platform header when socket/ip missing', () => {
  const ip = extractClientIP({
    headers: {
      'x-nf-client-connection-ip': '198.51.100.20',
      'x-forwarded-for': '10.0.0.1',
    },
  });
  assert.equal(ip, '198.51.100.20');
});

test('extractClientIP prefers req.ip over Netlify platform header', () => {
  const ip = extractClientIP({
    ip: '203.0.113.9',
    headers: {
      'x-nf-client-connection-ip': '198.51.100.20',
    },
  });
  assert.equal(ip, '203.0.113.9');
});

test('extractClientIP ignores bare x-forwarded-for outside trusted proxy env', () => {
  const prevTrust = process.env.TRUST_PROXY;
  const prevNetlify = process.env.NETLIFY;
  const prevLambda = process.env.AWS_LAMBDA_FUNCTION_NAME;
  delete process.env.TRUST_PROXY;
  delete process.env.NETLIFY;
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  try {
    const ip = extractClientIP({
      headers: { 'x-forwarded-for': '203.0.113.50' },
    });
    assert.equal(ip, '');
  } finally {
    if (prevTrust === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prevTrust;
    if (prevNetlify === undefined) delete process.env.NETLIFY;
    else process.env.NETLIFY = prevNetlify;
    if (prevLambda === undefined) delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    else process.env.AWS_LAMBDA_FUNCTION_NAME = prevLambda;
  }
});

test('extractClientIP uses x-forwarded-for on Netlify when platform header missing', () => {
  const prevTrust = process.env.TRUST_PROXY;
  const prevNetlify = process.env.NETLIFY;
  delete process.env.TRUST_PROXY;
  process.env.NETLIFY = 'true';
  try {
    const ip = extractClientIP({
      headers: { 'x-forwarded-for': '203.0.113.77, 10.0.0.1' },
    });
    assert.equal(ip, '203.0.113.77');
  } finally {
    if (prevTrust === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prevTrust;
    if (prevNetlify === undefined) delete process.env.NETLIFY;
    else process.env.NETLIFY = prevNetlify;
  }
});

test('extractClientIP uses Cloudflare connecting IP header', () => {
  const ip = extractClientIP({
    headers: { 'cf-connecting-ip': '::ffff:192.0.2.44' },
  });
  assert.equal(ip, '192.0.2.44');
});
