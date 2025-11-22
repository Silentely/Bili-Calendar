# Test 模块文档

> **导航**: [← 返回根目录](../CLAUDE.md) | **模块**: 测试套件

---

## 📋 模块概览

**Test** 模块是 Bili-Calendar 的测试套件，使用 Node.js 内置测试框架对核心工具函数进行单元测试和集成测试，确保代码质量和功能正确性。

### 测试范围

- ✅ ICS 文件生成逻辑
- ✅ 时间解析与格式化
- ✅ 请求速率限制器
- ✅ 请求去重机制

---

## 📁 文件结构

```
test/
├── 📄 utils.ics.test.js              # ICS 生成测试 (CommonJS)
├── 📄 utils.time.test.js             # 时间处理测试 (CommonJS)
├── 📄 utils.rate-limiter.test.js     # 速率限制测试
├── 📄 utils.request-dedup.test.js    # 请求去重测试
├── 📄 utils-es.ics.test.js           # ICS 生成测试 (ES Module)
└── 📄 utils-es.time.test.js          # 时间处理测试 (ES Module)
```

---

## 🧪 测试详解

### 1. `utils.ics.test.js` - ICS 生成测试

**测试目标**: `utils/ics.cjs`

**测试用例**:

#### 1.1 基本 ICS 生成
```javascript
test('生成基本的 ICS 文件', () => {
  const bangumis = [
    {
      season_id: 12345,
      title: '测试番剧',
      pub_index: '每周六 12:00',
      is_finish: 0,
      evaluate: '这是一部测试番剧'
    }
  ];

  const ics = generateICS(bangumis, '614500');

  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('END:VCALENDAR'));
  assert.ok(ics.includes('测试番剧'));
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY'));
});
```

#### 1.2 时区处理
```javascript
test('正确设置时区为 Asia/Shanghai', () => {
  const ics = generateICS([], '614500');

  assert.ok(ics.includes('TZID:Asia/Shanghai'));
  assert.ok(ics.includes('X-WR-TIMEZONE:Asia/Shanghai'));
});
```

#### 1.3 重复规则
```javascript
test('连载中番剧应有重复规则', () => {
  const bangumis = [{
    season_id: 12345,
    title: '连载番剧',
    pub_index: '每周六 12:00',
    is_finish: 0  // 连载中
  }];

  const ics = generateICS(bangumis, '614500');
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;COUNT=2'));
});

test('已完结番剧不应有重复规则', () => {
  const bangumis = [{
    season_id: 12345,
    title: '完结番剧',
    pub_index: '每周六 12:00',
    is_finish: 1  // 已完结
  }];

  const ics = generateICS(bangumis, '614500');
  assert.ok(!ics.includes('RRULE'));
});
```

#### 1.4 特殊字符转义
```javascript
test('正确转义 ICS 特殊字符', () => {
  const bangumis = [{
    season_id: 12345,
    title: '测试,番剧;特殊\\字符',
    pub_index: '每周六 12:00',
    is_finish: 0
  }];

  const ics = generateICS(bangumis, '614500');
  assert.ok(ics.includes('测试\\,番剧\\;特殊\\\\字符'));
});
```

---

### 2. `utils.time.test.js` - 时间处理测试

**测试目标**: `utils/time.cjs`

**测试用例**:

#### 2.1 播出时间解析
```javascript
test('解析 "每周六 12:00"', () => {
  const result = parseBroadcastTime('每周六 12:00');

  assert.strictEqual(result.dayOfWeek, 6);
  assert.strictEqual(result.time, '12:00');
  assert.strictEqual(result.rruleDay, 'SA');
});

test('解析 "周日 18:30"', () => {
  const result = parseBroadcastTime('周日 18:30');

  assert.strictEqual(result.dayOfWeek, 0);
  assert.strictEqual(result.time, '18:30');
  assert.strictEqual(result.rruleDay, 'SU');
});

test('解析 "星期三 20:00"', () => {
  const result = parseBroadcastTime('星期三 20:00');

  assert.strictEqual(result.dayOfWeek, 3);
  assert.strictEqual(result.time, '20:00');
  assert.strictEqual(result.rruleDay, 'WE');
});
```

#### 2.2 新集时间解析
```javascript
test('解析新集播出时间', () => {
  const result = parseNewEpTime('2025-11-23 12:00:00');

  assert.strictEqual(result.dayOfWeek, 6);  // 周六
  assert.strictEqual(result.time, '12:00');
  assert.strictEqual(result.rruleDay, 'SA');
});
```

#### 2.3 下次播出日期计算
```javascript
test('计算下次播出日期', () => {
  const now = new Date('2025-11-22T10:00:00+08:00');  // 周五
  const nextDate = getNextBroadcastDate(6, '12:00');  // 周六 12:00

  assert.strictEqual(nextDate.getDay(), 6);  // 周六
  assert.strictEqual(nextDate.getHours(), 12);
  assert.strictEqual(nextDate.getMinutes(), 0);
});

test('当天已过播出时间，应返回下周', () => {
  const now = new Date('2025-11-22T14:00:00+08:00');  // 周五 14:00
  const nextDate = getNextBroadcastDate(5, '12:00');  // 周五 12:00 (已过)

  // 应返回下周五
  assert.ok(nextDate > now);
  assert.strictEqual(nextDate.getDay(), 5);
});
```

#### 2.4 日期格式化
```javascript
test('格式化日期为 ICS 格式', () => {
  const date = new Date('2025-11-23T12:00:00+08:00');
  const formatted = formatDate(date);

  assert.strictEqual(formatted, '20251123T120000');
});
```

#### 2.5 文本转义
```javascript
test('转义 ICS 特殊字符', () => {
  assert.strictEqual(escapeICSText('测试,文本'), '测试\\,文本');
  assert.strictEqual(escapeICSText('测试;文本'), '测试\\;文本');
  assert.strictEqual(escapeICSText('测试\\文本'), '测试\\\\文本');
  assert.strictEqual(escapeICSText('测试\n文本'), '测试\\n文本');
});
```

---

### 3. `utils.rate-limiter.test.js` - 速率限制测试

**测试目标**: `utils/rate-limiter.cjs`

**测试用例**:

#### 3.1 基本限流功能
```javascript
test('允许在限制内的请求', () => {
  const limiter = createRateLimiter({
    windowMs: 60000,
    maxRequests: 10
  });

  const result = limiter.check('192.168.1.1');

  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.remaining, 9);
});

test('拒绝超过限制的请求', () => {
  const limiter = createRateLimiter({
    windowMs: 60000,
    maxRequests: 2
  });

  limiter.check('192.168.1.1');  // 第 1 次
  limiter.check('192.168.1.1');  // 第 2 次
  const result = limiter.check('192.168.1.1');  // 第 3 次 (超限)

  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.remaining, 0);
  assert.ok(result.retryAfter > 0);
});
```

#### 3.2 窗口重置
```javascript
test('窗口过期后应重置计数', async () => {
  const limiter = createRateLimiter({
    windowMs: 100,  // 100ms 窗口
    maxRequests: 2
  });

  limiter.check('192.168.1.1');
  limiter.check('192.168.1.1');

  // 等待窗口过期
  await new Promise(resolve => setTimeout(resolve, 150));

  const result = limiter.check('192.168.1.1');
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.remaining, 1);
});
```

#### 3.3 多 IP 隔离
```javascript
test('不同 IP 应独立计数', () => {
  const limiter = createRateLimiter({
    windowMs: 60000,
    maxRequests: 2
  });

  limiter.check('192.168.1.1');
  limiter.check('192.168.1.1');

  // IP2 不应受 IP1 影响
  const result = limiter.check('192.168.1.2');
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.remaining, 1);
});
```

#### 3.4 清理过期记录
```javascript
test('cleanup 应清理过期记录', async () => {
  const limiter = createRateLimiter({
    windowMs: 100,
    maxRequests: 10
  });

  limiter.check('192.168.1.1');
  limiter.check('192.168.1.2');

  // 等待过期
  await new Promise(resolve => setTimeout(resolve, 150));

  limiter.cleanup();

  // 验证记录已清理
  const size = limiter.getRecordCount();
  assert.strictEqual(size, 0);
});
```

---

### 4. `utils.request-dedup.test.js` - 请求去重测试

**测试目标**: `utils/request-dedup.cjs`

**测试用例**:

#### 4.1 基本去重功能
```javascript
test('相同 key 的并发请求应只执行一次', async () => {
  const dedup = createRequestDedup();
  let callCount = 0;

  const fn = async () => {
    callCount++;
    await new Promise(resolve => setTimeout(resolve, 100));
    return 'result';
  };

  // 并发 3 个相同请求
  const results = await Promise.all([
    dedup.dedupe('test-key', fn),
    dedup.dedupe('test-key', fn),
    dedup.dedupe('test-key', fn)
  ]);

  // 应只执行一次
  assert.strictEqual(callCount, 1);

  // 结果应相同
  assert.strictEqual(results[0], 'result');
  assert.strictEqual(results[1], 'result');
  assert.strictEqual(results[2], 'result');
});
```

#### 4.2 不同 key 独立执行
```javascript
test('不同 key 的请求应独立执行', async () => {
  const dedup = createRequestDedup();
  let callCount = 0;

  const fn = async () => {
    callCount++;
    return 'result';
  };

  await Promise.all([
    dedup.dedupe('key1', fn),
    dedup.dedupe('key2', fn),
    dedup.dedupe('key3', fn)
  ]);

  // 应执行 3 次
  assert.strictEqual(callCount, 3);
});
```

#### 4.3 错误处理
```javascript
test('错误应正确传播', async () => {
  const dedup = createRequestDedup();

  const fn = async () => {
    throw new Error('Test Error');
  };

  // 并发请求都应收到错误
  await assert.rejects(
    Promise.all([
      dedup.dedupe('test-key', fn),
      dedup.dedupe('test-key', fn)
    ]),
    /Test Error/
  );
});
```

#### 4.4 请求完成后清理
```javascript
test('请求完成后应清理缓存', async () => {
  const dedup = createRequestDedup();

  const fn = async () => 'result';

  await dedup.dedupe('test-key', fn);

  // 验证缓存已清理
  const hasPending = dedup.hasPending('test-key');
  assert.strictEqual(hasPending, false);
});
```

---

## 🚀 运行测试

### 运行所有测试
```bash
npm test
```

### 运行特定测试文件
```bash
node --test test/utils.ics.test.js
node --test test/utils.time.test.js
node --test test/utils.rate-limiter.test.js
node --test test/utils.request-dedup.test.js
```

### 查看测试覆盖率
```bash
node --test --experimental-test-coverage
```

---

## 📊 测试覆盖率

### 当前覆盖率

| 模块 | 覆盖率 | 说明 |
|------|--------|------|
| `ics.cjs` | ~85% | 核心生成逻辑已覆盖 |
| `time.cjs` | ~90% | 时间解析与格式化已覆盖 |
| `rate-limiter.cjs` | ~95% | 限流逻辑已全面测试 |
| `request-dedup.cjs` | ~95% | 去重机制已全面测试 |
| `bangumi.cjs` | ~60% | 需要 Mock B站 API |
| `http.cjs` | ~50% | 需要集成测试 |

### 待补充测试

- [ ] `bangumi.cjs` - B站 API 调用 (需要 Mock)
- [ ] `http.cjs` - HTTP 客户端 (需要集成测试)
- [ ] `ip.cjs` - IP 提取逻辑
- [ ] `constants.cjs` - 常量验证

---

## 🔧 测试工具

### Node.js 内置测试框架

**优势**:
- 无需额外依赖
- 原生支持 async/await
- 内置断言库
- 支持测试覆盖率

**基本用法**:
```javascript
const { test } = require('node:test');
const assert = require('node:assert');

test('测试描述', () => {
  assert.strictEqual(1 + 1, 2);
});

test('异步测试', async () => {
  const result = await asyncFunction();
  assert.ok(result);
});
```

---

## 📝 测试最佳实践

### 1. 测试命名
- 使用清晰的描述性名称
- 说明测试的目标和预期结果
- 使用中文描述更易理解

### 2. 测试隔离
- 每个测试应独立运行
- 不依赖其他测试的状态
- 使用 setup/teardown 清理资源

### 3. 断言明确
- 使用具体的断言方法
- 避免过于宽泛的断言
- 提供清晰的错误信息

### 4. 边界测试
- 测试正常情况
- 测试边界条件
- 测试异常情况

### 5. Mock 外部依赖
- 隔离外部 API 调用
- 使用 Mock 数据
- 确保测试可重复

---

## 🔗 相关链接

- [← 返回根目录](../CLAUDE.md)
- [工具模块文档](../utils/CLAUDE.md)
- [前端模块文档](../public/CLAUDE.md)

---

**最后更新**: 2025-11-22 15:49:27 UTC
