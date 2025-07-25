// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
const app = express();

const PORT = process.env.PORT || 3000;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// 设置跨域支持
app.use((req, res, next) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 提供静态文件服务
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

// 日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  // 请求开始日志
  console.log(`[${timestamp}] 📥 ${req.method} ${req.originalUrl} - IP: ${ip}`);
  
  // 响应完成后的日志
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const statusEmoji = statusCode >= 400 ? '❌' : '✅';
    
    console.log(`[${timestamp}] ${statusEmoji} ${req.method} ${req.originalUrl} - ${statusCode} - ${duration}ms`);
  });
  
  next();
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ❌ 服务器错误:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message
  });
});

// 获取 B站追番数据
app.get('/api/bangumi/:uid', async (req, res, next) => {
  const uid = req.params.uid;

  if (!/^\d+$/.test(uid)) {
    console.warn(`[${new Date().toISOString()}] ⚠️ 无效的UID格式: ${uid}`);
    return res.status(400).json({ 
      error: 'Invalid UID',
      message: 'UID必须是纯数字'
    });
  }

  try {
    console.log(`[${new Date().toISOString()}] 🔍 获取用户 ${uid} 的追番数据`);
    const url = `https://api.bilibili.com/x/space/bangumi/follow/list?type=1&follow_status=0&vmid=${uid}&pn=1&ps=30`;

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Referer: 'https://www.bilibili.com/',
        Cookie: process.env.BILIBILI_COOKIE || '' // 使用环境变量传入 Cookie
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${new Date().toISOString()}] ❌ B站API返回错误: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ 
        error: 'Bilibili API Error',
        message: `B站API返回错误: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    // 检查B站API返回的错误码
    if (data.code !== 0) {
      console.warn(`[${new Date().toISOString()}] ⚠️ B站API返回业务错误: code=${data.code}, message=${data.message}`);
      
      // 特殊处理一些常见错误
      if (data.code === 53013) {
        return res.status(403).json({
          error: 'Privacy Settings',
          message: '该用户的追番列表已设为隐私，无法获取',
          code: data.code
        });
      }
      
      // 返回原始错误
      return res.json(data);
    }
    
    // 如果API返回成功，过滤出正在播出的番剧
    if (data.data && data.data.list) {
      const originalCount = data.data.list.length;
      
      // 过滤条件：
      // 1. 番剧的状态不是已完结 (is_finish 为 0)
      // 2. 番剧有播出时间信息 (pub_index 不为空) 或者有更新时间信息 (renewal_time 不为空) 或者有新剧集信息 (new_ep 不为空)
      const currentlyAiring = data.data.list.filter(bangumi => {
        // 检查是否未完结 (is_finish: 0 表示连载中，1 表示已完结)
        const isOngoing = bangumi.is_finish === 0;
        
        // 检查是否有播出时间信息
        const hasBroadcastInfo = (bangumi.pub_index && bangumi.pub_index.trim() !== '') ||
                                   (bangumi.renewal_time && bangumi.renewal_time.trim() !== '') ||
                                   (bangumi.new_ep && bangumi.new_ep.pub_time && bangumi.new_ep.pub_time.trim() !== '');
        
        // 检查最近是否有更新 (可选，如果需要更严格的过滤)
        const hasRecentProgress = bangumi.progress && bangumi.progress.includes('更新至');
        
        return isOngoing && hasBroadcastInfo;
      });
      
      // 替换原始列表为过滤后的列表
      data.data.list = currentlyAiring;
      console.log(`[${new Date().toISOString()}] 📊 [UID:${uid}] 总共 ${originalCount} 部番剧，过滤后 ${currentlyAiring.length} 部正在播出`);
      
      // 添加自定义字段表明数据已被过滤
      data.filtered = true;
      data.filtered_count = currentlyAiring.length;
      data.original_count = originalCount;
    }
    
    res.json(data);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ 处理请求时出错:`, err);
    
    // 使用next(err)将错误传递给错误处理中间件
    next(err);
  }
});

// 健康检查接口
app.get('/status', (req, res) => {
  const uptime = process.uptime();
  const uptimeFormatted = formatUptime(uptime);
  
  res.send(`✅ Bili-Calendar Service is running here.
  
服务状态:
- 运行时间: ${uptimeFormatted}
- 内存使用: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB
- 环境: ${process.env.NODE_ENV || 'development'}
- 端口: ${PORT}
`);
});

// 根路径返回前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 处理 /{UID} 路径，生成并返回 ICS 文件
app.get('/:uid', async (req, res, next) => {
  const uid = req.params.uid.replace('.ics', '');
  
  // 验证 UID 是否为数字
  if (!/^\d+$/.test(uid)) {
    console.warn(`[${new Date().toISOString()}] ⚠️ 无效的UID格式: ${uid}`);
    return res.status(400).send('❌ 无效的 UID (只允许是数字)');
  }
  
  try {
    console.log(`[${new Date().toISOString()}] 🔍 处理UID: ${uid}`);
    
    // 直接调用内部函数获取数据，而不是通过 HTTP 请求
    const data = await getBangumiData(uid);
    
    if (!data) {
      return res.status(500).send('获取数据失败');
    }
    
    // 检查API返回的错误码
    if (data.code !== 0) {
      if (data.code === 53013) {
        console.warn(`[${new Date().toISOString()}] ⚠️ 用户隐私设置限制: ${uid}`);
        return respondWithEmptyCalendar(res, uid, '用户设置为隐私');
      }
      console.error(`[${new Date().toISOString()}] ❌ B站API错误: ${data.message} (code: ${data.code})`);
      return res.status(500).send(`Bilibili API 错误: ${data.message} (code: ${data.code})`);
    }
    
    
    // 检查数据列表
    const bangumiList = data.data?.list || [];
    console.log(`[${new Date().toISOString()}] 📋 获取到番剧列表数量: ${bangumiList.length}`);
    
    if (bangumiList.length === 0) {
      console.warn(`[${new Date().toISOString()}] ⚠️ 未找到正在播出的番剧: ${uid}`);
      return respondWithEmptyCalendar(res, uid, '未找到正在播出的番剧');
    }
    
    console.log(`[${new Date().toISOString()}] 📅 生成日历文件`);
    const icsContent = generateICS(bangumiList, uid);
    
    return respondWithICS(res, icsContent, uid);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ 处理请求时出错:`, err);
    next(err);
  }
});

// 处理404错误
app.use((req, res) => {
  console.warn(`[${new Date().toISOString()}] ⚠️ 404 Not Found: ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Not Found',
    message: `路径 ${req.originalUrl} 不存在` 
  });
});

/**
 * 获取番剧数据的内部函数
 */
async function getBangumiData(uid) {
  try {
    console.log(`[${new Date().toISOString()}] 🔍 获取用户 ${uid} 的追番数据`);
    const url = `https://api.bilibili.com/x/space/bangumi/follow/list?type=1&follow_status=0&vmid=${uid}&pn=1&ps=30`;

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Referer: 'https://www.bilibili.com/',
        Cookie: process.env.BILIBILI_COOKIE || '' // 使用环境变量传入 Cookie
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${new Date().toISOString()}] ❌ B站API返回错误: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    
    // 检查B站API返回的错误码
    if (data.code !== 0) {
      console.warn(`[${new Date().toISOString()}] ⚠️ B站API返回业务错误: code=${data.code}, message=${data.message}`);
      return data;
    }
    
    // 如果API返回成功，过滤出正在播出的番剧
    if (data.data && data.data.list) {
      const originalCount = data.data.list.length;
      
      // 过滤条件：
      // 1. 番剧的状态不是已完结 (is_finish 为 0)
      // 2. 番剧有播出时间信息 (pub_index 不为空) 或者有更新时间信息 (renewal_time 不为空) 或者有新剧集信息 (new_ep 不为空)
      const currentlyAiring = data.data.list.filter(bangumi => {
        // 检查是否未完结 (is_finish: 0 表示连载中，1 表示已完结)
        const isOngoing = bangumi.is_finish === 0;
        
        // 检查是否有播出时间信息
        const hasBroadcastInfo = (bangumi.pub_index && bangumi.pub_index.trim() !== '') ||
                                   (bangumi.renewal_time && bangumi.renewal_time.trim() !== '') ||
                                   (bangumi.new_ep && bangumi.new_ep.pub_time && bangumi.new_ep.pub_time.trim() !== '');
        
        // 检查最近是否有更新 (可选，如果需要更严格的过滤)
        const hasRecentProgress = bangumi.progress && bangumi.progress.includes('更新至');
        
        return isOngoing && hasBroadcastInfo;
      });
      
      // 替换原始列表为过滤后的列表
      data.data.list = currentlyAiring;
      console.log(`[${new Date().toISOString()}] 📊 [UID:${uid}] 总共 ${originalCount} 部番剧，过滤后 ${currentlyAiring.length} 部正在播出`);
      
      // 添加自定义字段表明数据已被过滤
      data.filtered = true;
      data.filtered_count = currentlyAiring.length;
      data.original_count = originalCount;
    }
    
    return data;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ 处理请求时出错:`, err);
    return null;
  }
}

// 格式化运行时间
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}秒`);
  
  return parts.join(' ');
}

/**
 * 生成 ICS 文件内容
 */
function generateICS(bangumis, uid) {
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
    'PRODID:-//BiliCalendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:B站追番 (UID: ${uid})`,
    'X-WR-TIMEZONE:Asia/Shanghai',
    VTIMEZONE_DEFINITION
  ];

  const now = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';

  for (const item of bangumis) {
    // 检查必需字段
    if (!item.title || !item.season_id) {
      continue;
    }

    // 尝试解析播出时间
    let info = parseBroadcastTime(item.pub_index);
    
    // 如果无法从 pub_index 解析，则尝试从 new_ep.pub_time 解析
    if (!info && item.new_ep && item.new_ep.pub_time) {
      info = parseNewEpTime(item.new_ep.pub_time);
    }
    
    // 尝试从renewal_time解析
    if (!info && item.renewal_time) {
      info = parseBroadcastTime(item.renewal_time);
    }

    if (!info) {
      // 即使无法解析时间也创建事件（使用默认时间）
      const defaultDate = new Date();
      const dtstart = formatDate(defaultDate);

      // 构建标题，添加季度信息
      const titleWithSeason = item.season_title && !item.title.includes(item.season_title) ? 
        `${item.title} ${item.season_title}` : item.title;
      // 在描述中添加更新到第几话的信息，并调整顺序
      const descriptionParts = [];
      // 将更新状态移到首行
      if (item.index_show) {
        descriptionParts.push(`更新状态: ${item.index_show}`);
      } else if (item.new_ep && item.new_ep.index_show) {
        descriptionParts.push(`更新状态: ${item.new_ep.index_show}`);
      }
      // 番剧简介放到第二行
      descriptionParts.push(`番剧简介: ${item.evaluate || '暂无简介'}`);
      
      lines.push(
        'BEGIN:VEVENT',
        `UID:${item.season_id}@bilibili.com`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${defaultDate.toISOString().split('T')[0].replace(/-/g, '')}`,
        `SUMMARY:${escapeICSText('[时间未知] ' + titleWithSeason)}`,
        `DESCRIPTION:${escapeICSText(descriptionParts.join('\\n'))}`,
        `URL;VALUE=URI:https://www.bilibili.com/bangumi/play/ss${item.season_id}`,
        'END:VEVENT'
      );
      continue;
    }

    const firstDate = getNextBroadcastDate(info.dayOfWeek, info.time);
    const dtstart = formatDate(firstDate);

    // 准备事件内容
    const eventLines = [
      'BEGIN:VEVENT',
      `UID:${item.season_id}@bilibili.com`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=Asia/Shanghai:${dtstart}`,
    ];

    // 只有连载中的番剧才添加重复规则
    if (item.is_finish === 0) {
      eventLines.push(`RRULE:FREQ=WEEKLY;BYDAY=${info.rruleDay}`);
    }

    // 构建标题，添加季度信息
    const normalTitleWithSeason = item.season_title && !item.title.includes(item.season_title) ? 
      `${item.title} ${item.season_title}` : item.title;
    // 在描述中添加更新到第几话的信息，并调整顺序
    const normalDescriptionParts = [];
    // 将更新状态移到首行
    if (item.index_show) {
      normalDescriptionParts.push(`更新状态: ${item.index_show}`);
    } else if (item.new_ep && item.new_ep.index_show) {
      normalDescriptionParts.push(`更新状态: ${item.new_ep.index_show}`);
    }
    // 番剧简介放到第二行
    normalDescriptionParts.push(`番剧简介: ${item.evaluate || '暂无简介'}`);
    normalDescriptionParts.push(`状态: ${item.is_finish === 0 ? '连载中' : '已完结'}`);
    
    eventLines.push(
      `SUMMARY:${escapeICSText(normalTitleWithSeason)}`,
      `DESCRIPTION:${escapeICSText(normalDescriptionParts.join('\\n'))}`,
      `URL;VALUE=URI:https://www.bilibili.com/bangumi/play/ss${item.season_id}`,
      'END:VEVENT'
    );

    lines.push(...eventLines);
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * 解析播出时间
 */
function parseBroadcastTime(pubIndex) {
  if (!pubIndex) return null;

  const dayMap = { '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
  const rruleMap = { '日': 'SU', '一': 'MO', '二': 'TU', '三': 'WE', '四': 'TH', '五': 'FR', '六': 'SA' };

  // 尝试多种格式
  const patterns = [
    /(?:(?:每周|周)([日一二三四五六]))?.*?(\d{1,2}:\d{2})/,  // 标准格式
    /([日一二三四五六]).*?(\d{1,2}:\d{2})/,                 // 简化格式
    /(\d{1,2}:\d{2})/,                                       // 仅时间
    /(?:.*?日起)?([日一二三四五六])?.*?(\d{1,2}:\d{2})/,      // 包含"日起"的格式
    /(?:.*?起)?([日一二三四五六])?.*?(\d{1,2}:\d{2})/         // 包含"起"的格式
  ];

  for (const pattern of patterns) {
    const match = pubIndex.match(pattern);
    if (match) {
      const dayChar = match[1] || '一'; // 默认周一
      const time = match[2];

      if (dayChar in dayMap) {
        return {
          dayOfWeek: dayMap[dayChar],
          time: time,
          rruleDay: rruleMap[dayChar]
        };
      } else if (time.match(/\d{1,2}:\d{2}/)) {
        // 只有时间，使用默认周一
        return {
          dayOfWeek: 1,
          time: time,
          rruleDay: 'MO'
        };
      }
    }
  }

  return null;
}

/**
 * 获取下一个播出日期
 */
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

/**
 * 解析新剧集时间
 */
function parseNewEpTime(pubTime) {
  if (!pubTime) return null;

  const dayMap = { '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
  const rruleMap = { '日': 'SU', '一': 'MO', '二': 'TU', '三': 'WE', '四': 'TH', '五': 'FR', '六': 'SA' };

  // 尝试解析 "YYYY-MM-DD HH:MM:SS" 格式 (B站标准时间格式)
  const dateTimePattern = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/;
  const dateTimeMatch = pubTime.match(dateTimePattern);
  if (dateTimeMatch) {
    const dateStr = dateTimeMatch[1];
    const timeStr = dateTimeMatch[2].substring(0, 5); // 提取 HH:MM 部分
    
    // 正确解析日期，考虑时区 (B站时间是北京时间 UTC+8)
    const date = new Date(dateStr + 'T' + timeStr + ':00+08:00');
    const dayOfWeek = date.getUTCDay();
    
    // 获取对应的 rruleDay
    const rruleDay = rruleMap[Object.keys(dayMap)[dayOfWeek]];
    
    return {
      dayOfWeek: dayOfWeek,
      time: timeStr,
      rruleDay: rruleDay
    };
  }

  // 尝试解析 "MM月DD日起周四 HH:MM更新" 格式
  const pattern = /(?:.*?日起)?([日一二三四五六])?.*?(\d{1,2}:\d{2})/;
  const match = pubTime.match(pattern);
  if (match) {
    const dayChar = match[1] || '一'; // 默认周一
    const time = match[2];

    if (dayChar in dayMap) {
      return {
        dayOfWeek: dayMap[dayChar],
        time: time,
        rruleDay: rruleMap[dayChar]
      };
    } else if (time.match(/\d{1,2}:\d{2}/)) {
      // 只有时间，使用默认周一
      return {
        dayOfWeek: 1,
        time: time,
        rruleDay: 'MO'
      };
    }
  }

  return null;
}

/**
 * 格式化日期
 */
function formatDate(date) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;
}

/**
 * 转义 ICS 文本
 */
function escapeICSText(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * 返回 ICS 文件
 */
function respondWithICS(res, content, uid) {
  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="bili_bangumi_${uid}.ics"`,
    'Cache-Control': 'public, max-age=3600'
  });
  res.send(content);
}

/**
 * 返回空的日历文件
 */
function respondWithEmptyCalendar(res, uid, reason) {
  const now = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BiliCalendarGenerator//CFW//EN',
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

  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="bili_bangumi_${uid}_empty.ics"`
  });
  res.send(lines.join('\r\n'));
}

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] 🚀 Bili-Calendar service running on port ${PORT}`);
});
