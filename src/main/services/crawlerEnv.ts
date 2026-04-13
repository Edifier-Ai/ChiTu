import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { EnvStatus } from '../../shared/types';
import { loadCookies } from './cookies';

export interface CrawlerPaths {
  bundledBaseDir: string;
  bundledExecutable: string;
  bundledBrowsersDir: string;
  legacyCrawlerBase: string;
  mediaCrawlerDir: string;
  bridgePath: string;
  venvPython: string;
}

export function getCrawlerPaths(isPackaged: boolean, resourcesPath: string, appPath: string): CrawlerPaths {
  const bundledBaseDir = isPackaged
    ? path.join(resourcesPath, 'app.asar.unpacked', 'dist_crawler')
    : path.join(appPath, 'dist_crawler');

  const legacyCrawlerBase = path.join(appPath, 'crawler');
  const mediaCrawlerDir = path.join(legacyCrawlerBase, 'MediaCrawler');

  return {
    bundledBaseDir,
    bundledExecutable: path.join(bundledBaseDir, 'crawler'),
    bundledBrowsersDir: path.join(bundledBaseDir, 'ms-playwright'),
    legacyCrawlerBase,
    mediaCrawlerDir,
    bridgePath: path.join(legacyCrawlerBase, 'bridge.py'),
    venvPython: path.join(mediaCrawlerDir, '.venv', 'bin', 'python'),
  };
}

export function resolvePythonExecutable(mcDir: string) {
  const explicitPython = process.env.CHITU_VENV_PYTHON;
  const candidates = [
    explicitPython,
    path.join(mcDir, '.venv', 'bin', 'python'),
    path.join(mcDir, '.venv', 'bin', 'python3'),
    'python3',
    'python',
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (candidate === 'python3' || candidate === 'python') {
      return candidate;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function runPythonCheck(pythonExecutable: string, code: string, extraEnv?: NodeJS.ProcessEnv) {
  return spawnSync(pythonExecutable, ['-c', code], {
    encoding: 'utf-8',
    timeout: 15000,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

export function checkCrawlerEnv(isPackaged: boolean, resourcesPath: string, appPath: string): EnvStatus {
  const paths = getCrawlerPaths(isPackaged, resourcesPath, appPath);
  const cookies = loadCookies();
  const bundledExecutableExists = fs.existsSync(paths.bundledExecutable);
  const bundledBrowsersDirExists = fs.existsSync(paths.bundledBrowsersDir);

  const result: EnvStatus = {
    ready: false,
    runtimeMode: bundledExecutableExists ? 'bundled' : 'python',
    crawlerDirExists: bundledExecutableExists ? fs.existsSync(paths.bundledBaseDir) : fs.existsSync(paths.legacyCrawlerBase),
    mediaCrawlerExists: fs.existsSync(paths.mediaCrawlerDir),
    bridgeExists: fs.existsSync(paths.bridgePath),
    crawlerExecutableExists: bundledExecutableExists,
    browserBundleExists: bundledBrowsersDirExists,
    venvExists: fs.existsSync(paths.venvPython),
    pythonExecutable: '',
    pythonVersion: '',
    playwrightInstalled: false,
    chromiumInstalled: false,
    runtimeLabel: bundledExecutableExists ? '内置采集引擎' : '本地 Python 环境',
    cookies: {
      xiaohongshu: Boolean(cookies.xiaohongshu?.trim()),
      douyin: Boolean(cookies.douyin?.trim()),
      weibo: Boolean(cookies.weibo?.trim()),
      bilibili: Boolean(cookies.bilibili?.trim()),
    },
    issues: [],
  };

  if (bundledExecutableExists) {
    if (!result.crawlerDirExists) {
      result.issues.push('内置采集引擎目录缺失');
    }
    if (!result.crawlerExecutableExists) {
      result.issues.push('内置采集引擎缺失');
    }
    if (!result.browserBundleExists) {
      result.issues.push('内置浏览器资源缺失');
    }

    result.playwrightInstalled = result.crawlerExecutableExists;
    result.chromiumInstalled = result.browserBundleExists;
    result.pythonVersion = 'Bundled';
    result.pythonExecutable = paths.bundledExecutable;
    result.ready = result.issues.length === 0;
    return result;
  }

  if (!result.crawlerDirExists || !result.mediaCrawlerExists || !result.bridgeExists) {
    result.issues.push('爬虫核心文件缺失');
  }

  const pythonExecutable = resolvePythonExecutable(paths.mediaCrawlerDir);
  if (!pythonExecutable) {
    result.issues.push('未找到可用的 Python 解释器');
    return result;
  }

  result.pythonExecutable = pythonExecutable;

  const versionCheck = spawnSync(pythonExecutable, ['-V'], {
    encoding: 'utf-8',
    timeout: 10000,
  });
  result.pythonVersion = `${versionCheck.stdout || versionCheck.stderr}`.trim();

  const playwrightCheck = runPythonCheck(
    pythonExecutable,
    `
import json
status = {"playwright": False, "chromium": False}
try:
    from playwright.sync_api import sync_playwright
    status["playwright"] = True
    with sync_playwright() as p:
        status["chromium"] = bool(p.chromium.executable_path)
except Exception:
    pass
print(json.dumps(status))
`.trim()
  );

  try {
    const parsed = JSON.parse((playwrightCheck.stdout || '').trim() || '{}');
    result.playwrightInstalled = Boolean(parsed.playwright);
    result.chromiumInstalled = Boolean(parsed.chromium);
  } catch {
    result.playwrightInstalled = false;
    result.chromiumInstalled = false;
  }

  if (!result.venvExists) {
    result.issues.push('未检测到项目 .venv 环境');
  }
  if (!result.playwrightInstalled) {
    result.issues.push('Python 依赖未安装完整');
  }
  if (!result.chromiumInstalled) {
    result.issues.push('Playwright 浏览器未安装');
  }

  result.ready = result.issues.length === 0;
  return result;
}
