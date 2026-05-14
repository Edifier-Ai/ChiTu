import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const venvPython = path.join(rootDir, 'crawler', 'MediaCrawler', '.venv', 'bin', 'python');
const pyInstaller = path.join(rootDir, 'crawler', 'MediaCrawler', '.venv', 'bin', 'pyinstaller');
const distCrawlerDir = path.join(rootDir, 'dist_crawler');
const bundledBrowsersDir = path.join(distCrawlerDir, 'ms-playwright');
const localBrowsersCacheDir = path.join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright');
const workPath = path.join(rootDir, 'build', 'crawler');

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
fs.rmSync(workPath, { recursive: true, force: true });

run(pyInstaller, [
  '--noconfirm',
  '--distpath',
  'dist_crawler',
  '--workpath',
  'build/crawler',
  'crawler/crawler.spec',
]);

if (fs.existsSync(localBrowsersCacheDir)) {
  fs.mkdirSync(bundledBrowsersDir, { recursive: true });
  for (const entry of ['chromium-1124', 'ffmpeg-1009']) {
    const source = path.join(localBrowsersCacheDir, entry);
    if (!fs.existsSync(source)) {
      continue;
    }
    fs.cpSync(source, path.join(bundledBrowsersDir, entry), {
      recursive: true,
      dereference: true,
    });
  }
  process.exit(0);
}

const playwrightInstall = spawnSync(venvPython, ['-m', 'playwright', 'install', 'chromium'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: bundledBrowsersDir,
  },
});

process.exit(playwrightInstall.status ?? 1);
