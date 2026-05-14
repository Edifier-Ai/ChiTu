import { app, BrowserWindow, clipboard, dialog, ipcMain, Notification, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import https from 'https';
import logger from 'electron-log';
import { AccountIdentificationConfig, AccountIdentificationPayload, BridgeMessage, CrawlerConfig, ExportPayload } from '../shared/types';
import { saveCookies, loadCookies } from './services/cookies';
import { checkCrawlerEnv } from './services/crawlerEnv';
import { CrawlerRuntime } from './services/crawlerRuntime';
import { exportAccountIdentificationData, exportCrawledData } from './services/exporter';
import { appendTaskHistory, readTaskHistory, updateLastTaskStatus } from './services/taskHistory';
import { loadSettings, saveSettings } from './services/settings';

let mainWindow: BrowserWindow | null = null;
let activeTaskType: 'content' | 'account_identification' | null = null;

function hasBundledApp() {
  return fs.existsSync(path.join(__dirname, '../renderer/index.html'));
}

function hasBundledCrawler() {
  return fs.existsSync(path.join(process.resourcesPath, 'app.asar.unpacked', 'dist_crawler', 'crawler'));
}

function isProductionRuntime() {
  return app.isPackaged || hasBundledApp() || hasBundledCrawler();
}

const runtime = new CrawlerRuntime({
  get isPackaged() {
    return isProductionRuntime();
  },
  get resourcesPath() {
    return process.resourcesPath;
  },
  get appPath() {
    return app.getAppPath();
  },
});

function showNativeNotification(title: string, body: string) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body }).show();
}

function updateDockBadge(count: number) {
  if (process.platform === 'darwin') {
    app.dock?.setBadge(count > 0 ? String(count) : '');
  }
  if (mainWindow && count > 0) {
    mainWindow.flashFrame(true);
  }
}

function sendBridgeMessage(message: BridgeMessage) {
  if (!mainWindow) {
    return;
  }

  if (message.type === 'progress') {
    mainWindow.webContents.send('crawler-progress', message.payload);
    return;
  }

  if (message.type === 'account-progress') {
    mainWindow.webContents.send('account-identification-progress', message.payload);
    return;
  }

  if (message.type === 'error') {
    mainWindow.webContents.send('crawler-error', message.payload.message);
    showNativeNotification(activeTaskType === 'account_identification' ? '账号识别失败' : '采集失败', message.payload.message);
    updateDockBadge(0);
    return;
  }

  if (message.type === 'complete') {
    const completePayload = { ...message.payload, taskType: activeTaskType };
    mainWindow.webContents.send('crawler-complete', completePayload);
    if (activeTaskType === 'account_identification') {
      showNativeNotification('账号识别完成', `共识别 ${completePayload.total} 个账号`);
    } else {
      updateLastTaskStatus('completed', completePayload.total);
      showNativeNotification('采集完成', `共采集 ${completePayload.total} 条数据`);
    }
    updateDockBadge(1);
    return;
  }

  logger.info(`[crawler:${message.payload.stream}] ${message.payload.message}`);
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

  if (process.env.NODE_ENV === 'development' && !hasBundledApp()) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('focus', () => {
    if (process.platform === 'darwin') {
      app.dock?.setBadge('');
    }
    mainWindow?.flashFrame(false);
  });
}

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
  return checkCrawlerEnv(isProductionRuntime(), process.resourcesPath, app.getAppPath());
});

ipcMain.handle('start-crawler', async (_event, config: CrawlerConfig) => {
  appendTaskHistory({
    timestamp: new Date().toISOString(),
    keywords: config.keywords,
    platforms: config.platforms,
    count: config.count,
    outputDir: config.outputDir,
    exportFormat: config.exportFormat,
    status: 'running',
  });
  try {
    activeTaskType = 'content';
    return await runtime.start(config, sendBridgeMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : '启动采集失败';
    updateLastTaskStatus('failed');
    sendBridgeMessage({
      type: 'error',
      payload: { message },
    });
    throw error;
  } finally {
    activeTaskType = null;
  }
});

ipcMain.handle('start-account-identification', async (_event, config: AccountIdentificationConfig) => {
  try {
    activeTaskType = 'account_identification';
    return await runtime.start(config, sendBridgeMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : '启动账号识别失败';
    sendBridgeMessage({
      type: 'error',
      payload: { message },
    });
    throw error;
  } finally {
    activeTaskType = null;
  }
});

ipcMain.handle('get-task-history', async () => readTaskHistory(10));

ipcMain.handle('stop-crawler', () => runtime.stop());

ipcMain.handle('export-crawled-data', async (_event, payload: ExportPayload) => {
  return exportCrawledData(payload.data, payload.outputDir, payload.exportFormat);
});

ipcMain.handle('export-account-identification-data', async (_event, payload: AccountIdentificationPayload) => {
  return exportAccountIdentificationData(payload.data, payload.outputDir, payload.exportFormat, payload.companyName);
});

ipcMain.handle('save-cookies', async (_event, cookies: Record<string, string>) => saveCookies(cookies));
ipcMain.handle('load-cookies', async () => loadCookies());

ipcMain.handle('get-settings', async () => loadSettings());
ipcMain.handle('set-settings', async (_event, partial) => saveSettings(partial));

ipcMain.handle('show-notification', async (_event, payload) => {
  if (!Notification.isSupported()) return;
  const notification = new Notification(payload);
  notification.show();
});

ipcMain.handle('open-folder', async (_event, filePath: string) => {
  try {
    await shell.showItemInFolder(filePath);
    return { success: true };
  } catch {
    return { success: false };
  }
});

ipcMain.handle('copy-to-clipboard', async (_event, text: string) => {
  clipboard.writeText(text);
  return { success: true };
});

function fetchJSON<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'ChiTu-App' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error('Invalid JSON'));
          }
        });
      })
      .on('error', reject);
  });
}

ipcMain.handle('check-for-update', async () => {
  const ownerRepo = process.env.CHITU_UPDATE_REPO || '';
  if (!ownerRepo) {
    return { hasUpdate: false, error: '未配置更新源' };
  }
  try {
    const release = await fetchJSON<{
      tag_name: string;
      html_url: string;
      name: string;
    }>(`https://api.github.com/repos/${ownerRepo}/releases/latest`);
    const latest = release.tag_name.replace(/^v/, '');
    const current = app.getVersion();
    const hasUpdate = latest > current;
    return {
      hasUpdate,
      latestVersion: latest,
      currentVersion: current,
      url: release.html_url,
      name: release.name,
    };
  } catch {
    return { hasUpdate: false, error: '检查更新失败' };
  }
});
