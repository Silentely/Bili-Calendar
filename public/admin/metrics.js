// @ts-check

/**
 * @typedef {Object} MetricsPayload
 * @property {{requests: {total: number, success: number, errors: number, rateLimited: number}, api: {calls: number, errors: number, avgLatencyMs?: number, maxLatencyMs?: number, p95Ms?: number, p99Ms?: number}}} metrics
 */

async function fetchMetrics() {
  const res = await fetch('/status?format=json', { cache: 'no-store' });
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
}

/**
 * @param {string} id - 元素 ID
 * @returns {HTMLElement}
 */
function getRequiredElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`missing element: ${id}`);
  }
  return element;
}

/**
 * @param {MetricsPayload} data - 指标响应数据
 * @returns {void}
 */
function renderSummary(data) {
  const box = getRequiredElement('summary');
  const m = data.metrics;
  const cards = [
    { title: 'Total Requests', value: m.requests.total },
    { title: 'Success', value: m.requests.success },
    { title: 'Errors', value: m.requests.errors },
    { title: 'Rate Limited', value: m.requests.rateLimited },
    { title: 'API Calls', value: m.api.calls },
    { title: 'API Errors', value: m.api.errors },
  ];
  box.innerHTML = cards
    .map(
      (c) => `
        <div class="card">
          <div class="card-title">${c.title}</div>
          <div class="card-value">${c.value}</div>
        </div>
      `
    )
    .join('');
}

/**
 * @param {string} label - 指标标签
 * @param {number} value - 当前值
 * @param {number} total - 总量
 * @param {string} [colorClass='primary'] - 颜色类名
 * @returns {string}
 */
function buildBarRow(label, value, total, colorClass = 'primary') {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return `
    <div class="bar-row">
      <span class="bar-label">${label}</span>
      <div class="bar">
        <div class="bar-fill ${colorClass}" style="width:${percent}%"></div>
      </div>
      <span class="bar-value">${value}</span>
    </div>
  `;
}

/**
 * @param {MetricsPayload} data - 指标响应数据
 * @returns {void}
 */
function renderCharts(data) {
  const m = data.metrics;
  const reqChart = getRequiredElement('requestChart');
  const totalReq = Math.max(m.requests.total, 1);
  reqChart.innerHTML = [
    buildBarRow('Success', m.requests.success, totalReq, 'success'),
    buildBarRow('Errors', m.requests.errors, totalReq, 'warn'),
    buildBarRow('Rate Limited', m.requests.rateLimited, totalReq, 'danger'),
  ].join('');

  const apiChart = getRequiredElement('apiChart');
  const latencyMax = Math.max(m.api.maxLatencyMs || 0, m.api.p99Ms || 0, 1);
  apiChart.innerHTML = [
    buildBarRow('Avg Latency (ms)', Math.round(m.api.avgLatencyMs || 0), latencyMax, 'primary'),
    buildBarRow('p95 (ms)', Math.round(m.api.p95Ms || 0), latencyMax, 'secondary'),
    buildBarRow('p99 (ms)', Math.round(m.api.p99Ms || 0), latencyMax, 'danger'),
  ].join('');
}

async function refresh() {
  const btn = getRequiredElement('refreshBtn');
  if (!(btn instanceof HTMLButtonElement)) {
    throw new Error('refreshBtn must be a button');
  }
  btn.disabled = true;
  btn.textContent = '刷新中...';
  try {
    const data = await fetchMetrics();
    renderSummary(data);
    renderCharts(data);
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = '手动刷新';
  }
}

getRequiredElement('refreshBtn').addEventListener('click', refresh);
refresh();
setInterval(refresh, 5000);
