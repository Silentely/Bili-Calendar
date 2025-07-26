// main.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const app = express();

const PORT = process.env.PORT || 3000;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// 创建简单的内存存储限流器
const rateLimiter = {
  // 存储结构 { ip: { count: 0, resetTime: timestamp } }
  store: {},
  
  // 环境变量控制限制
  MAX_REQUESTS: process.env.API_RATE_LIMIT || 3, // 默认每小时3次
  TIME_WINDOW: process.env.API_RATE_WINDOW || 60 * 60 * 1000, // 默认1小时(毫秒)
  ENABLED: process.env.ENABLE_RATE_LIMIT !== 'false', // 默认启用
  
  // 检查并递增计数
  check(ip) {
    const now = Date.now();
    
    // 如果功能被禁用，始终允许请求
    if (!this.ENABLED) return true;
    
    // 初始化或重置过期的限制
    if (!this.store[ip] || now > this.store[ip].resetTime) {
      this.store[ip] = {
        count: 1,
        resetTime: now + this.TIME_WINDOW
      };
      return true;
    }
    
    // 检查是否达到限制
    if (this.store[ip].count >= this.MAX_REQUESTS) {
      return false;
    }
    
    // 递增计数
    this.store[ip].count += 1;
    return true;
  },
  
  // 获取剩余可用次数
  getRemainingRequests(ip) {
    const now = Date.now();
    
    if (!this.store[ip] || now > this.store[ip].resetTime) {
      return this.MAX_REQUESTS;
    }
    
    return Math.max(0, this.MAX_REQUESTS - this.store[ip].count);
  },
  
  // 获取重置时间
  getResetTime(ip) {
    const now = Date.now();
    
    if (!this.store[ip] || now > this.store[ip].resetTime) {
      return now + this.TIME_WINDOW;
    }
    
    return this.store[ip].resetTime;
  },
  
  // 清理过期的记录 (定期调用)
  cleanup() {
    const now = Date.now();
    for (const ip in this.store) {
      if (now > this.store[ip].resetTime) {
        delete this.store[ip];
      }
    }
  }
};

// 每小时清理一次过期的限流记录
setInterval(() => rateLimiter.cleanup(), 60 * 60 * 1000);

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

// 限流中间件
const rateLimiterMiddleware = (req, res, next) => {
  // 获取客户端IP
  const ip = req.headers['x-forwarded-for'] || 
             req.connection.remoteAddress || 
             req.socket.remoteAddress ||
             (req.connection.socket ? req.connection.socket.remoteAddress : null);
  
  // 区分内部调用和外部直接访问
  const isDirectAccess = !req.headers['x-bili-calendar-internal'];
  
  // 仅对直接访问应用限流
  if (isDirectAccess && !rateLimiter.check(ip)) {
    const resetTime = new Date(rateLimiter.getResetTime(ip)).toISOString();
    
    // 设置速率限制响应头
    res.setHeader('X-RateLimit-Limit', rateLimiter.MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', resetTime);
    
    return res.status(429).json({
      error: '请求过于频繁',
      message: `API调用次数已达上限，请在${resetTime}后再试`,
      limit: rateLimiter.MAX_REQUESTS,
      window: '1小时',
      reset: resetTime
    });
  }
  
  // 对于允许的请求，设置剩余次数响应头
  if (isDirectAccess) {
    res.setHeader('X-RateLimit-Limit', rateLimiter.MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', rateLimiter.getRemainingRequests(ip));
    res.setHeader('X-RateLimit-Reset', new Date(rateLimiter.getResetTime(ip)).toISOString());
  }
  
  next();
};

// 获取 B站追番数据
app.get('/api/bangumi/:uid', rateLimiterMiddleware, async (req, res, next) => {
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
 * Fetches and filters the Bilibili bangumi (anime) follow list for a given user ID.
 *
 * Retrieves the user's followed bangumi list from the Bilibili API, handling HTTP and API errors.
 * Filters the list to include only currently airing series (not finished and with broadcast or update information).
 * Adds metadata about the filtering process to the returned object.
 *
 * @param {string|number} uid - The Bilibili user ID.
 * @returns {Promise<Object|null>} The filtered bangumi data object, or null if the request fails.
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

/**
 * Converts a duration in seconds to a human-readable string in Chinese, including days, hours, minutes, and seconds.
 * @param {number} seconds - The total number of seconds to format.
 * @return {string} The formatted uptime string in Chinese.
 */
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
 * Generates an ICS calendar file containing events for each currently airing Bilibili bangumi series.
 *
 * For each bangumi, creates a calendar event with broadcast time (if available), title, update status, airing status, and a link to the Bilibili page. If broadcast time cannot be determined, the event is marked as having unknown time. Ongoing series include a weekly recurrence rule.
 *
 * @param {Array<Object>} bangumis - List of bangumi objects to include in the calendar.
 * @param {string|number} uid - The Bilibili user ID for whom the calendar is generated.
 * @return {string} The generated ICS calendar content as a string.
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
      
      // 在描述中添加更新到第几话的信息，使用emoji分隔符而非换行
      let description = "";
      
      // 更新状态
      if (item.index_show) {
        description += `🌟 更新状态: ${item.index_show}`;
      } else if (item.new_ep && item.new_ep.index_show) {
        description += `🌟 更新状态: ${item.new_ep.index_show}`;
      }
      
      // 添加连载状态 (带emoji分隔符)
      description += ` ➡️ 状态: ${item.is_finish === 0 ? '连载中' : '已完结'}`;
      
      // 番剧简介 (带emoji分隔符)
      description += ` ✨ 番剧简介: ${item.evaluate || '暂无简介'}`;
      
      lines.push(
        'BEGIN:VEVENT',
        `UID:${item.season_id}@bilibili.com`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${defaultDate.toISOString().split('T')[0].replace(/-/g, '')}`,
        `SUMMARY:${escapeICSText('[时间未知] ' + titleWithSeason)}`,
        `DESCRIPTION:${escapeICSText(description)}`,
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

    // 只有连载中的番剧才添加重复规则，限制为2次
    if (item.is_finish === 0) {
      eventLines.push(`RRULE:FREQ=WEEKLY;COUNT=2;BYDAY=${info.rruleDay}`);
    }

    // 构建标题，添加季度信息
    const normalTitleWithSeason = item.season_title && !item.title.includes(item.season_title) ? 
      `${item.title} ${item.season_title}` : item.title;
    
    // 在描述中添加更新到第几话的信息，使用emoji分隔符而非换行
    let normalDescription = "";
    
    // 更新状态
    if (item.index_show) {
      normalDescription += `🌟 更新状态: ${item.index_show}`;
    } else if (item.new_ep && item.new_ep.index_show) {
      normalDescription += `🌟 更新状态: ${item.new_ep.index_show}`;
    }
    
    // 添加连载状态 (带emoji分隔符)
    normalDescription += ` ➡️ 状态: ${item.is_finish === 0 ? '连载中' : '已完结'}`;
    
    // 番剧简介 (带emoji分隔符)
    normalDescription += ` ✨ 番剧简介: ${item.evaluate || '暂无简介'}`;
    
    eventLines.push(
      `SUMMARY:${escapeICSText(normalTitleWithSeason)}`,
      `DESCRIPTION:${escapeICSText(normalDescription)}`,
      `URL;VALUE=URI:https://www.bilibili.com/bangumi/play/ss${item.season_id}`,
      'END:VEVENT'
    );

    lines.push(...eventLines);
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Parses a broadcast time string in Chinese and extracts the day of week and time.
 *
 * Attempts to interpret various common formats describing weekly broadcast schedules, returning the corresponding day of week (0-6, Sunday-Saturday), time string, and RRULE day code for calendar recurrence. Returns null if parsing fails.
 *
 * @param {string} pubIndex - The broadcast time description, typically in Chinese (e.g., "每周三 20:00").
 * @return {Object|null} An object with `dayOfWeek`, `time`, and `rruleDay` properties, or null if parsing is unsuccessful.
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
 * Calculates the next occurrence of a specified weekday and time in the Asia/Shanghai timezone.
 * @param {number} targetDay - The target day of the week (0 for Sunday, 6 for Saturday).
 * @param {string} timeStr - The target time in "HH:mm" format.
 * @return {Date} The Date object representing the next broadcast date and time in Asia/Shanghai timezone.
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
 * Parses a Bilibili new episode publish time string and extracts the broadcast weekday and time.
 *
 * Supports both standard datetime formats (e.g., "YYYY-MM-DD HH:MM:SS") and descriptive formats (e.g., "每周四 20:00更新").
 *
 * @param {string} pubTime - The publish time string to parse.
 * @return {Object|null} An object containing `dayOfWeek` (0-6, Sunday-Saturday), `time` ("HH:MM"), and `rruleDay` (ICS weekday code), or null if parsing fails.
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
 * Formats a Date object as an ICS-compatible UTC datetime string (YYYYMMDDTHHMMSS).
 * @param {Date} date - The date to format.
 * @return {string} The formatted datetime string in UTC.
 */
function formatDate(date) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`;
}

/**
 * Escapes special characters in a string for use in ICS (iCalendar) text fields.
 * Replaces backslashes, semicolons, commas, and newlines with their ICS-escaped equivalents.
 * @param {string} text - The text to escape for ICS formatting.
 * @return {string} The escaped ICS-compatible text.
 */
function escapeICSText(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * Sends an ICS calendar file as a downloadable response for the specified user.
 * @param {object} res - Express response object.
 * @param {string} content - The ICS file content to send.
 * @param {string|number} uid - The user ID used in the filename.
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
 * Sends an empty ICS calendar file indicating failure to retrieve bangumi information for the specified user.
 * 
 * The calendar contains a single event summarizing the reason for the failure.
 * @param {object} res - Express response object.
 * @param {string|number} uid - The user ID for whom the calendar was requested.
 * @param {string} [reason] - Optional reason describing why the bangumi information could not be retrieved.
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

export { app };