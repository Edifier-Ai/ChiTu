import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import { BridgeMessage, CrawlerConfig, ExportPayload } from '../shared/types';
import { saveCookies, loadCookies } from './services/cookies';
import { checkCrawlerEnv } from './services/crawlerEnv';
import { CrawlerRuntime } from './services/crawlerRuntime';
import { exportCrawledData } from './services/exporter';

let mainWindow: BrowserWindow | null = null;

const runtime = new CrawlerRuntime({
  get isPackaged() {
    return app.isPackaged;
  },
  get resourcesPath() {
    return process.resourcesPath;
  },
  get appPath() {
    return app.getAppPath();
  },
});

function sendBridgeMessage(message: BridgeMessage) {
  if (!mainWindow) {
    return;
  }

  if (message.type === 'progress') {
    mainWindow.webContents.send('crawler-progress', message.payload);
    return;
  }

  if (message.type === 'error') {
    mainWindow.webContents.send('crawler-error', message.payload.message);
    return;
  }

  if (message.type === 'complete') {
    mainWindow.webContents.send('crawler-complete', message.payload);
    return;
  }

  console.log(`[crawler:${message.payload.stream}] ${message.payload.message}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 20, y: 20 },
    backgroundColor: '#0d1117',
    icon: path.join(app.getAppPath(), 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js'),
    },
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Remove disableHardwareAcceleration as it causes severe UI lag in React
// app.disableHardwareAcceleration();

// Change user data dir to project root for dev environment
if (process.env.NODE_ENV === 'development') {
  app.setPath('userData', path.join(process.cwd(), '.chitu_data'));
}

// Disable sandbox for Linux/macOS issues in some environments
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  runtime.cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  runtime.cleanup();
});

ipcMain.handle('select-output-dir', async () => {
  return dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择数据保存目录',
  });
});

ipcMain.handle('get-app-version', async () => app.getVersion());

ipcMain.handle('check-crawler-env', async () => {
  return checkCrawlerEnv(app.isPackaged, process.resourcesPath, app.getAppPath());
});

ipcMain.handle('start-crawler', async (_event, config: CrawlerConfig) => {
  try {
    return await runtime.start(config, sendBridgeMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : '启动采集失败';
    sendBridgeMessage({
      type: 'error',
      payload: { message },
    });
    throw error;
  }
});

ipcMain.handle('stop-crawler', () => runtime.stop());

ipcMain.handle('export-crawled-data', async (_event, payload: ExportPayload) => {
  return exportCrawledData(payload.data, payload.outputDir, payload.exportFormat);
});

ipcMain.handle('save-cookies', async (_event, cookies: Record<string, string>) => saveCookies(cookies));
ipcMain.handle('load-cookies', async () => loadCookies());

ipcMain.handle('open-login-window', async (_event, platformId: string) => {
  return new Promise((resolve) => {
    const loginWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      parent: mainWindow || undefined,
      modal: !!mainWindow,
      titleBarStyle: 'default',
      title: '请登录并完成验证，完成后直接关闭窗口即可',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: `persist:${platformId}`,
      }
    });

    const urls: Record<string, string> = {
      'xiaohongshu': 'https://www.xiaohongshu.com',
      'weibo': 'https://weibo.com',
      'douyin': 'https://www.douyin.com',
      'bilibili': 'https://www.bilibili.com',
    };

    loginWindow.loadURL(urls[platformId] || 'https://www.google.com');

    // 监听导航事件以自动检测是否已登录成功
    loginWindow.webContents.on('did-navigate', async () => {
      try {
        const cookies = await loginWindow.webContents.session.cookies.get({});
        const cookieMap = Object.fromEntries(cookies.map(c => [c.name, c.value]));
        
        let loggedIn = false;
        if (platformId === 'bilibili' && cookieMap['SESSDATA']) {
          loggedIn = true;
        } else if (platformId === 'xiaohongshu' && cookieMap['a1'] && cookieMap['web_session']) {
          loggedIn = true;
        } else if (platformId === 'douyin' && cookieMap['sessionid']) {
          loggedIn = true;
        } else if (platformId === 'weibo' && cookieMap['SUB']) {
          loggedIn = true;
        }

        if (loggedIn) {
          const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          // 等待页面完全加载，避免影响平台种下额外的风控cookie
          setTimeout(() => {
            if (!loginWindow.isDestroyed()) {
              loginWindow.destroy();
              resolve(cookieStr);
            }
          }, 2000);
        }
      } catch (err) {
        // ignore
      }
    });

    loginWindow.on('close', async (e) => {
      e.preventDefault();
      try {
        const cookies = await loginWindow.webContents.session.cookies.get({});
        const cookieStr = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
        
        loginWindow.destroy();
        resolve(cookieStr);
      } catch (err) {
        loginWindow.destroy();
        resolve(null);
      }
    });
  });
});
