# 2025-02-15 冗余清理要点

- 删除了 `server-es.js`、`main.js` 以及未被引用的旧版工具文件（`utils/http.js`, `utils/ics.js`, `utils/ip.js`, `utils/time.js`），所有运行入口统一在 `server.js` / Netlify Functions。
- README(中/英) 的项目结构与 Docker 部署段已同步，避免再提到废弃文件。
- `/status` 接口现在会返回 package 版本（`server.js`, `netlify/functions/server.js`）。
- `public/app.js` 的进度条逻辑去掉了无用变量，`npm run lint` 与 `npm test` 作为回归校验。
