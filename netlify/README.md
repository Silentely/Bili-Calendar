# Netlify 部署说明

本目录保存 Netlify Functions 相关源码和构建产物。前端仍由 Vite 构建到 `dist/`，API 与日历订阅路由通过 Netlify Function `server` 处理。

## 部署流程

Netlify 使用根目录的 `netlify.toml`：

- `build.command`: `npm run build`
- `build.publish`: `dist`
- `build.functions`: `netlify/functions-build`

`npm run build` 会依次执行：

1. `vite build` 生成前端静态文件到 `dist/`。
2. `node scripts/update-readme-year.js` 同步 README 版权年份。
3. `node scripts/build-netlify.mjs` 复制函数入口、`dist/`、`utils/`、`utils-es/` 到 `netlify/functions-build/`。

## 路由重写

`netlify.toml` 将以下请求重写到 `/.netlify/functions/server`：

- `/api/*`
- `/status`
- `/metrics`
- `/metrics/prometheus`
- `/aggregate/*`
- `/push/*`
- `/:uid.ics`
- `/:uid`

函数入口位于 `netlify/functions/server.js`，内部复用 Express 路由并由 `serverless-http` 包装导出 `handler`。

## 环境变量

常用变量如下：

- `NODE_ENV`: 运行环境，Netlify 生产环境通常为 `production`。
- `TRUST_PROXY`: Express `trust proxy` 配置，可为 `true`、`false`、数字或字符串。
- `ENABLE_RATE_LIMIT`: 设置为 `false` 时关闭限流。
- `API_RATE_LIMIT`: 限流窗口内最大请求数，默认 `100`。
- `API_RATE_WINDOW`: 限流窗口毫秒数，默认 `3600000`。
- `PUSH_ADMIN_TOKEN`: 推送测试接口管理令牌。
- `VAPID_PUBLIC_KEY`: Web Push 公钥。
- `VAPID_PRIVATE_KEY`: Web Push 私钥。
- `VAPID_SUBJECT`: Web Push subject，默认 `mailto:admin@example.com`。

## 本地验证

常用检查命令：

```bash
npm run build
npm test
npm run lint
npm run type-check
```

如只验证函数源码，可运行 `npm test -- test/netlify-functions.test.js`。
