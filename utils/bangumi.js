// ESM 环境下无需此文件，若被误加载则提示使用 CJS 版本
throw new Error(
  'utils/bangumi.js is not intended for direct ESM import. Use utils/bangumi.cjs via createRequire from ESM entry.'
);
