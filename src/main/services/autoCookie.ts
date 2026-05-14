import { BrowserWindow, app } from 'electron';
import { PlatformId, AutoFetchCookieResult } from '../../shared/types';
import { loadCookies, saveCookies } from './cookies';

interface PlatformCookieConfig {
  name: string;
  loginUrl: string;
  cookieUrls: string[];
  domains: string[];
  requiredAny: string[][];
}

const PLATFORM_COOKIE_CONFIG: Record<PlatformId, PlatformCookieConfig> = {
  xiaohongshu: {
    name: '小红书',
    loginUrl: 'https://www.xiaohongshu.com/explore',
    cookieUrls: ['https://www.xiaohongshu.com', 'https://edith.xiaohongshu.com'],
    domains: ['xiaohongshu.com', '.xiaohongshu.com'],
    requiredAny: [['a1', 'web_session'], ['a1', 'webId']],
  },
  douyin: {
    name: '抖音',
    loginUrl: 'https://www.douyin.com',
    cookieUrls: ['https://www.douyin.com', 'https://www.douyin.com/search'],
    domains: ['douyin.com', '.douyin.com'],
    requiredAny: [['sessionid'], ['sid_guard']],
  },
  weibo: {
    name: '微博',
    loginUrl: 'https://weibo.com',
    cookieUrls: ['https://weibo.com', 'https://www.weibo.com'],
    domains: ['weibo.com', '.weibo.com'],
    requiredAny: [['SUB'], ['SUBP']],
  },
  bilibili: {
    name: 'B 站',
    loginUrl: 'https://www.bilibili.com',
    cookieUrls: ['https://www.bilibili.com', 'https://passport.bilibili.com'],
    domains: ['bilibili.com', '.bilibili.com'],
    requiredAny: [['SESSDATA']],
  },
};

function serializeCookies(cookies: Electron.Cookie[]) {
  const deduped = new Map<string, Electron.Cookie>();
  for (const cookie of cookies) {
    if (!cookie.name || typeof cookie.value !== 'string') {
      continue;
    }
    deduped.set(cookie.name, cookie);
  }

  return [...deduped.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function hasRequiredCookies(cookieHeader: string, config: PlatformCookieConfig) {
  const cookieNames = new Set(
    cookieHeader
      .split(';')
      .map((item) => item.trim().split('=')[0])
      .filter(Boolean)
  );

  return config.requiredAny.some((requiredNames) => requiredNames.every((name) => cookieNames.has(name)));
}

async function collectCookies(window: BrowserWindow, config: PlatformCookieConfig) {
  const allCookies: Electron.Cookie[] = [];

  for (const url of config.cookieUrls) {
    allCookies.push(...(await window.webContents.session.cookies.get({ url })));
  }

  for (const domain of config.domains) {
    allCookies.push(...(await window.webContents.session.cookies.get({ domain })));
  }

  return serializeCookies(allCookies);
}

async function injectFinishButton(window: BrowserWindow, platformName: string) {
  try {
    await window.webContents.executeJavaScript(`
      (() => {
        window.__chituCookieDone = window.__chituCookieDone || false;
        const old = document.getElementById('__chitu_cookie_finish');
        if (old) old.remove();
        const button = document.createElement('button');
        button.id = '__chitu_cookie_finish';
        button.textContent = '已完成登录';
        button.title = '登录 ${platformName} 后点击，赤兔会自动保存 Cookie';
        Object.assign(button.style, {
          position: 'fixed',
          right: '18px',
          bottom: '18px',
          zIndex: '2147483647',
          padding: '10px 16px',
          border: '0',
          borderRadius: '8px',
          background: '#ff2442',
          color: '#fff',
          fontSize: '14px',
          fontWeight: '600',
          boxShadow: '0 10px 30px rgba(0,0,0,.28)',
          cursor: 'pointer'
        });
        button.addEventListener('click', () => { window.__chituCookieDone = true; });
        document.documentElement.appendChild(button);
      })();
    `);
  } catch {
    // Some platform pages navigate through protected frames; polling cookies still works.
  }
}

async function userClickedFinish(window: BrowserWindow) {
  try {
    return Boolean(await window.webContents.executeJavaScript('Boolean(window.__chituCookieDone)', true));
  } catch {
    return false;
  }
}

export function autoFetchCookie(platform: PlatformId, parentWindow: BrowserWindow | null): Promise<AutoFetchCookieResult> {
  const config = PLATFORM_COOKIE_CONFIG[platform];
  const partition = `persist:chitu-cookie-${platform}`;
  let settled = false;
  let interval: NodeJS.Timeout | null = null;
  let timeout: NodeJS.Timeout | null = null;

  return new Promise((resolve) => {
    const loginWindow = new BrowserWindow({
      width: 1120,
      height: 820,
      minWidth: 900,
      minHeight: 650,
      title: `登录${config.name}并获取 Cookie`,
      parent: parentWindow || undefined,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition,
      },
    });

    const cleanup = () => {
      if (interval) clearInterval(interval);
      if (timeout) clearTimeout(timeout);
      interval = null;
      timeout = null;
    };

    const finish = async (result: AutoFetchCookieResult, closeWindow = true) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (closeWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
      }
      resolve(result);
    };

    const tryCollect = async (manual = false) => {
      if (loginWindow.isDestroyed()) {
        return;
      }

      const cookie = await collectCookies(loginWindow, config);
      if (!cookie.trim()) {
        if (manual) {
          await finish({ success: false, platform, error: `未读取到${config.name} Cookie，请确认已完成登录。` });
        }
        return;
      }

      if (!manual && !hasRequiredCookies(cookie, config)) {
        return;
      }

      const cookies = loadCookies();
      saveCookies({ ...cookies, [platform]: cookie });
      await finish({ success: true, platform, cookie });
    };

    loginWindow.webContents.on('did-finish-load', () => {
      injectFinishButton(loginWindow, config.name);
    });

    loginWindow.webContents.on('did-navigate', () => {
      injectFinishButton(loginWindow, config.name);
    });

    loginWindow.webContents.on('did-navigate-in-page', () => {
      injectFinishButton(loginWindow, config.name);
    });

    loginWindow.on('closed', () => {
      if (!settled) {
        cleanup();
        resolve({ success: false, platform, error: '登录窗口已关闭，未保存 Cookie。' });
      }
    });

    interval = setInterval(async () => {
      if (await userClickedFinish(loginWindow)) {
        await tryCollect(true);
        return;
      }
      await tryCollect(false);
    }, 2000);

    timeout = setTimeout(() => {
      finish({ success: false, platform, error: `${config.name} 登录等待超时，请重新尝试自动获取。` });
    }, 5 * 60 * 1000);

    loginWindow.loadURL(config.loginUrl).catch((error) => {
      finish({ success: false, platform, error: error instanceof Error ? error.message : '打开登录页面失败' });
    });

    app.on('before-quit', cleanup);
  });
}
