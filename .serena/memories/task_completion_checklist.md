# 任务收尾检查
- 确认代码通过 `npm run lint` 与 `npm test`。
- 对格式化敏感的改动运行 `npm run format:write` 或至少 `npm run format` 确认无差异。
- 如涉及构建产物更新（Netlify/Docker），执行 `npm run build` 验证脚本是否完成并检视生成目录。
- 更新文档或 README 以反映功能/接口改动。
- 自测核心接口（/status、/uid.ics 等），确保速率限制、缓存、ICS 输出正常。