// scripts/update-readme-year.js (ESM)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function resolveProjectRoot() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, '..');
}

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`无法读取文件: ${filePath} - ${error.message}`);
  }
}

async function writeFileIfChanged(filePath, original, updated) {
  if (original === updated) return false;
  await fs.writeFile(filePath, updated, 'utf8');
  return true;
}

async function updateReadmeYear() {
  const root = await resolveProjectRoot();
  const readmePath = path.join(root, 'README.md');
  const currentYear = new Date().getFullYear();

  const content = await readFileSafe(readmePath);

  // 统一换行，便于处理
  const EOL = content.includes('\r\n') ? '\r\n' : '\n';

  const pattern = /©\s*\d{4}\s*Bili-Calendar[.\u3002]\s*保留所有权利[.\u3002]?/g;
  const replacement = `© ${currentYear} Bili-Calendar. 保留所有权利。`;

  // 查找所有匹配项
  const matches = [...content.matchAll(pattern)];

  let updated;
  if (matches.length === 0) {
    // 没有版权行，在文末追加
    const trimmed = content.trimEnd();
    updated = `${trimmed}${EOL}${EOL}${replacement}${EOL}`;
  } else {
    // 有版权行，只保留第一个并更新年份，删除其他的
    let firstReplaced = false;
    updated = content.replace(pattern, () => {
      if (!firstReplaced) {
        firstReplaced = true;
        return replacement;
      }
      // 删除后续的匹配（替换为空并移除多余换行）
      return '';
    });

    // 清理可能产生的多余空行（连续 3+ 个换行符压缩为 2 个）
    updated = updated.replace(/(\r?\n){3,}/g, '$1$1');
  }

  const changed = await writeFileIfChanged(readmePath, content, updated);
  if (changed) {
    console.log(`[update-readme-year] README.md 已更新为 ${currentYear}`);
  } else {
    console.log('[update-readme-year] README.md 无需更新');
  }
}

updateReadmeYear().catch((err) => {
  console.error('[update-readme-year] 执行失败:', err);
  process.exitCode = 1;
});
