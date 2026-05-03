# Test 模块文档

> **导航**: [← 返回根目录](../CLAUDE.md) | **模块**: 测试套件

---

## 📋 模块概览

**Test** 模块是 Bili-Calendar 的测试套件，使用 Node.js 内置测试框架对后端工具层和前端服务层进行单元测试和集成测试，确保代码质量和功能正确性。

### 测试范围

- ICS 文件生成与聚合逻辑
- 时间解析与格式化
- 请求速率限制器
- 请求去重机制
- IP 验证与安全工具
- 输入验证工具
- 性能指标采集
- 前端服务模块（12 个）

---

## 📁 文件结构

```
test/
├── utils.ics.test.js              # ICS 生成测试 (CommonJS)
├── utils.time.test.js             # 时间处理测试 (CommonJS)
├── utils.rate-limiter.test.js     # 速率限制测试
├── utils.request-dedup.test.js    # 请求去重测试
├── utils.ip-validation.test.js    # IP 验证测试
├── utils.security.test.js         # 安全工具测试
├── utils.validation.test.js       # 输入验证测试
├── utils-es.ics.test.js           # ICS 生成测试 (ES Module)
├── utils-es.time.test.js          # 时间处理测试 (ES Module)
├── ics-merge.test.js              # ICS 聚合测试
├── metrics.test.js                # 性能指标测试
├── services.animationService.test.js   # 动画服务测试
├── services.cacheManager.test.js       # 缓存管理测试
├── services.clipboardService.test.js   # 剪贴板服务测试
├── services.deviceDetector.test.js     # 设备检测测试
├── services.errorHandler.test.js       # 错误处理测试
├── services.i18n.test.js               # 国际化测试
├── services.loadingService.test.js     # 加载服务测试
├── services.notifier.test.js           # 通知管理测试
├── services.progressService.test.js    # 进度条测试
├── services.push.test.js               # 推送服务测试
├── services.pwa.test.js                # PWA 测试
├── services.stringUtils.test.js        # 字符串工具测试
├── services.themeService.test.js       # 主题切换测试
├── services.toastService.test.js       # 提示消息测试
└── CLAUDE.md                           # 本文件
```

---

## 🧪 测试详解

### 1. 后端工具层测试

#### 1.1 `utils.ics.test.js` - ICS 生成测试

**测试目标**: `utils/ics.cjs`

**测试用例**:
- 基本 ICS 文件生成（BEGIN/END VCALENDAR）
- 时区设置为 Asia/Shanghai
- 连载中番剧的 RRULE 重复规则
- 已完结番剧无重复规则
- 特殊字符转义（逗号、分号、反斜杠）

#### 1.2 `utils.time.test.js` - 时间处理测试

**测试目标**: `utils/time.cjs`

**测试用例**:
- 播出时间解析（"每周六 12:00"、"周日 18:30"、"星期三 20:00"）
- 新集播出时间解析（"2025-11-23 12:00:00"）
- 下次播出日期计算
- 当天已过时间应返回下周
- 日期格式化为 ICS 格式
- ICS 特殊字符转义

#### 1.3 `utils.rate-limiter.test.js` - 速率限制测试

**测试目标**: `utils/rate-limiter.cjs`

**测试用例**:
- 允许限制内的请求
- 拒绝超过限制的请求
- 窗口过期后重置计数
- 不同 IP 独立计数
- cleanup 清理过期记录

#### 1.4 `utils.request-dedup.test.js` - 请求去重测试

**测试目标**: `utils/request-dedup.cjs`

**测试用例**:
- 相同 key 并发请求只执行一次
- 不同 key 独立执行
- 错误正确传播
- 请求完成后清理缓存

#### 1.5 `utils.ip-validation.test.js` - IP 验证测试

**测试目标**: `utils/ip.cjs`

**测试用例**:
- IPv4/IPv6 地址提取
- X-Forwarded-For 头解析
- 私有地址检测

#### 1.6 `utils.security.test.js` - 安全工具测试

**测试目标**: `utils/security.cjs`

**测试用例**:
- UID 格式验证（纯数字 1-20 位）
- 私有/本地地址检测
- SSRF 防护逻辑

#### 1.7 `utils.validation.test.js` - 输入验证测试

**测试目标**: `utils/validation.cjs`

**测试用例**:
- UID 验证规则
- URL 协议白名单（http/https）
- 私有 IP 拦截

#### 1.8 `ics-merge.test.js` - ICS 聚合测试

**测试目标**: `utils/ics-merge.cjs`

**测试用例**:
- 外部 ICS 源拉取与合并
- DNS 安全查询（防止重绑定）
- 事件去重与冲突处理

#### 1.9 `metrics.test.js` - 性能指标测试

**测试目标**: `utils/metrics.cjs`

**测试用例**:
- 请求计数与成功率
- API 延迟统计（p95/p99）
- 路由级统计
- 指标重置

#### 1.10 `utils-es.*.test.js` - ES Module 版本测试

**测试目标**: `utils-es/ics.js`、`utils-es/time.js`

与 CommonJS 版本相同的测试用例，验证 ES Module 版本的一致性。

---

### 2. 前端服务层测试

#### 2.1 `services.i18n.test.js` - 国际化测试

**测试目标**: `src/services/i18n.js`

**测试用例**:
- 语言切换与翻译
- 浏览器语言检测
- LocalStorage 偏好保存

#### 2.2 `services.cacheManager.test.js` - 缓存管理测试

**测试目标**: `src/services/cacheManager.js`

**测试用例**:
- 缓存设置与获取
- 缓存过期处理
- 历史记录管理（最多 10 条）

#### 2.3 `services.errorHandler.test.js` - 错误处理测试

**测试目标**: `src/services/errorHandler.js`

**测试用例**:
- 错误类型识别
- 友好错误提示生成
- HTML 转义防护 XSS

#### 2.4 `services.notifier.test.js` - 通知管理测试

**测试目标**: `src/services/notifier.js`

**测试用例**:
- 浏览器通知权限请求
- 通知发送与关闭
- 环境隔离（动态导入 i18n）

#### 2.5 `services.stringUtils.test.js` - 字符串工具测试

**测试目标**: `src/utils/stringUtils.js`

**测试用例**:
- HTML 转义（& < > " ' /）
- 全角/半角转换
- 空值处理

#### 2.6 其他前端服务测试

| 测试文件 | 测试目标 | 核心测试点 |
|---------|---------|-----------|
| `services.animationService.test.js` | `src/services/animationService.js` | 动画触发与清理 |
| `services.clipboardService.test.js` | `src/services/clipboardService.js` | 剪贴板复制操作 |
| `services.deviceDetector.test.js` | `src/utils/deviceDetector.js` | 移动端/桌面端检测 |
| `services.loadingService.test.js` | `src/services/loadingService.js` | 加载状态显示与隐藏 |
| `services.progressService.test.js` | `src/services/progressService.js` | 进度条更新与完成 |
| `services.push.test.js` | `src/services/push.js` | WebPush 订阅管理 |
| `services.pwa.test.js` | `src/services/pwa.js` | PWA 注册与更新 |
| `services.themeService.test.js` | `src/services/themeService.js` | 主题切换与持久化 |
| `services.toastService.test.js` | `src/services/toastService.js` | Toast 提示显示 |

---

## 🚀 运行测试

### 运行所有测试
```bash
npm test
```

### 运行特定测试文件
```bash
node --test test/utils.ics.test.js
node --test test/services.i18n.test.js
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
| `ics-merge.cjs` | ~80% | ICS 聚合已覆盖 |
| `metrics.cjs` | ~85% | 指标采集已覆盖 |
| `validation.cjs` | ~90% | 输入验证已覆盖 |
| `security.cjs` | ~90% | 安全工具已覆盖 |
| `ip.cjs` | ~90% | IP 提取已覆盖 |
| `bangumi.cjs` | ~60% | 需要 Mock B站 API |
| `http.cjs` | ~50% | 需要集成测试 |
| **前端服务** | ~100% | 12 个服务模块已全覆盖 |

### 待补充测试

- [ ] `bangumi.cjs` - B站 API 调用 (需要 Mock)
- [ ] `http.cjs` - HTTP 客户端 (需要集成测试)
- [ ] `push-store.cjs` - WebPush 存储 (需要文件系统 Mock)

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
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('模块名', () => {
  it('测试描述', () => {
    assert.strictEqual(1 + 1, 2);
  });

  it('异步测试', async () => {
    const result = await asyncFunction();
    assert.ok(result);
  });
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
- [前端模块文档](../docs/frontend.md)

---

**最后更新**: 2026-05-03
