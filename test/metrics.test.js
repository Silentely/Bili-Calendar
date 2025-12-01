import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const metrics = require('../utils/metrics.cjs');

test('metrics records requests and api calls', () => {
  metrics.reset();
  metrics.onRequest();
  metrics.onResponse(200, 10);
  metrics.onRequest();
  metrics.onResponse(500, 5);
  metrics.onRateLimited();
  metrics.onApiCall(100, true);
  metrics.onApiCall(200, false);

  const snap = metrics.snapshot();
  assert.equal(snap.requests.total, 2);
  assert.equal(snap.requests.success, 1);
  assert.equal(snap.requests.errors, 1);
  assert.equal(snap.requests.rateLimited, 1);
  assert.equal(snap.api.calls, 2);
  assert.equal(snap.api.errors, 1);
  assert.equal(snap.api.maxLatencyMs, 200);
  assert.ok(snap.api.p95Ms >= 100 && snap.api.p95Ms <= 200);
  assert.ok(snap.api.p99Ms >= 100 && snap.api.p99Ms <= 200);
  assert.ok(snap.api.avgLatencyMs >= 100 && snap.api.avgLatencyMs <= 200);
});
