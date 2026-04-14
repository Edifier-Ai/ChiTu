import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import { BridgeMessage, CrawlerConfig, ExportPayload, AppSettings } from '../shared/types';
import { saveCookies, loadCookies } from './services/cookies';
import { saveSettings, loadSettings } from './services/settings';
import { spawn } from 'child_process';
import { checkCrawlerEnv, getCrawlerPaths, resolvePythonExecutable } from './services/crawlerEnv';
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
  ipcMain.handle('analyze-data', async (_, texts: string[]) => {
    return new Promise((resolve) => {
      const paths = getCrawlerPaths(app.isPackaged, process.resourcesPath, app.getAppPath());
      const mcDir = paths.mediaCrawlerDir;
      const pythonExecutable = resolvePythonExecutable(mcDir);
      
      if (!pythonExecutable) {
        resolve({ error: '未找到可用的 Python 环境进行分析' });
        return;
      }
      
      const analyzerPath = path.join(paths.legacyCrawlerBase, 'analyzer.py');
      const child = spawn(pythonExecutable, [analyzerPath]);
      
      let output = '';
      let errorOutput = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      child.stdin.on('error', (err: any) => {
        if (err.code === 'EPIPE') {
          // Process exited before we finished writing
          // The close event will handle resolving with the error output
          return;
        }
        resolve({ error: `写入数据到分析进程失败: ${err.message}` });
      });

      child.on('error', (err) => {
        resolve({ error: `启动分析进程失败: ${err.message}` });
      });

      child.on('close', (code) => {
        // If there's an EPIPE error, output might be empty and errorOutput might have the stack trace
        if (code === 0 || output) {
          try {
            const parsed = JSON.parse(output);
            if (parsed.error) {
              resolve({ error: `分析脚本内部错误: ${parsed.error}` });
            } else {
              resolve(parsed);
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            resolve({ error: `解析分析结果失败: ${msg}\n${output || errorOutput}` });
          }
        } else {
          resolve({ error: `分析脚本退出异常 (${code}): ${errorOutput}` });
        }
      });
      
      try {
        child.stdin.write(JSON.stringify({ texts }) + '\n');
        child.stdin.end();
      } catch (err: any) {
        if (err.code !== 'EPIPE') {
          resolve({ error: `写入数据异常: ${err.message}` });
        }
      }
    });
  });

  ipcMain.handle('save-settings', async (_, settings: Partial<AppSettings>) => {
    return saveSettings(settings);
  });

  ipcMain.handle('load-settings', async () => {
    return loadSettings();
  });

  ipcMain.handle('ai-analyze-data', async (_, prompt: string, texts: string[]) => {
    try {
      const settings = loadSettings();
      const aiConfig = settings.ai;
      
      if (!aiConfig?.baseUrl || !aiConfig?.apiKey || !aiConfig?.model) {
        return { error: '未配置 AI 模型信息，请先前往设置进行配置' };
      }

      // Prepare the payload for OpenAI-compatible endpoint
      // Limit texts to avoid hitting token limits immediately, let's take up to ~500 items max and truncate
      const sampleTexts = texts.slice(0, 300).map(t => t.substring(0, 500));
      const contentStr = sampleTexts.map((t, i) => `[${i+1}] ${t}`).join('\n');

      const messages = [
        { role: 'system', content: '你是一个资深的数据分析专家，负责对用户采集的社交媒体数据进行深度挖掘和洞察分析。请基于用户提供的数据内容，给出结构化、清晰的结论。' },
        { role: 'user', content: `${prompt}\n\n以下是部分采集到的数据内容片段：\n${contentStr}` }
      ];

      // Assuming OpenAI compatible API
      const url = new URL('/v1/chat/completions', aiConfig.baseUrl).toString();
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.apiKey}`
        },
        body: JSON.stringify({
          model: aiConfig.model,
          messages,
          temperature: 0.7,
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        return { error: `AI 请求失败: ${response.status} ${response.statusText}\n${errText}` };
      }

      const json = await response.json() as any;
      const result = json.choices?.[0]?.message?.content;
      return { result };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

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
    let resolved = false;
    const safeResolve = (value: string | null) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

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
      if (resolved) return;
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
            }
            safeResolve(cookieStr);
          }, 2000);
        }
      } catch {
        // ignore navigation errors
      }
    });

    loginWindow.on('close', async (e) => {
      if (resolved) return;
      e.preventDefault();
      try {
        const cookies = await loginWindow.webContents.session.cookies.get({});
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        
        loginWindow.destroy();
        safeResolve(cookieStr);
      } catch {
        loginWindow.destroy();
        safeResolve(null);
      }
    });

    // Timeout safety net: resolve after 5 minutes to prevent permanent hang
    setTimeout(() => {
      if (!loginWindow.isDestroyed()) {
        loginWindow.destroy();
      }
      safeResolve(null);
    }, 5 * 60 * 1000);
  });
});
