# 目录结构要点
- 根目录：`server.js` 为 Express 入口；`server-es.js` 提供 ES 版本；`main.js` 可能为打包入口；部署配置包括 `docker-compose.yml`、`Dockerfile`、`netlify/`。
- `public/`：静态前端资源（HTML/CSS/JS/PWA 相关）。
- `utils/`：核心服务端逻辑（番剧数据拉取、ICS 生成、IP/限流工具等），同时保留 `.cjs` 与 `.js` 版本以兼容不同运行环境。
- `utils-es/`：ESM 版本的工具模块（更现代的实现）；`test/` 下包含对应的 Node Test 测试用例。
- `scripts/`：辅助脚本，如 `update-readme-year.js` 维护 README 版权年份。
- `netlify/`：Netlify Functions 所需的函数入口、部署脚本（构建复制至 `netlify/functions-build/`）。