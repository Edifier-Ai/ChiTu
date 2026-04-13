import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const venvPython = path.join(rootDir, 'crawler', 'MediaCrawler', '.venv', 'bin', 'python');
const pyInstaller = path.join(rootDir, 'crawler', 'MediaCrawler', '.venv', 'bin', 'pyinstaller');
const distCrawlerDir = path.join(rootDir, 'dist_crawler');
const bundledBrowsersDir = path.join(distCrawlerDir, 'ms-playwright');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(venvPython) || !fs.existsSync(pyInstaller)) {
  console.error('未找到 crawler/MediaCrawler/.venv，请先准备打包环境。');
  process.exit(1);
}

fs.rmSync(distCrawlerDir, { recursive: true, force: true });
fs.mkdirSync(distCrawlerDir, { recursive: true });

run(pyInstaller, [
  '--clean',
  '--noconfirm',
  '--distpath',
  'dist_crawler',
  '--workpath',
  'build/crawler',
  'crawler/crawler.spec',
]);

// 始终在打包目录下全新安装所需的 chromium，避免将用户本地缓存的历史版本全部打包进去导致体积过大
const playwrightInstall = spawnSync(venvPython, ['-m', 'playwright', 'install', 'chromium'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: bundledBrowsersDir,
  },
});

process.exit(playwrightInstall.status ?? 1);
