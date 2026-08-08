# Bili-Calendar 打磨迭代计划（task/38）

> 目标：通读项目并交叉检索后，围绕 UI/UX、文案、日志、性能、友好度做 10 轮迭代打磨，完成后自查一轮。
> 基线：407 个测试全部通过；工作区干净（中断恢复确认无遗留改动）。

## 已识别的打磨点（含证据）

| # | 方向 | 证据 | 严重度 |
|---|------|------|--------|
| 1 | errorHandler/UserGuide 文案硬编码中文，未走 i18n（英/繁/日界面会混中文） | `errorHandler.js` ERROR_CODES、弹窗按钮、guide 步骤；i18n 字典中对应键已存在但未接线 | 高 |
| 2 | Toast 无 aria-live/role，固定 top:right 会互相重叠，无 DOM 上限 | `toastService.js`、`_loading.scss` | 中 |
| 3 | 错误弹窗无 role=dialog、无 Escape 关闭、无焦点管理 | `errorHandler.js showErrorModal` | 中 |
| 4 | 前端 console 日志风格不统一（无 emoji 前缀）；后端请求日志每请求两行 | `subscriptionService.js`、`middleware.js`、`AnimePreview.js` 等 | 低 |
| 5 | `handleSubscribe` 强制 800ms 人工延迟；加载指示三套叠加（进度条+全屏遮罩+内联 loading） | `subscriptionService.js:289-326` | 中 |
| 6 | UID 输入框无 inputmode/pattern/maxlength，移动端体验差 | `index.html` | 低 |
| 7 | 预览详情 toast 文案硬编码中文拼接 | `AnimePreview.js showDetail` | 低 |
| 8 | server.js 首页/状态 Markdown 模板重复 3 处（DRY）；404 页内联样式无暗黑适配 | `server.js:148-178/235-278/330-359` | 低 |
| 9 | 429 响应缺 Retry-After 头；sw.js 离线回退页无返回链接、日志无 emoji | `middleware.js`、`sw.js` | 低 |
| 10 | 文档同步（CLAUDE.md/docs/frontend.md）与全量验证 | — | 中 |

## 10 轮迭代

1. **i18n 接线**：errorHandler 弹窗/引导文案接入 i18n 字典（含新键），测试固定 zh-CN。
2. **Toast 系统增强**：容器化堆叠、aria-live、DOM 上限、关闭按钮 aria-label。
3. **错误弹窗无障碍**：role=dialog/aria-modal/Escape/焦点管理。
4. **日志规范统一**：前端 console 加 emoji；后端请求日志合并为单行。
5. **订阅流程 UX**：智能等待替代固定 800ms、去除加载冗余、UID 输入框移动端增强。
6. **预览详情 i18n**：showDetail 文案走字典。
7. **server.js DRY + 404 优化**：提取 Markdown 模板函数；404 页暗黑适配。
8. **PWA/离线增强**：sw.js 日志与离线回退页、theme-color 明暗适配。
9. **后端响应细节**：429 加 Retry-After、校验 metrics 输出。
10. **文档同步 + 全量验证 + 自查**。

## 验证策略

- 每轮：`npm test`（全量 407+ 用例）；涉及样式用 `npm run build` 验证 SCSS 编译。
- 结束：`npm test` + `npm run lint` + `npm run format` + `npm run type-check` + `npm run build`。

## 完成情况（2026-08-08）

10 轮全部完成并逐轮提交（共 14 个 commit，见 git log）：
- 第 1 轮 i18n 接线 ✅（错误弹窗/新手引导/预览详情）
- 第 2 轮 Toast 容器化/aria/去重/上限 ✅
- 第 3 轮 错误弹窗 Escape 与焦点管理 ✅
- 第 4 轮 日志前缀统一 + 请求日志单行化 ✅
- 第 5 轮 订阅流程去人工延迟/加载去冗余/移动端输入 ✅
- 第 6 轮 预览详情文案 i18n ✅
- 第 7 轮 server.js Markdown DRY + 404 暗黑 ✅
- 第 8 轮 离线回退页/theme-color 明暗 + 类型修复 ✅
- 第 9 轮 限流 Retry-After/动态窗口/Prometheus gauge + 中间件测试 ✅
- 第 10 轮 文档同步 + 全量验证 + 自查（进行中）
- 基线 407 测试 → 现 415+ 测试全部通过；type-check 通过；build 通过。

