import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const buildDir = path.join(rootDir, 'netlify', 'functions-build');

async function cleanOutput() {
  await fs.rm(buildDir, { recursive: true, force: true });
  await fs.mkdir(buildDir, { recursive: true });
}

async function copyRecursive(src, dest) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const children = await fs.readdir(src);
    for (const child of children) {
      await copyRecursive(path.join(src, child), path.join(dest, child));
    }
    return;
  }
  await fs.copyFile(src, dest);
}

async function main() {
  console.log('🔨 开始构建 Netlify Functions...');
  await cleanOutput();

  const targets = [
    ['netlify/functions/server.js', 'server.js'],
    ['dist', 'dist'],
    ['utils', 'utils'],
    ['utils-es', 'utils-es'],
  ];

  for (const [src, dest] of targets) {
    const srcPath = path.join(rootDir, src);
    const destPath = path.join(buildDir, dest);
    console.log(`📦 复制 ${src} -> ${dest}`);
    await copyRecursive(srcPath, destPath);
  }

  // Netlify 运行时会为 ESM 函数注入 __filename/__dirname，
  // 需要移除源码中的手动声明，改用 import.meta.url 直接计算 __dirname
  const builtServerPath = path.join(buildDir, 'server.js');
  let content = await fs.readFile(builtServerPath, 'utf-8');
  content = content.replace(
    /const __filename = fileURLToPath\(import\.meta\.url\);\s*\nconst __dirname = path\.dirname\(__filename\);\s*\n/,
    "const __dirname = path.dirname(new URL(import.meta.url).pathname);\n"
  );
  // fileURLToPath 仅在 __filename 声明处使用，移除未使用的 import
  content = content.replace(
    /import \{ fileURLToPath \} from 'node:url';\s*\n/,
    ''
  );
  await fs.writeFile(builtServerPath, content, 'utf-8');
  console.log('🔧 已替换 __filename/__dirname 声明（避免与运行时注入冲突）');

  console.log(`✅ 构建完成：${buildDir}`);
}

main().catch((err) => {
  console.error('❌ 构建失败:', err);
  process.exitCode = 1;
});
