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

  const pattern = /©\s*\d{4}\s*CloudPaste\. 保留所有权利。/g;
  const replacement = `© ${currentYear} CloudPaste. 保留所有权利。`;

  let updated = content.replace(pattern, replacement);

  // 若未找到既有版权行，则在文末追加
  if (updated === content) {
    const trimmed = content.trimEnd();
    updated = `${trimmed}${EOL}${EOL}${replacement}${EOL}`;
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
