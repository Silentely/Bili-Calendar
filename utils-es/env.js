// @ts-nocheck
// utils-es/env.js
// 环境变量解析工具

export function parseIntEnv(name, def, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name];
  if (raw == null || raw === '') return def;
  const parsed = Number.parseInt(String(raw), 10);
  if (Number.isNaN(parsed)) return def;
  return Math.min(Math.max(parsed, min), max);
}
