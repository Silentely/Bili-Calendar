async function fetchMetrics() {
  const res = await fetch('/status?format=json', { cache: 'no-store' });
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
}

function renderSummary(data) {
  const box = document.getElementById('summary');
  const m = data.metrics;
  const cards = [
    { title: '请求总数', value: m.requests.total },
    { title: '成功', value: m.requests.success },
    { title: '错误', value: m.requests.errors },
    { title: '限流', value: m.requests.rateLimited },
    { title: 'API 调用', value: m.api.calls },
    { title: 'API 错误', value: m.api.errors },
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

function renderCharts(data) {
  const m = data.metrics;
  const reqChart = document.getElementById('requestChart');
  reqChart.textContent = `total: ${m.requests.total}\nsuccess: ${m.requests.success}\nerrors: ${m.requests.errors}\nrateLimited: ${m.requests.rateLimited}`;

  const apiChart = document.getElementById('apiChart');
  apiChart.textContent = `calls: ${m.api.calls}\nerrors: ${m.api.errors}\navg latency: ${m.api.avgLatencyMs} ms\nmax latency: ${m.api.maxLatencyMs} ms`;
}

async function refresh() {
  const btn = document.getElementById('refreshBtn');
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

document.getElementById('refreshBtn').addEventListener('click', refresh);
refresh();
setInterval(refresh, 5000);
