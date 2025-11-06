# 项目概览
- 项目名称：Bili-Calendar
- 核心目标：将用户在 B 站追番列表自动转换为 ICS 日历订阅，支持 Apple/Google/Outlook 等主流日历应用，并提供多语言、PWA、历史记录等增强体验。
- 部署形态：Node.js/Express 服务，可直接运行或部署到 Netlify Functions、Docker；前端为静态站点与 PWA。
- 核心功能模块：服务器入口 `server.js`、静态资源目录 `public/`、业务与通用逻辑位于 `utils/` 与 `utils-es/`、Netlify 函数打包脚本 `scripts/update-readme-year.js`、部署配置（`netlify/`、`docker-compose.yml`、`Dockerfile`）。
- 依赖环境：Node.js >= 18，使用 npm。