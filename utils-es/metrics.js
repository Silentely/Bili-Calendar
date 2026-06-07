// @ts-nocheck
// utils-es/metrics.js
// 简易内存指标采集（ESM 版本）

export class Metrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.startedAt = Date.now();
    this.requestsTotal = 0;
    this.success = 0;
    this.errors = 0;
    this.rateLimited = 0;
    this.apiCalls = 0;
    this.apiErrors = 0;
    this.apiLatencySum = 0;
    this.apiLatencyMax = 0;
    this.apiLatencyBuffer = [];
    this.maxBuffer = 200;
    this.maxRoutes = 1000;
    this.routeStats = new Map();
  }

  onRequest(route = 'unknown') {
    this.requestsTotal += 1;
    this.ensureRoute(route).total += 1;
    return Date.now();
  }

  onResponse(statusCode, durationMs, route = 'unknown') {
    if (statusCode >= 400) this.errors += 1;
    else this.success += 1;

    const routeStat = this.ensureRoute(route);
    if (statusCode >= 400) routeStat.errors += 1;
    else routeStat.success += 1;
    routeStat.latencies.push(durationMs);
    if (routeStat.latencies.length > this.maxBuffer) routeStat.latencies.shift();
  }

  onRateLimited() {
    this.rateLimited += 1;
  }

  onApiCall(durationMs, ok = true) {
    this.apiCalls += 1;
    if (!ok) this.apiErrors += 1;

    if (typeof durationMs === 'number' && durationMs >= 0) {
      this.apiLatencySum += durationMs;
      if (durationMs > this.apiLatencyMax) this.apiLatencyMax = durationMs;
      this.apiLatencyBuffer.push(durationMs);
      if (this.apiLatencyBuffer.length > this.maxBuffer) {
        this.apiLatencyBuffer.shift();
      }
    }
  }

  snapshot() {
    const uptimeMs = Date.now() - this.startedAt;
    const apiAvg = this.apiCalls > 0 ? Number((this.apiLatencySum / this.apiCalls).toFixed(2)) : 0;

    return {
      startedAt: new Date(this.startedAt).toISOString(),
      uptimeMs,
      requests: {
        total: this.requestsTotal,
        success: this.success,
        errors: this.errors,
        rateLimited: this.rateLimited,
      },
      api: {
        calls: this.apiCalls,
        errors: this.apiErrors,
        avgLatencyMs: apiAvg,
        maxLatencyMs: this.apiLatencyMax,
        p95Ms: percentile(this.apiLatencyBuffer, 95),
        p99Ms: percentile(this.apiLatencyBuffer, 99),
      },
      routes: this.serializeRoutes(),
    };
  }

  ensureRoute(route) {
    if (!this.routeStats.has(route)) {
      if (this.routeStats.size >= this.maxRoutes) {
        const oldestKey = this.routeStats.keys().next().value;
        if (oldestKey) {
          this.routeStats.delete(oldestKey);
        }
      }
      this.routeStats.set(route, {
        total: 0,
        success: 0,
        errors: 0,
        latencies: [],
      });
    }
    return this.routeStats.get(route);
  }

  serializeRoutes() {
    const out = [];
    for (const [route, stat] of this.routeStats.entries()) {
      const avg = stat.latencies.length
        ? Number((stat.latencies.reduce((sum, value) => sum + value, 0) / stat.latencies.length).toFixed(2))
        : 0;
      out.push({
        route,
        total: stat.total,
        success: stat.success,
        errors: stat.errors,
        avg,
        p95: percentile(stat.latencies, 95),
        p99: percentile(stat.latencies, 99),
      });

      if (stat.latencies.length > this.maxBuffer) {
        stat.latencies.splice(0, stat.latencies.length - this.maxBuffer);
      }
    }
    return out;
  }
}

function percentile(values, p) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  const weight = rank - low;
  return Number((sorted[low] * (1 - weight) + sorted[high] * weight).toFixed(2));
}

const metrics = new Metrics();

export default metrics;
