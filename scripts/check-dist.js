#!/usr/bin/env node
// scripts/check-dist.js - 跨平台检查 dist 目录是否存在，不存在则构建
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const distExists = existsSync('dist');

if (!distExists) {
  console.log('[check-dist] dist/ 目录不存在，正在构建...');

  const result = spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    shell: true, // 确保 Windows 兼容性
  });

  if (result.status !== 0) {
    console.error('[check-dist] 构建失败');
    process.exit(1);
  }

  console.log('[check-dist] 构建完成');
} else {
  console.log('[check-dist] dist/ 目录已存在，跳过构建');
}
