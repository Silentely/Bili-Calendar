# 代码与风格规范

- JavaScript 以 ESM 为主，部分工具保留 CJS 版本；需保持两种模块系统同步。
- ESLint 配置：基于 `eslint.config.js`，启用 ES2022 语法，浏览器与 Node 全局；禁用 `no-console`，对未使用变量容忍以下划线开头；禁止 `var`，优先 `const`。
- Prettier：`printWidth=100`、`singleQuote=true`、`semi=true`、`trailingComma="es5"`。
- 注释与文档：使用中文说明关键流程与复杂逻辑。
- 目录忽略：`node_modules/`、`netlify/functions-build/` 为构建产物，避免手动修改。
- 质量要求：代码需显式处理异常、边界条件，并保持模块化拆分。
