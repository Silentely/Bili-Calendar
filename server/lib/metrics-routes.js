// @ts-check
/**
 * 指标路由注册
 */

import metrics from '../../utils-es/metrics.js';

/**
 * @param {import('express').Express} app
 */
export function registerMetricsRoutes(app) {
  app.get('/metrics', (_req, res) => {
    res.json({ status: 'ok', metrics: metrics.snapshot() });
  });

  app.get('/metrics/prometheus', (_req, res) => {
    const m = metrics.snapshot();
    const mem = process.memoryUsage();
    const lines = [
      '# HELP bili_uptime_seconds Process uptime seconds',
      '# TYPE bili_uptime_seconds gauge',
      `bili_uptime_seconds ${Math.floor(process.uptime())}`,
      '# HELP bili_memory_rss_bytes Process RSS memory bytes',
      '# TYPE bili_memory_rss_bytes gauge',
      `bili_memory_rss_bytes ${mem.rss}`,
      '# HELP bili_requests_total Total requests',
      '# TYPE bili_requests_total counter',
      `bili_requests_total ${m.requests.total}`,
      '# HELP bili_requests_errors Total error responses',
      '# TYPE bili_requests_errors counter',
      `bili_requests_errors ${m.requests.errors}`,
      '# HELP bili_requests_success Total success responses',
      '# TYPE bili_requests_success counter',
      `bili_requests_success ${m.requests.success}`,
      '# HELP bili_requests_rate_limited Rate limited count',
      '# TYPE bili_requests_rate_limited counter',
      `bili_requests_rate_limited ${m.requests.rateLimited}`,
      '# HELP bili_api_calls Total Bilibili API calls',
      '# TYPE bili_api_calls counter',
      `bili_api_calls ${m.api.calls}`,
      '# HELP bili_api_errors Bilibili API errors',
      '# TYPE bili_api_errors counter',
      `bili_api_errors ${m.api.errors}`,
      '# HELP bili_api_latency_avg_ms Average API latency ms',
      '# TYPE bili_api_latency_avg_ms gauge',
      `bili_api_latency_avg_ms ${m.api.avgLatencyMs}`,
      '# HELP bili_api_latency_p95_ms API latency p95 ms',
      '# TYPE bili_api_latency_p95_ms gauge',
      `bili_api_latency_p95_ms ${m.api.p95Ms}`,
      '# HELP bili_api_latency_p99_ms API latency p99 ms',
      '# TYPE bili_api_latency_p99_ms gauge',
      `bili_api_latency_p99_ms ${m.api.p99Ms}`,
      '# HELP bili_aggregate_sources_requested External ICS sources requested',
      '# TYPE bili_aggregate_sources_requested counter',
      `bili_aggregate_sources_requested ${m.aggregate?.sourcesRequested ?? 0}`,
      '# HELP bili_aggregate_sources_fetched External ICS sources fetched',
      '# TYPE bili_aggregate_sources_fetched counter',
      `bili_aggregate_sources_fetched ${m.aggregate?.sourcesFetched ?? 0}`,
      '# HELP bili_aggregate_sources_failed External ICS sources failed',
      '# TYPE bili_aggregate_sources_failed counter',
      `bili_aggregate_sources_failed ${m.aggregate?.sourcesFailed ?? 0}`,
    ];

    m.routes.forEach((r) => {
      const label = `{route="${r.route}"}`;
      lines.push('# HELP bili_route_requests_total Requests per route');
      lines.push('# TYPE bili_route_requests_total counter');
      lines.push(`bili_route_requests_total${label} ${r.total}`);
      lines.push('# HELP bili_route_requests_errors Route errors');
      lines.push('# TYPE bili_route_requests_errors counter');
      lines.push(`bili_route_requests_errors${label} ${r.errors}`);
      lines.push('# HELP bili_route_latency_avg_ms Route avg latency');
      lines.push('# TYPE bili_route_latency_avg_ms gauge');
      lines.push(`bili_route_latency_avg_ms${label} ${r.avg}`);
      lines.push('# HELP bili_route_latency_p95_ms Route p95 latency');
      lines.push('# TYPE bili_route_latency_p95_ms gauge');
      lines.push(`bili_route_latency_p95_ms${label} ${r.p95}`);
      lines.push('# HELP bili_route_latency_p99_ms Route p99 latency');
      lines.push('# TYPE bili_route_latency_p99_ms gauge');
      lines.push(`bili_route_latency_p99_ms${label} ${r.p99}`);
    });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(lines.join('\n'));
  });
}
