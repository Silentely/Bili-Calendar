# Scripts 说明

本目录保存项目维护脚本，均使用 Node.js 运行。

## build-netlify.mjs

构建 Netlify Functions 产物。

```bash
node scripts/build-netlify.mjs
```

脚本会清空并重建 `netlify/functions-build/`，然后复制：

- `netlify/functions/server.js` -> `netlify/functions-build/server.js`
- `dist/` -> `netlify/functions-build/dist/`
- `utils/` -> `netlify/functions-build/utils/`
- `utils-es/` -> `netlify/functions-build/utils-es/`

通常不需要单独执行，`npm run build` 会自动调用。

## check-dist.js

检查 `dist/` 是否存在；不存在时执行 `npm run build`。

```bash
node scripts/check-dist.js
```

适合在需要静态产物但不确定是否已构建的流程中使用。

## generate-vapid.js

生成 Web Push VAPID 公私钥，并按环境变量格式输出。

```bash
node scripts/generate-vapid.js
```

输出示例：

```text
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.com
```

不要将私钥提交到仓库。

## update-readme-year.js

同步根目录 `README.md` 中的版权年份。

```bash
node scripts/update-readme-year.js
```

如果 README 已是当前年份，脚本不会写入文件。
