// netlify/functions/server.js
const serverless = require('serverless-http');
const express = require('express');
const path = require('path');

// 导入主应用逻辑
const app = express();

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

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(`❌ 服务器错误:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message
  });
});

// 获取 B站追番数据
app.get('/api/bangumi/:uid', async (req, res, next) => {
  const uid = req.params.uid;

  if (!/^\d+$/.test(uid)) {
    console.warn(`⚠️ 无效的UID格式: ${uid}`);
    return res.status(400).json({ 
      error: 'Invalid UID',
      message: 'UID必须是纯数字'
    });
  }

  try {
    console.log(`🔍 获取用户 ${uid} 的追番数据`);
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
      console.error(`❌ B站API返回错误: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ 
        error: 'Bilibili API Error',
        message: `B站API返回错误: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    // 检查B站API返回的错误码
    if (data.code !== 0) {
      console.warn(`⚠️ B站API返回业务错误: code=${data.code}, message=${data.message}`);
      
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
        
        return isOngoing && hasBroadcastInfo;
      });
      
      // 替换原始列表为过滤后的列表
      data.data.list = currentlyAiring;
      console.log(`📊 [UID:${uid}] 总共 ${originalCount} 部番剧，过滤后 ${currentlyAiring.length} 部正在播出`);
      
      // 添加自定义字段表明数据已被过滤
      data.filtered = true;
      data.filtered_count = currentlyAiring.length;
      data.original_count = originalCount;
    }
    
    res.json(data);
  } catch (err) {
    console.error(`❌ 处理请求时出错:`, err);
    next(err);
  }
});

// 处理 /{UID} 路径，生成并返回 ICS 文件
app.get('/:uid', async (req, res, next) => {
  const uid = req.params.uid.replace('.ics', '');
  
  // 验证 UID 是否为数字
  if (!/^\d+$/.test(uid)) {
    console.warn(`⚠️ 无效的UID格式: ${uid}`);
    return res.status(400).send('❌ 无效的 UID (只允许是数字)');
  }
  
  try {
    console.log(`🔍 处理UID: ${uid}`);
    
    // 调用获取数据函数
    const data = await getBangumiData(uid);
    
    if (!data) {
      return res.status(500).send('获取数据失败');
    }
    
    // 检查API返回的错误码
    if (data.code !== 0) {
      if (data.code === 53013) {
        console.warn(`⚠️ 用户隐私设置限制: ${uid}`);
        return respondWithEmptyCalendar(res, uid, '用户设置为隐私');
      }
      console.error(`❌ B站API错误: ${data.message} (code: ${data.code})`);
      return res.status(500).send(`Bilibili API 错误: ${data.message} (code: ${data.code})`);
    }
    
    // 检查数据列表
    const bangumiList = data.data?.list || [];
    console.log(`📋 获取到番剧列表数量: ${bangumiList.length}`);
    
    if (bangumiList.length === 0) {
      console.warn(`⚠️ 未找到正在播出的番剧: ${uid}`);
      return respondWithEmptyCalendar(res, uid, '未找到正在播出的番剧');
    }
    
    console.log(`📅 生成日历文件`);
    const icsContent = generateICS(bangumiList, uid);
    
    return respondWithICS(res, icsContent, uid);
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

// 处理404错误
app.use((req, res) => {
  console.warn(`⚠️ 404 Not Found: ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Not Found',
    message: `路径 ${req.originalUrl} 不存在` 
  });
});

// 从主文件导入必要的功能函数
function getBangumiData(uid) {
  // 实现与主server.js相同的函数...
  // 为简化示例，此处只包含基本实现
  return fetchBangumiData(uid);
}

async function fetchBangumiData(uid) {
  try {
    console.log(`🔍 获取用户 ${uid} 的追番数据`);
    const url = `https://api.bilibili.com/x/space/bangumi/follow/list?type=1&follow_status=0&vmid=${uid}&pn=1&ps=30`;

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Referer: 'https://www.bilibili.com/',
        Cookie: process.env.BILIBILI_COOKIE || ''
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ B站API返回错误: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    
    if (data.code !== 0) {
      return data;
    }
    
    if (data.data && data.data.list) {
      const originalCount = data.data.list.length;
      
      const currentlyAiring = data.data.list.filter(bangumi => {
        const isOngoing = bangumi.is_finish === 0;
        
        const hasBroadcastInfo = (bangumi.pub_index && bangumi.pub_index.trim() !== '') ||
                                 (bangumi.renewal_time && bangumi.renewal_time.trim() !== '') ||
                                 (bangumi.new_ep && bangumi.new_ep.pub_time && bangumi.new_ep.pub_time.trim() !== '');
        
        return isOngoing && hasBroadcastInfo;
      });
      
      data.data.list = currentlyAiring;
      
      data.filtered = true;
      data.filtered_count = currentlyAiring.length;
      data.original_count = originalCount;
    }
    
    return data;
  } catch (err) {
    console.error(`❌ 处理请求时出错:`, err);
    return null;
  }
}

// ICS生成和响应函数 (从主server.js简化导入)
function generateICS(bangumis, uid) {
  // 实现基本的ICS生成...
  const now = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 15) + 'Z';
  
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BiliCalendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:B站追番 (UID: ${uid})`,
    'X-WR-TIMEZONE:Asia/Shanghai',
  ];

  // 为简化，这里只添加一个简单事件
  lines.push(
    'BEGIN:VEVENT',
    `UID:sample-${uid}@bilibili.com`,
    `DTSTAMP:${now}`,
    `DTSTART:${now.substring(0, 8)}T000000Z`,
    'SUMMARY:B站追番日历 (Netlify部署版)',
    'DESCRIPTION:请订阅完整版获取详细追番信息',
    'END:VEVENT',
    'END:VCALENDAR'
  );

  return lines.join('\r\n');
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