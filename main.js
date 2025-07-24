/**
 * Bilibili Bangumi Calendar Worker (Debug Version)
 * 
 * 这个版本会输出详细的调试信息，帮助我们找到问题根源
 */

export default {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const path = url.pathname;
      
      // 记录请求信息
      const requestId = generateRequestId();
      const startTime = Date.now();
      console.log(`[${requestId}] 📥 请求开始: ${url.toString()}`);
  
      try {
        // Display the landing page for the root path
        if (path === '/') {
          console.log(`[${requestId}] 📄 返回首页`);
          return new Response(getLandingPage(), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
    
        // Extract UID from the path
        const uid = path.substring(1).replace('.ics', '');
    
        // Validate if UID consists of digits
        if (!/^\d+$/.test(uid)) {
          console.warn(`[${requestId}] ⚠️ 无效的UID: ${uid}`);
          return new Response('❌ 无效的 UID (只允许是数字)', {
            status: 400,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
    
        console.log(`[${requestId}] 🔍 处理UID: ${uid}`);
        
        // 动态获取当前请求的主机名作为代理基础URL
        const currentHost = url.hostname;
        const protocol = url.protocol;
        const port = url.port ? `:${url.port}` : '';
        
        // 构建代理URL，使用同一个主机的API端点
        const PROXY_BASE_URL = `${protocol}//${currentHost}${port}/api/bangumi/`;
        
        const proxyUrl = `${PROXY_BASE_URL}${uid}`;
        
        console.log(`[${requestId}] 🔗 使用代理URL: ${proxyUrl}`);
        
        const res = await fetch(proxyUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'X-Request-ID': requestId
          }
        }).catch(err => {
          console.error(`[${requestId}] ❌ 代理请求失败:`, err);
          throw new Error(`代理请求失败: ${err.message}`);
        });
    
        if (!res.ok) {
          const errorText = await res.text();
          console.error(`[${requestId}] ❌ 代理响应错误: ${res.status} - ${errorText}`);
          throw new Error(`访问代理失败: ${res.status} - ${errorText}`);
        }
    
        const json = await res.json().catch(err => {
          console.error(`[${requestId}] ❌ 解析JSON失败:`, err);
          throw new Error(`解析代理响应失败: ${err.message}`);
        });
        
        // 调试：输出响应状态
        console.log(`[${requestId}] 📊 API响应状态: code=${json.code}, message=${json.message || 'N/A'}`);
        
        // 检查是否已过滤
        if (json.filtered) {
          console.log(`[${requestId}] 🔍 已过滤番剧: ${json.filtered_count}/${json.original_count}`);
        }
    
        // 调试：检查响应格式
        if (json.code !== 0) {
          if (json.code === 53013) {
            console.warn(`[${requestId}] ⚠️ 用户隐私设置限制: ${uid}`);
            return respondWithEmptyCalendar(uid, '用户设置为隐私');
          }
          console.error(`[${requestId}] ❌ B站API错误: ${json.message} (code: ${json.code})`);
          throw new Error(`Bilibili API 错误: ${json.message} (code: ${json.code})`);
        }
    
        // 调试：检查数据列表
        const bangumiList = json.data?.list || [];
        console.log(`[${requestId}] 📋 获取到番剧列表数量: ${bangumiList.length}`);
        
        // 调试：输出前几个番剧的简要信息
        if (bangumiList.length > 0) {
          const sampleData = bangumiList.slice(0, 3).map(item => ({
            title: item.title,
            pub_index: item.pub_index,
            is_finish: item.is_finish
          }));
          console.log(`[${requestId}] 📺 前3个番剧样例:`, JSON.stringify(sampleData));
        }
    
        if (bangumiList.length === 0) {
          console.warn(`[${requestId}] ⚠️ 未找到正在播出的番剧: ${uid}`);
          return respondWithEmptyCalendar(uid, '未找到正在播出的番剧');
        }
        
        console.log(`[${requestId}] 📅 生成日历文件`);
        const icsContent = generateICSWithDebug(bangumiList, uid, requestId);
        
        const duration = Date.now() - startTime;
        console.log(`[${requestId}] ✅ 请求完成: 耗时${duration}ms`);
        
        return respondWithICS(icsContent, uid);
    
      } catch (err) {
        const duration = Date.now() - startTime;
        console.error(`[${requestId}] ❌ 处理请求时出错 (${duration}ms):`, err);
        return new Response(`❌ 服务器错误: ${err.message}`, {
          status: 500,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    }
  };
  
  /**
   * 生成请求ID
   */
  function generateRequestId() {
    return Math.random().toString(36).substring(2, 10);
  }
  
  /**
   * 带调试信息的 ICS 生成函数
   */
  function generateICSWithDebug(bangumis, uid, requestId = 'unknown') {
    const VTIMEZONE_DEFINITION = `BEGIN:VTIMEZONE
  TZID:Asia/Shanghai
  BEGIN:STANDARD
  DTSTART:19700101T000000
  TZOFFSETFROM:+0800
  TZOFFSETTO:+0800
  TZNAME:CST
  END:STANDARD
  END:VTIMEZONE`;
  
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//BilibiliCalendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:Bilibili 追番 (UID: ${uid})`,
      'X-WR-TIMEZONE:Asia/Shanghai',
      VTIMEZONE_DEFINITION
    ];
  
    const now = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';
    let processedCount = 0;
    let skippedCount = 0;
  
    for (const item of bangumis) {
      console.log(`[${requestId}] 🎬 处理番剧: ${item.title} (${item.season_id})`);
      
      // 检查必需字段
      if (!item.title || !item.season_id) {
        console.log(`[${requestId}] ⏭️ 跳过: ${item.title || '未知标题'} - 缺少必要字段`);
        skippedCount++;
        continue;
      }
  
      const info = parseBroadcastTime(item.pub_index, requestId);
      
      if (!info) {
        // 即使无法解析时间也创建事件（使用默认时间）
        const defaultDate = new Date();
        const dtstart = formatDate(defaultDate);
        
        console.log(`[${requestId}] ⚠️ 无法解析时间: ${item.title} - 使用默认时间`);
        
        lines.push(
          'BEGIN:VEVENT',
          `UID:${item.season_id}@bilibili.com`,
          `DTSTAMP:${now}`,
          `DTSTART;VALUE=DATE:${defaultDate.toISOString().split('T')[0].replace(/-/g, '')}`,
          `SUMMARY:${escapeICSText('[时间未知] ' + item.title)}`,
          `DESCRIPTION:${escapeICSText(`番剧状态: ${item.progress || '未知'}\\n详情页: https://www.bilibili.com/bangumi/play/ss${item.season_id}`)}`,
          `URL;VALUE=URI:https://www.bilibili.com/bangumi/play/ss${item.season_id}`,
          'END:VEVENT'
        );
        processedCount++;
        continue;
      }
  
      console.log(`[${requestId}] ✅ 时间解析成功: ${item.title} - 周${['日','一','二','三','四','五','六'][info.dayOfWeek]} ${info.time}`);
      
      const firstDate = getNextBroadcastDate(info.dayOfWeek, info.time);
      const dtstart = formatDate(firstDate);
  
      lines.push(
        'BEGIN:VEVENT',
        `UID:${item.season_id}@bilibili.com`,
        `DTSTAMP:${now}`,
        `DTSTART;TZID=Asia/Shanghai:${dtstart}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${info.rruleDay}`,
        `SUMMARY:${escapeICSText(item.title)}`,
        `DESCRIPTION:${escapeICSText(`番剧状态: ${item.progress || '未知'}\\n详情页: https://www.bilibili.com/bangumi/play/ss${item.season_id}`)}`,
        `URL;VALUE=URI:https://www.bilibili.com/bangumi/play/ss${item.season_id}`,
        'END:VEVENT'
      );
      processedCount++;
    }
  
    console.log(`[${requestId}] 📊 日历生成统计: 处理成功=${processedCount}, 跳过=${skippedCount}, 总计=${bangumis.length}`);
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
  
  /**
   * 更宽松的时间解析函数
   */
  function parseBroadcastTime(pubIndex, requestId = 'unknown') {
      if (!pubIndex) return null;
      
      console.log(`[${requestId}] 🕒 解析时间字符串: "${pubIndex}"`);
      
      const dayMap = { '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
      const rruleMap = { '日': 'SU', '一': 'MO', '二': 'TU', '三': 'WE', '四': 'TH', '五': 'FR', '六': 'SA' };
  
      // 尝试多种格式
      const patterns = [
          /(?:(?:每周|周)([日一二三四五六]))?.*?(\\d{1,2}:\\d{2})/,  // 标准格式
          /([日一二三四五六]).*?(\\d{1,2}:\\d{2})/,                 // 简化格式
          /(\\d{1,2}:\\d{2})/                                       // 仅时间
      ];
  
      for (const pattern of patterns) {
          const match = pubIndex.match(pattern);
          if (match) {
              console.log(`[${requestId}] ✅ 匹配成功:`, match);
              const dayChar = match[1] || '一'; // 默认周一
              const time = match[2] || match[1]; // 如果只有时间
              
              if (dayChar in dayMap) {
                  return {
                      dayOfWeek: dayMap[dayChar],
                      time: time,
                      rruleDay: rruleMap[dayChar]
                  };
              } else if (time.match(/\\d{1,2}:\\d{2}/)) {
                  // 只有时间，使用默认周一
                  return {
                      dayOfWeek: 1,
                      time: time,
                      rruleDay: 'MO'
                  };
              }
          }
      }
      
      console.log(`[${requestId}] ❌ 无法匹配任何时间格式: "${pubIndex}"`);
      return null;
  }
  
  // ... 其他辅助函数保持不变 ...
  
  function getLandingPage() {
    return `<!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bilibili 追番日历订阅</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background-color: #f4f4f5; padding: 20px 0; }
      .container { text-align: center; background: white; padding: 2rem 3rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 90%; width: 500px; }
      h1 { color: #fb7299; margin-top: 0; }
      p { color: #666; line-height: 1.6; }
      .input-group { display: flex; margin-top: 1.5rem; }
      input { flex-grow: 1; padding: 0.8rem; border: 1px solid #ddd; border-radius: 8px 0 0 8px; font-size: 1rem; min-width: 180px; }
      input:focus { outline: none; border-color: #00a1d6; }
      button { padding: 0.8rem 1.5rem; background-color: #00a1d6; border: none; color: white; font-size: 1rem; border-radius: 0 8px 8px 0; cursor: pointer; transition: background-color 0.2s; }
      button:hover { background-color: #00b5e5; }
      .info-box { background-color: #f8f9fa; border-left: 4px solid #00a1d6; padding: 1rem; margin-top: 2rem; text-align: left; border-radius: 0 8px 8px 0; }
      .info-box h3 { margin-top: 0; color: #00a1d6; }
      .info-box ul { padding-left: 1.5rem; margin-bottom: 0.5rem; }
      .info-box li { margin-bottom: 0.5rem; }
      .help-text { font-size: 0.9rem; color: #888; margin-top: 0.5rem; text-align: left; }
      .loading { display: none; margin-top: 1rem; }
      .spinner { display: inline-block; width: 20px; height: 20px; border: 3px solid rgba(0, 161, 214, 0.3); border-radius: 50%; border-top-color: #00a1d6; animation: spin 1s ease-in-out infinite; margin-right: 8px; vertical-align: middle; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Bilibili 追番日历订阅</h1>
      <p>输入您的 Bilibili 用户 ID (UID)，获取正在播出的追番日历订阅链接</p>
      <div class="input-group">
        <input type="text" id="uidInput" placeholder="例如: 614500" onkeydown="if(event.key==='Enter') handleSubscribe()">
        <button onclick="handleSubscribe()">生成订阅</button>
      </div>
      <div class="help-text">UID 可在 B 站个人空间网址中找到，例如：space.bilibili.com/<strong>614500</strong></div>
      
      <div class="loading" id="loadingIndicator">
        <span class="spinner"></span> 正在获取数据，请稍候...
      </div>
      
      <div class="info-box">
        <h3>📅 关于此工具</h3>
        <ul>
          <li><strong>只包含正在播出</strong>的追番，已完结的不会显示</li>
          <li>生成的日历可添加到 Apple 日历、Google 日历、Outlook 等</li>
          <li>每集更新时间会自动添加到您的日历中</li>
          <li>日历链接长期有效，无需重复订阅</li>
        </ul>
        <p>注意：您的追番数据必须是公开的，否则无法获取</p>
      </div>
    </div>
    <script>
      function toHalfWidth(str) {
        return str.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
      }
      function handleSubscribe() {
        const input = document.getElementById('uidInput');
        const loading = document.getElementById('loadingIndicator');
        let uid = input.value.trim();
        
        uid = toHalfWidth(uid);
        
        if (!uid || !/^[0-9]+$/.test(uid)) {
          alert('请输入有效的 UID (纯数字)');
          return;
        }
        
        // 显示加载指示器
        loading.style.display = 'block';
        
        // 延迟跳转，让用户看到加载动画
        setTimeout(() => {
          window.location.href = '/' + uid;
        }, 500);
      }
    </script>
  </body>
  </html>`;
  }
  
  function respondWithICS(content, uid) {
    return new Response(content, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="bilibili_bangumi_${uid}.ics"`,
        'Cache-Control': 'public, max-age=3600'
      }
    });
  }
  
  function respondWithEmptyCalendar(uid, reason) {
      const now = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';
      const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
      const lines = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//BilibiliCalendarGenerator//CFW//EN',
          'CALSCALE:GREGORIAN',
          'METHOD:PUBLISH',
          'X-WR-CALNAME:B站追番（无内容）',
          'X-WR-TIMEZONE:Asia/Shanghai',
          'BEGIN:VTIMEZONE',
          'TZID:Asia/Shanghai',
          'BEGIN:STANDARD',
          'DTSTART:19700101T000000',
          'TZOFFSETFROM:+0800',
          'TZOFFSETTO:+0800',
          'TZNAME:CST',
          'END:STANDARD',
          'END:VTIMEZONE',
          'BEGIN:VEVENT',
          'UID:error-' + uid + '@bilibili.com',
          'DTSTAMP:' + now,
          'DTSTART;VALUE=DATE:' + date,
          'SUMMARY:无法获取番剧信息：' + (reason || '未知'),
          'END:VEVENT',
          'END:VCALENDAR'
      ];
  
      return new Response(lines.join('\r\n'), {
          headers: {
              'Content-Type': 'text/calendar; charset=utf-8',
              'Content-Disposition': 'attachment; filename="bilibili_bangumi_' + uid + '_empty.ics"'
          }
      });
  }
  
  function getNextBroadcastDate(targetDay, timeStr) {
      const now = new Date();
      const [hh, mm] = timeStr.split(':').map(Number);
  
      const utcOffset = 8 * 60;
      const nowInShanghai = new Date(now.getTime() + utcOffset * 60 * 1000);
  
      const today = nowInShanghai.getUTCDay();
      let diff = (targetDay - today + 7) % 7;
  
      if (diff === 0) {
          const currH = nowInShanghai.getUTCHours();
          const currM = nowInShanghai.getUTCMinutes();
  
          if (currH > hh || (currH === hh && currM >= mm)) {
              diff = 7;
          }
      }
  
      const nextDate = new Date(nowInShanghai);
      nextDate.setUTCDate(nextDate.getUTCDate() + diff);
      nextDate.setUTCHours(hh, mm, 0, 0);
  
      return nextDate;
  }
  
  function formatDate(date) {
      const pad = (n) => n.toString().padStart(2, '0');
      return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;
  }
  
  function escapeICSText(text) {
      return text
          .replace(/\\/g, "\\\\")
          .replace(/;/g, "\\;")
          .replace(/,/g, "\\,")
          .replace(/\n/g, "\\n");
  }