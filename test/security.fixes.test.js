import test from 'node:test';
import assert from 'node:assert/strict';
import createPushStore, {
  validatePushSubscription,
  sanitizePushSubscription,
} from '../utils-es/push-store.js';
import { fetchExternalICS, validateRedirectUrl } from '../utils-es/ics-merge.js';
import { isPrivateIPAddress, validateExternalSource } from '../utils-es/security.js';
import { normalizeIPAddress } from '../utils-es/ip.js';
import { metricsAuthMiddleware } from '../server/lib/metrics-routes.js';

test('isPrivateIPAddress and normalizeIPAddress correctly identify IPv4-mapped IPv6 addresses', () => {
  // WHATWG URL 规范化后的十六进制映射格式
  assert.equal(normalizeIPAddress('::ffff:7f00:1'), '127.0.0.1');
  assert.equal(normalizeIPAddress('[::ffff:7f00:1]'), '127.0.0.1');
  assert.equal(normalizeIPAddress('::ffff:c0a8:10a'), '192.168.1.10');
  assert.equal(normalizeIPAddress('[::ffff:c0a8:10a]'), '192.168.1.10');

  // 点分十进制映射格式
  assert.equal(normalizeIPAddress('::ffff:127.0.0.1'), '127.0.0.1');
  assert.equal(normalizeIPAddress('[::ffff:127.0.0.1]'), '127.0.0.1');
  assert.equal(normalizeIPAddress('::ffff:10.0.0.1'), '10.0.0.1');
  assert.equal(normalizeIPAddress('::ffff:8.8.8.8'), '8.8.8.8');

  // isPrivateIPAddress 判定
  assert.equal(isPrivateIPAddress('::ffff:7f00:1'), true);
  assert.equal(isPrivateIPAddress('[::ffff:7f00:1]'), true);
  assert.equal(isPrivateIPAddress('::ffff:c0a8:10a'), true);
  assert.equal(isPrivateIPAddress('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateIPAddress('::ffff:8.8.8.8'), false);

  // validateExternalSource 联动验证
  assert.equal(
    validateExternalSource('http://[::ffff:127.0.0.1]/test'),
    '不允许访问私有或本地地址'
  );
  assert.equal(
    validateExternalSource('http://[::ffff:192.168.1.10]/test'),
    '不允许访问私有或本地地址'
  );
  assert.equal(validateExternalSource('https://example.com/calendar.ics'), null);
});

test('pushStore and validatePushSubscription reject malicious and invalid subscriptions', () => {
  // 合法订阅
  assert.equal(
    validatePushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/fake-token',
      keys: { p256dh: 'abc', auth: 'xyz' },
    }),
    true
  );

  // 缺失 / 非法 endpoint
  assert.equal(validatePushSubscription(null), false);
  assert.equal(validatePushSubscription({}), false);
  assert.equal(validatePushSubscription({ endpoint: '' }), false);
  assert.equal(validatePushSubscription({ endpoint: 'http://a' }), false); // < 10 chars

  // 非法协议
  assert.equal(validatePushSubscription({ endpoint: 'file:///etc/passwd' }), false);
  assert.equal(validatePushSubscription({ endpoint: 'ftp://example.com/test' }), false);
  assert.equal(validatePushSubscription({ endpoint: 'javascript:alert(1)' }), false);

  // 私有 / 本地网络地址与 IPv4-mapped IPv6 (SSRF 防御)
  assert.equal(validatePushSubscription({ endpoint: 'http://127.0.0.1/push' }), false);
  assert.equal(validatePushSubscription({ endpoint: 'https://192.168.1.100/push' }), false);
  assert.equal(validatePushSubscription({ endpoint: 'https://localhost:8080/push' }), false);
  assert.equal(validatePushSubscription({ endpoint: 'http://[::ffff:127.0.0.1]/push' }), false);
  assert.equal(validatePushSubscription({ endpoint: 'http://[::ffff:7f00:1]/push' }), false);

  // 畸形 keys
  assert.equal(
    validatePushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/token',
      keys: 'invalid-string',
    }),
    false
  );
  assert.equal(
    validatePushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/token',
      keys: ['array'],
    }),
    false
  );
  assert.equal(
    validatePushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/token',
      keys: { p256dh: 'x'.repeat(600) },
    }),
    false
  );

  // 超过最大长度 / 巨大 Payload
  const longUrl = 'https://example.com/' + 'a'.repeat(2100);
  assert.equal(validatePushSubscription({ endpoint: longUrl }), false);
});

test('sanitizePushSubscription cleans non-whitelisted fields', () => {
  const dirty = {
    endpoint: '  https://fcm.googleapis.com/fcm/send/token-123  ',
    expirationTime: 12345678,
    extraAttackField: 'malicious payload',
    keys: {
      p256dh: 'key-p256dh',
      auth: 'key-auth',
      unknown: 'ignore-me',
    },
  };

  const clean = sanitizePushSubscription(dirty);
  assert.deepEqual(clean, {
    endpoint: 'https://fcm.googleapis.com/fcm/send/token-123',
    expirationTime: 12345678,
    keys: {
      p256dh: 'key-p256dh',
      auth: 'key-auth',
    },
  });
  assert.equal(clean.extraAttackField, undefined);
  assert.equal(clean.keys.unknown, undefined);
});

test('pushStore enforces capacity limit with FIFO eviction and sanitization', () => {
  const store = createPushStore();
  // 添加数据并包含脏字段
  for (let i = 0; i < 2005; i++) {
    store.add({
      endpoint: `https://push.example.com/sub-${i}`,
      dirty: 'remove-this',
    });
  }

  const list = store.list();
  assert.equal(list.length <= 2000, true);
  // 最早的已被淘汰
  assert.equal(
    list.some((s) => s.endpoint === 'https://push.example.com/sub-0'),
    false
  );
  // 最新的仍然存在且字段已清洗
  const latest = list.find((s) => s.endpoint === 'https://push.example.com/sub-2004');
  assert.ok(latest);
  assert.equal(latest.dirty, undefined);
});

test('validateRedirectUrl blocks redirects to private IP addresses and invalid schemes (SSRF)', () => {
  // 私网 IP 重定向拦截
  assert.throws(() => validateRedirectUrl('http://127.0.0.1:8080/secret'), {
    code: 'ERR_SSRF_BLOCKED',
  });
  assert.throws(() => validateRedirectUrl('http://192.168.1.1/cal.ics'), {
    code: 'ERR_SSRF_BLOCKED',
  });
  assert.throws(() => validateRedirectUrl('http://[::ffff:7f00:1]/secret'), {
    code: 'ERR_SSRF_BLOCKED',
  });
  assert.throws(() => validateRedirectUrl('http://[::ffff:127.0.0.1]/secret'), {
    code: 'ERR_SSRF_BLOCKED',
  });
  assert.throws(() => validateRedirectUrl('http://localhost:3000/cal'), {
    code: 'ERR_SSRF_BLOCKED',
  });

  // 非法协议拦截
  assert.throws(() => validateRedirectUrl('file:///etc/passwd'), {
    code: 'ERR_SSRF_BLOCKED',
  });
  assert.throws(() => validateRedirectUrl('javascript:alert(1)'), {
    code: 'ERR_SSRF_BLOCKED',
  });
  assert.throws(() => validateRedirectUrl('not-a-url'), {
    code: 'ERR_SSRF_BLOCKED',
  });

  // 公网合法重定向允许
  assert.equal(validateRedirectUrl('https://calendar.google.com/cal.ics'), true);
  assert.equal(validateRedirectUrl('http://example.com/test.ics'), true);
});

test('fetchExternalICS blocks initial private and mapped IP addresses', async () => {
  const res1 = await fetchExternalICS(['http://127.0.0.1:8080/secret']);
  assert.deepEqual(res1, []);

  const res2 = await fetchExternalICS(['http://[::ffff:7f00:1]/secret']);
  assert.deepEqual(res2, []);
});

test('metricsAuthMiddleware enforces token robustly when METRICS_TOKEN is set', () => {
  const originalToken = process.env.METRICS_TOKEN;
  try {
    process.env.METRICS_TOKEN = 'secret-token-123';

    // 缺少 Token
    let nextCalled = false;
    let status = 0;
    let body = null;
    metricsAuthMiddleware(
      { headers: {}, query: {} },
      {
        status(code) {
          status = code;
          return {
            json(data) {
              body = data;
            },
          };
        },
      },
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, false);
    assert.equal(status, 401);
    assert.equal(body.error, 'Unauthorized');

    // 非字符串 headers / query 健壮性测试（不抛出 500）
    status = 0;
    metricsAuthMiddleware(
      { headers: { authorization: ['array-token'] }, query: { token: { obj: 1 } } },
      {
        status(code) {
          status = code;
          return {
            json(data) {
              body = data;
            },
          };
        },
      },
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, false);
    assert.equal(status, 401);

    // 错误的 Token
    status = 0;
    metricsAuthMiddleware(
      { headers: { authorization: 'Bearer wrong-token' }, query: {} },
      {
        status(code) {
          status = code;
          return {
            json(data) {
              body = data;
            },
          };
        },
      },
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, false);
    assert.equal(status, 401);

    // 正确的 Token (Bearer Header)
    nextCalled = false;
    metricsAuthMiddleware(
      { headers: { authorization: 'Bearer secret-token-123' }, query: {} },
      {},
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, true);

    // 正确的 Token (Query Param)
    nextCalled = false;
    metricsAuthMiddleware({ headers: {}, query: { token: 'secret-token-123' } }, {}, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  } finally {
    if (originalToken !== undefined) {
      process.env.METRICS_TOKEN = originalToken;
    } else {
      delete process.env.METRICS_TOKEN;
    }
  }
});
