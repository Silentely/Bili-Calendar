// 主题切换功能
function toggleTheme() {
  const body = document.body;
  const themeIcon = document.getElementById('themeIcon');
  const currentTheme = body.getAttribute('data-theme');

  if (currentTheme === 'dark') {
    body.setAttribute('data-theme', 'light');
    themeIcon.classList.remove('fa-sun');
    themeIcon.classList.add('fa-moon');
    localStorage.setItem('theme', 'light');
  } else {
    body.setAttribute('data-theme', 'dark');
    themeIcon.classList.remove('fa-moon');
    themeIcon.classList.add('fa-sun');
    localStorage.setItem('theme', 'dark');
  }
}

// 初始化主题
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  const body = document.body;
  const themeIcon = document.getElementById('themeIcon');

  body.setAttribute('data-theme', savedTheme);

  if (savedTheme === 'dark') {
    themeIcon.classList.remove('fa-moon');
    themeIcon.classList.add('fa-sun');
  } else {
    themeIcon.classList.remove('fa-sun');
    themeIcon.classList.add('fa-moon');
  }
}

function toHalfWidth(str) {
  return str.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
}

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 增强版Toast通知
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast-notification-enhanced';

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-times-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle',
  };

  toast.innerHTML = `
    <div class="toast-content-enhanced ${type}">
      <i class="fas ${icons[type]} toast-icon"></i>
      <span class="toast-message">${message}</span>
      <i class="fas fa-times toast-close" onclick="this.closest('.toast-notification-enhanced').remove()"></i>
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
  }, duration);
}

// 显示进度条
function showProgressBar() {
  const progressBar = document.getElementById('progressBar');
  const progressFill = progressBar.querySelector('.progress-bar');

  progressBar.classList.add('active');
  progressFill.style.width = '0%';

  // 模拟进度
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 30;
    if (progress > 90) {
      progress = 90;
      clearInterval(interval);
    }
    progressFill.style.width = `${progress}%`;
  }, 300);

  return {
    complete: () => {
      clearInterval(interval);
      progressFill.style.width = '100%';
      setTimeout(() => {
        progressBar.classList.remove('active');
      }, 500);
    },
    error: () => {
      clearInterval(interval);
      progressBar.classList.remove('active');
    },
  };
}

// 显示加载遮罩
function showLoadingOverlay(text = '正在处理请求...') {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = overlay.querySelector('.loading-text');

  loadingText.textContent = text;
  overlay.classList.add('active');

  return {
    hide: () => {
      overlay.classList.remove('active');
    },
    updateText: (newText) => {
      loadingText.textContent = newText;
    },
  };
}

// 显示成功/失败动画
function showResultAnimation(success = true) {
  const animation = document.createElement('div');
  animation.className = 'result-animation';
  animation.innerHTML = success
    ? '<div class="success-checkmark"></div>'
    : '<div class="error-cross"></div>';

  document.body.appendChild(animation);

  setTimeout(() => {
    animation.remove();
  }, 1500);
}

function copyToClipboard() {
  const url = document.getElementById('subscribeUrl').textContent;
  if (!url) return;
  // 先尝试异步剪贴板
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        showToast('链接已复制到剪贴板', 'success');
        showResultAnimation(true);
      })
      .catch(() => {
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
    showToast('链接已复制到剪贴板', 'success');
    showResultAnimation(true);
    document.body.removeChild(tmp);
  } catch {
    showToast('复制失败，请手动选择并复制链接', 'error');
    showResultAnimation(false);
  }
}

async function precheckRate(uid) {
  // 先检查缓存
  if (window.cacheManager) {
    const cachedData = cacheManager.getFromCache('bangumi', uid);
    if (cachedData) {
      console.log('使用缓存数据');
      return { ...cachedData, fromCache: true };
    }
  }

  // 可选：向后端预检，读取频控响应头
  try {
    const resp = await fetch(`/api/bangumi/${uid}`);
    const limit = resp.headers.get('X-RateLimit-Limit');
    const remaining = resp.headers.get('X-RateLimit-Remaining');
    const reset = resp.headers.get('X-RateLimit-Reset');

    // 先读取响应body
    let body = {};
    try {
      body = await resp.json();
    } catch {
      // 如果不是JSON响应，继续处理
    }

    if (!resp.ok) {
      // 透传一些常见错误
      if (resp.status === 400) {
        if (window.errorHandler) errorHandler.showErrorModal('INVALID_UID');
        throw new Error('UID 非法：只能是数字');
      }
      if (resp.status === 403 || body.code === 53013) {
        if (window.errorHandler) errorHandler.showErrorModal('PRIVACY_PROTECTED');
        throw new Error('该用户将追番列表设为隐私，无法获取');
      }
      if (resp.status === 404) {
        if (window.errorHandler) errorHandler.showErrorModal('USER_NOT_FOUND');
        throw new Error('用户不存在');
      }
      if (resp.status === 429) {
        if (window.errorHandler) errorHandler.showErrorModal('RATE_LIMITED');
        throw new Error('请求过于频繁，请稍后再试');
      }
      if (window.errorHandler) errorHandler.showErrorModal('SERVER_ERROR', body.message);
      throw new Error(body.message || `服务异常：HTTP ${resp.status}`);
    }

    // 检查是否有番剧数据
    if (body && body.data && body.data.list && body.data.list.length === 0) {
      if (window.errorHandler) errorHandler.showErrorModal('NO_ANIME_FOUND');
      return { ok: false, error: '该用户没有追番记录' };
    }

    const result = { limit, remaining, reset, ok: true, data: body.data };

    // 保存到缓存
    if (window.cacheManager) {
      cacheManager.saveToCache('bangumi', uid, result);
    }

    return result;
  } catch (e) {
    if (!e.message.includes('用户') && !e.message.includes('请求')) {
      if (window.errorHandler) errorHandler.showErrorModal('NETWORK_ERROR');
    }
    return { ok: false, error: e && e.message ? e.message : '预检失败，请稍后重试' };
  }
}

// 处理番剧预览
async function handlePreview() {
  const input = document.getElementById('uidInput') || document.getElementById('uid');
  if (!input) {
    console.error('未找到输入框');
    return;
  }

  let uid = input.value.trim();
  uid = toHalfWidth(uid);

  if (!uid || !/^[0-9]+$/.test(uid)) {
    showToast('请输入有效的 UID (纯数字)', 'warning');
    if (window.errorHandler) errorHandler.showErrorModal('INVALID_UID');
    return;
  }

  const loadingOverlay = showLoadingOverlay('正在获取番剧列表...');

  try {
    let animeData = null;

    // 先检查缓存
    if (window.cacheManager) {
      animeData = cacheManager.getFromCache('anime_list', uid);
      if (animeData) {
        console.log('使用缓存的番剧列表');
        showToast('从缓存加载番剧列表', 'info');
      }
    }

    if (!animeData) {
      // 获取番剧数据
      if (window.animePreview) {
        animeData = await animePreview.fetchAnimeData(uid);

        // 保存到缓存
        if (window.cacheManager && animeData && animeData.length > 0) {
          cacheManager.saveToCache('anime_list', uid, animeData);
        }
      } else {
        throw new Error('预览模块未加载');
      }
    }

    if (animeData && animeData.length > 0) {
      loadingOverlay.hide();

      // 显示预览
      if (window.animePreview) {
        animePreview.showPreview(animeData);
      }

      // 设置生成订阅的回调
      window.currentGenerateCallback = () => {
        handleSubscribe();
      };

      showToast(`成功获取 ${animeData.length} 部番剧`, 'success');
    } else {
      loadingOverlay.hide();
      if (window.errorHandler) errorHandler.showErrorModal('NO_ANIME_FOUND');
    }
  } catch (error) {
    loadingOverlay.hide();
    console.error('预览失败:', error);
    showToast('获取番剧列表失败，请稍后重试', 'error');
  }
}

async function handleSubscribe() {
  const input = document.getElementById('uidInput') || document.getElementById('uid');
  const loading = document.getElementById('loadingIndicator');
  const resultBox = document.getElementById('resultBox');
  const subscribeUrl = document.getElementById('subscribeUrl');
  const subscribeLink = document.getElementById('subscribeLink');

  if (!input) {
    console.error('未找到输入框');
    return;
  }

  let uid = input.value.trim();
  uid = toHalfWidth(uid);

  if (!uid || !/^[0-9]+$/.test(uid)) {
    showToast('请输入有效的 UID (纯数字)', 'warning');
    if (window.errorHandler) errorHandler.showErrorModal('INVALID_UID');
    return;
  }

  // 保存到历史记录（使用缓存管理器）
  if (window.cacheManager) {
    cacheManager.saveUidHistory(uid);
  }

  // 显示加载动画
  const progressBar = showProgressBar();
  const loadingOverlay = showLoadingOverlay('正在生成订阅链接...');
  loading.style.display = 'block';
  resultBox.style.display = 'none';

  try {
    // 如果是直接生成订阅链接，不需要预检
    // 直接生成链接
    const url = window.location.origin + '/' + uid + '.ics';

    // 模拟短暂处理时间
    await new Promise((resolve) => setTimeout(resolve, 800));

    progressBar.complete();
    loadingOverlay.hide();

    if (isMobile()) {
      setTimeout(() => {
        loading.style.display = 'none';
        showToast('正在跳转到订阅链接...', 'info');
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

        showResultAnimation(true);
        showToast('订阅链接生成成功！', 'success');

        // 清除预览回调
        window.currentGenerateCallback = null;
      }, 300);
    }
  } catch (error) {
    progressBar.error();
    loadingOverlay.hide();
    loading.style.display = 'none';
    showToast('发生错误：' + error.message, 'error');
    showResultAnimation(false);
  }
}

// 页面加载动画
document.addEventListener('DOMContentLoaded', function () {
  // 初始化主题
  initTheme();

  // 初始化缓存管理器的自动建议
  if (window.cacheManager) {
    cacheManager.initAutoSuggest();
  }

  // 定期清理过期缓存
  setInterval(() => {
    if (window.cacheManager) {
      cacheManager.cleanExpiredCache();
    }
  }, 600000); // 每10分钟清理一次

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

  // 添加键盘快捷键支持
  document.addEventListener('keydown', function (e) {
    // Alt + T 切换主题
    if (e.altKey && e.key === 't') {
      e.preventDefault();
      toggleTheme();
    }
    // Alt + G 生成订阅链接
    if (e.altKey && e.key === 'g') {
      e.preventDefault();
      handleSubscribe();
    }
    // Alt + P 预览番剧
    if (e.altKey && e.key === 'p') {
      e.preventDefault();
      handlePreview();
    }
  });

  // 注入当前年份到版权占位符
  try {
    const yearEl = document.getElementById('copyrightYear');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  } catch {}
});

// 供 HTML 与外部脚本调用，避免构建时被当作未使用
window.copyToClipboard = copyToClipboard;
window.precheckRate = precheckRate;
