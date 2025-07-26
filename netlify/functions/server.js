// netlify/functions/server.js
const serverless = require('serverless-http');
const express = require('express');
const path = require('path');
const axios = require('axios');

// 导入主应用逻辑
const app = express();

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
    
    // 清理过期的条目（机会性清理）
    this.cleanup(now);
    
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
    
    // 清理过期的条目（机会性清理）
    this.cleanup(now);
    
    if (!this.store[ip] || now > this.store[ip].resetTime) {
      return this.MAX_REQUESTS;
    }
    
    return Math.max(0, this.MAX_REQUESTS - this.store[ip].count);
  },
  
  // 获取重置时间
  getResetTime(ip) {
    const now = Date.now();
    
    // 清理过期的条目（机会性清理）
    this.cleanup(now);
    
    if (!this.store[ip] || now > this.store[ip].resetTime) {
      return now + this.TIME_WINDOW;
    }
    
    return this.store[ip].resetTime;
  },
  
  // 清理过期的条目
  cleanup(now = Date.now()) {
    for (const ip in this.store) {
      if (now > this.store[ip].resetTime) {
        delete this.store[ip];
      }
    }
  }
};

// 注意：在Netlify函数环境中，因为函数是无状态的，内存存储在每次调用之间不会保留
// 在生产环境中应该考虑使用Redis等外部存储来实现持久化的限流

// 设置跨域支持
app.use((req, res, next) => {
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// 限流中间件
const rateLimiterMiddleware = (req, res, next) => {
  // 获取客户端IP，处理代理和IPv6地址
  let ip = req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null);
  
  // 处理 x-forwarded-for 头部可能包含多个IP地址的情况（逗号分隔）
  if (ip && ip.includes(',')) {
    // 使用第一个IP地址（最原始的客户端IP）
    ip = ip.split(',')[0].trim();
  }
  
  // 处理IPv6地址的格式（例如：::ffff:127.0.0.1）
  if (ip && ip.includes('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  
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

// 提供静态文件服务
app.use(express.static(path.join(__dirname, '../../public')));

// 日志中间件 (简化版，因为Netlify有自己的日志系统)
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`📥 ${req.method} ${req.originalUrl}`);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const statusEmoji = statusCode >= 400 ? '❌' : '✅';
    
    console.log(`${statusEmoji} ${req.method} ${req.originalUrl} - ${statusCode} - ${duration}ms`);
  });
  
  next();
});

// 获取 B站追番数据
app.get('/api/bangumi/:uid', rateLimiterMiddleware, async (req, res, next) => {
  const { uid } = req.params;

  if (!/^\d+$/.test(uid)) {
    console.warn(`⚠️ 无效的UID格式: ${uid}`);
    return res.status(400).json({ 
      error: 'Invalid UID',
      message: 'UID必须是纯数字'
    });
  }

  try {
    const data = await getBangumiData(uid);
    
    if (!data) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: '获取数据失败'
      });
    }
    
    res.json(data);
  } catch (err) {
    console.error(`❌ 处理请求时出错:`, err);
    next(err);
  }
});

// 处理 /{UID} 路径，生成并返回 ICS 文件
app.get('/:uid', async (req, res, next) => {
  const { uid } = req.params;
  const cleanUid = uid.replace('.ics', '');
  
  // 验证 UID 是否为数字
  if (!/^\d+$/.test(cleanUid)) {
    console.warn(`⚠️ 无效的UID格式: ${cleanUid}`);
    return res.status(400).send('❌ 无效的 UID (只允许是数字)');
  }
  
  try {
    console.log(`🔍 处理UID: ${cleanUid}`);
    
    // 调用获取数据函数
    const data = await getBangumiData(cleanUid);
    
    if (!data) {
      return res.status(500).send('获取数据失败');
    }
    
    // 检查API返回的错误码
    if (data.code !== 0) {
      if (data.code === 53013) {
        console.warn(`⚠️ 用户隐私设置限制: ${cleanUid}`);
        return respondWithEmptyCalendar(res, cleanUid, '用户设置为隐私');
      }
      console.error(`❌ B站API错误: ${data.message} (code: ${data.code})`);
      return res.status(500).send(`Bilibili API 错误: ${data.message} (code: ${data.code})`);
    }
    
    // 检查数据列表
    const bangumiList = data.data?.list || [];
    console.log(`📋 获取到番剧列表数量: ${bangumiList.length}`);
    
    if (bangumiList.length === 0) {
      console.warn(`⚠️ 未找到正在播出的番剧: ${cleanUid}`);
      return respondWithEmptyCalendar(res, cleanUid, '未找到正在播出的番剧');
    }
    
    console.log(`📅 生成日历文件`);
    const icsContent = generateICS(bangumiList, cleanUid);
    
    return respondWithICS(res, icsContent, cleanUid);
  } catch (err) {
    console.error(`❌ 处理请求时出错:`, err);
    next(err);
  }
});

// 健康检查接口
app.get('/status', (req, res) => {
  res.send(`✅ Bili-Calendar Service is running here (Netlify Function).`);
});

// 根路径返回前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'index.html'));
});

// 处理404错误 - 为浏览器请求返回HTML页面
app.use((req, res) => {
  // 检查是否为API请求
  if (req.originalUrl.startsWith('/api/')) {
    // API请求返回JSON错误
    console.warn(`⚠️ 404 Not Found: ${req.originalUrl}`);
    return res.status(404).json({ 
      error: 'Not Found',
      message: `路径 ${req.originalUrl} 不存在` 
    });
  } else {
    // 非API请求返回HTML错误页面
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>页面未找到 - Bili-Calendar</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              text-align: center;
              padding: 50px;
              background-color: #f5f5f5;
            }
            .container {
              max-width: 500px;
              margin: 0 auto;
              background: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 {
              color: #e53935;
              font-size: 24px;
              margin-bottom: 20px;
            }
            p {
              color: #666;
              font-size: 16px;
              line-height: 1.6;
            }
            a {
              color: #1976d2;
              text-decoration: none;
              font-weight: 500;
            }
            a:hover {
              text-decoration: underline;
            }
            .error-code {
              font-size: 64px;
              font-weight: bold;
              color: #ddd;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-code">404</div>
            <h1>页面未找到</h1>
            <p>抱歉，您访问的页面不存在。</p>
            <p><a href="/">返回首页</a></p>
          </div>
        </body>
      </html>
    `);
  }
});

// 错误处理中间件（移到所有路由之后）
app.use((err, req, res, next) => {
  console.error(`❌ 服务器错误:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message
  });
});

// 从主文件导入必要的功能函数
async function getBangumiData(uid) {
  try {
    console.log(`🔍 获取用户 ${uid} 的追番数据`);
    const url = `https://api.bilibili.com/x/space/bangumi/follow/list?type=1&follow_status=0&vmid=${uid}&pn=1&ps=30`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Referer: 'https://www.bilibili.com/',
        Cookie: process.env.BILIBILI_COOKIE || ''
      }
    });

    // 检查B站API返回的错误码
    if (response.data.code !== 0) {
      console.warn(`⚠️ B站API返回业务错误: code=${response.data.code}, message=${response.data.message}`);
      
      // 特殊处理一些常见错误
      if (response.data.code === 53013) {
        return {
          error: 'Privacy Settings',
          message: '该用户的追番列表已设为隐私，无法获取',
          code: response.data.code
        };
      }
      
      // 返回原始错误
      return response.data;
    }
    
    // 如果API返回成功，过滤出正在播出的番剧
    if (response.data.data && response.data.data.list) {
      const originalCount = response.data.data.list.length;
      
      // 过滤条件：
      // 1. 番剧的状态不是已完结 (is_finish 为 0)
      // 2. 番剧有播出时间信息 (pub_index 不为空) 或者有更新时间信息 (renewal_time 不为空) 或者有新剧集信息 (new_ep 不为空)
      const currentlyAiring = response.data.data.list.filter(bangumi => {
        // 检查是否未完结 (is_finish: 0 表示连载中，1 表示已完结)
        const isOngoing = bangumi.is_finish === 0;
        
        // 检查是否有播出时间信息
        const hasBroadcastInfo = (bangumi.pub_index && bangumi.pub_index.trim() !== '') ||
                                 (bangumi.renewal_time && bangumi.renewal_time.trim() !== '') ||
                                 (bangumi.new_ep && bangumi.new_ep.pub_time && bangumi.new_ep.pub_time.trim() !== '');
        
        return isOngoing && hasBroadcastInfo;
      });
      
      // 替换原始列表为过滤后的列表
      response.data.data.list = currentlyAiring;
      console.log(`📊 [UID:${uid}] 总共 ${originalCount} 部番剧，过滤后 ${currentlyAiring.length} 部正在播出`);
      
      // 添加自定义字段表明数据已被过滤
      response.data.filtered = true;
      response.data.filtered_count = currentlyAiring.length;
      response.data.original_count = originalCount;
    }
    
    return response.data;
  } catch (err) {
    console.error(`❌ 获取追番数据失败:`, err);
    if (err.response) {
      return {
        error: 'Bilibili API Error',
        message: `B站API返回错误: ${err.response.status}`,
        details: err.response.data
      };
    }
    return null;
  }
}

// 从主应用导入其他必要函数
function generateICS(bangumiList, uid) {
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

  for (const item of bangumiList) {
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

function respondWithICS(res, content, uid) {
  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="bili_bangumi_${uid}.ics"`,
    'Cache-Control': 'public, max-age=3600'
  });
  res.send(content);
}

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

// 将Express应用包装为serverless函数
exports.handler = serverless(app);