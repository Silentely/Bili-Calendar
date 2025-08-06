function toHalfWidth(str) {
  return str.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
}

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function showToast(message) {
  // 创建Toast通知
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <div class="toast-content">
      <i class="fas fa-check-circle"></i>
      ${message}
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) document.body.removeChild(toast);
    }, 300);
  }, 3000);
}

function copyToClipboard() {
  const url = document.getElementById('subscribeUrl').textContent;
  if (!url) return;
  // 先尝试异步剪贴板
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('链接已复制到剪贴板');
    }).catch(() => {
      fallbackCopy(url);
    });
  } else {
    fallbackCopy(url);
  }
}

function fallbackCopy(text) {
  try {
    const tmp = document.createElement('input');
    tmp.value = text;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    showToast('链接已复制到剪贴板');
    document.body.removeChild(tmp);
  } catch {
    showToast('复制失败，请手动选择并复制链接');
  }
}

async function precheckRate(uid) {
  // 可选：向后端预检，读取频控响应头
  try {
    const resp = await fetch(`/api/bangumi/${uid}`, { headers: { 'X-Bili-Calendar-Internal': '1' } });
    const limit = resp.headers.get('X-RateLimit-Limit');
    const remaining = resp.headers.get('X-RateLimit-Remaining');
    const reset = resp.headers.get('X-RateLimit-Reset');
    if (!resp.ok) {
      // 透传一些常见错误
      if (resp.status === 400) throw new Error('UID 非法：只能是数字');
      const body = await resp.json().catch(() => ({}));
      if (resp.status === 403 || body.code === 53013) throw new Error('该用户将追番列表设为隐私，无法获取');
      if (resp.status === 429) throw new Error('请求过于频繁，请稍后再试');
      throw new Error(body.message || `服务异常：HTTP ${resp.status}`);
    }
    return { limit, remaining, reset, ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : '预检失败，请稍后重试' };
  }
}

async function handleSubscribe() {
  const input = document.getElementById('uidInput');
  const loading = document.getElementById('loadingIndicator');
  const resultBox = document.getElementById('resultBox');
  const subscribeUrl = document.getElementById('subscribeUrl');
  const subscribeLink = document.getElementById('subscribeLink');

  let uid = input.value.trim();
  uid = toHalfWidth(uid);

  if (!uid || !/^[0-9]+$/.test(uid)) {
    showToast('请输入有效的 UID (纯数字)');
    return;
  }

  // 显示加载
  loading.style.display = 'block';
  resultBox.style.display = 'none';

  // 预检并读取频控信息
  const pre = await precheckRate(uid);
  if (!pre.ok) {
    loading.style.display = 'none';
    showToast(pre.error);
    return;
  }

  const url = window.location.origin + '/' + uid + '.ics';

  if (isMobile()) {
    setTimeout(() => {
      loading.style.display = 'none';
      // 移动端可尝试直接跳转
      window.location.href = url;
    }, 300);
  } else {
    setTimeout(() => {
      loading.style.display = 'none';
      subscribeUrl.textContent = url;
      subscribeLink.href = url;

      // macOS Safari等支持 webcal 协议
      if (navigator.userAgent.includes('Mac')) {
        subscribeLink.onclick = function (e) {
          e.preventDefault();
          const webcalUrl = url.replace('http://', 'webcal://').replace('https://', 'webcal://');
          window.location.href = webcalUrl;
        };
      }

      resultBox.style.display = 'block';
      resultBox.scrollIntoView({ behavior: 'smooth' });

      if (pre.limit) {
        showToast(`频率限制：${pre.remaining}/${pre.limit}，重置：${pre.reset}`);
      }
    }, 300);
  }
}

// 页面加载动画
document.addEventListener('DOMContentLoaded', function () {
  const container = document.querySelector('.main-container');
  if (container) {
    container.style.opacity = '0';
    container.style.transform = 'translateY(30px)';
    container.style.transition = 'all 0.6s ease';

    setTimeout(() => {
      container.style.opacity = '1';
      container.style.transform = 'translateY(0)';
    }, 100);
  }

  // 绑定回车提交
  const input = document.getElementById('uidInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSubscribe();
    });
  }

  // 强制隐藏结果区域，防止初始显示
  const resultBox = document.getElementById('resultBox');
  if (resultBox) {
    resultBox.style.display = 'none';
  }
});