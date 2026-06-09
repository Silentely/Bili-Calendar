import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

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

  // 第一步：复制源文件到构建目录
  const targets = [
    ['netlify/functions/server.js', 'server.esm.js'],
    ['dist', 'dist'],
  ];

  for (const [src, dest] of targets) {
    const srcPath = path.join(rootDir, src);
    const destPath = path.join(buildDir, dest);
    console.log(`📦 复制 ${src} -> ${dest}`);
    await copyRecursive(srcPath, destPath);
  }

  // 第二步：预处理 ESM 源码
  const esmPath = path.join(buildDir, 'server.esm.js');
  let content = await fs.readFile(esmPath, 'utf-8');
  // 移除 fileURLToPath import（仅 __filename 声明使用）
  content = content.replace(
    /import \{ fileURLToPath \} from 'node:url';\s*\n/,
    ''
  );
  // 移除 __filename 和 __dirname 声明（esbuild 会处理路径）
  content = content.replace(
    /const __filename = fileURLToPath\(import\.meta\.url\);\s*\nconst __dirname = path\.dirname\(__filename\);\s*\n/,
    ''
  );
  await fs.writeFile(esmPath, content, 'utf-8');
  console.log('🔧 已移除 __dirname 声明');

  // 第三步：用 esbuild 将 ESM bundle 为 CJS
  // zip-it-and-ship-it 的 CJS 转换会丢失 default export，
  // 手动 bundle 确保正确的模块互操作
  const cjsPath = path.join(buildDir, 'server.js');
  await esbuild.build({
    entryPoints: [esmPath],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outfile: cjsPath,
    external: ['serverless-http', 'express', 'compression'],
  });
  console.log('🔧 已用 esbuild bundle 为 CJS (node22)');

  // 清理临时 ESM 文件（已 bundle 进 server.js）
  await fs.rm(esmPath, { force: true });

  // 关键：在 functions-build/ 下创建 package.json 指定 CommonJS
  // 根 package.json 有 "type": "module"，会导致 .js 文件被当作 ESM 处理
  // 必须覆盖为 CommonJS 才能让 require() 正确加载 esbuild 产物
  await fs.writeFile(
    path.join(buildDir, 'package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2) + '\n'
  );

  // 检查产物大小
  const stat = await fs.stat(cjsPath);
  const sizeKb = (stat.size / 1024).toFixed(1);
  console.log(`📦 产物大小: ${sizeKb} KB`);

  console.log(`✅ 构建完成：${buildDir}`);
}

main().catch((err) => {
  console.error('❌ 构建失败:', err);
  process.exitCode = 1;
});
