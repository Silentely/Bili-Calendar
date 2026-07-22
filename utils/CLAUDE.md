# Utils 模块文档

> **导航**: [← 返回根目录](../CLAUDE.md) | **模块**: 后端工具层（`utils-es/`）

---

## 模块概览

后端核心工具层位于 **`utils-es/`**（ES Module）。提供 B站 API 调用、ICS 生成、限流、去重、时间处理、安全校验、性能指标等。

> 历史 `utils/*.cjs` 已于 v1.1.9 删除。请勿再引用 CommonJS 副本。

### 核心职责

- B站 API 数据获取与分页拉全
- ICS 日历生成与多源合并
- 请求限流与去重
- 时间解析、HTTP 封装、常量
- SSRF 防护与输入验证
- 性能指标、WebPush 存储

## 文件结构

```
utils-es/
├── bangumi.js
├── constants.js
├── env.js
├── http.js
├── ics-merge.js
├── ics.js
├── ip.js
├── metrics.js
├── push-store.js
├── rate-limiter.js
├── request-dedup.js
├── security.js
├── time.js
└── validation.js

utils/
├── README.md      # 弃用说明
└── CLAUDE.md      # 本文件
```

## 入口引用

- Express：`server.js` → `utils-es/*` + `server/lib/*`
- Netlify：`netlify/functions/server.js` → 同上

## 测试

测试导入路径统一为 `utils-es/*`，见 `test/utils.*.test.js`。
