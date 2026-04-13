import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { ChildProcess, spawn } from 'child_process';
import { BridgeCompleteMessage, BridgeMessage, CrawlerConfig } from '../../shared/types';
import { getCrawlerPaths, resolvePythonExecutable } from './crawlerEnv';

type MessageHandler = (message: BridgeMessage) => void;

function isBridgeMessage(value: unknown): value is BridgeMessage {
  return typeof value === 'object' && value !== null && 'type' in value && 'payload' in value;
}

function parseBridgeLine(line: string, stream: 'stdout' | 'stderr'): BridgeMessage | null {
  try {
    const parsed = JSON.parse(line);
    if (isBridgeMessage(parsed)) {
      return parsed;
    }

    if (parsed?.platform && parsed?.keyword !== undefined && parsed?.current !== undefined) {
      return {
        type: 'progress',
        payload: parsed,
      };
    }

    if (parsed?.error) {
      return {
        type: 'error',
        payload: { message: parsed.error },
      };
    }

    if (parsed?.status === 'complete') {
      return {
        type: 'complete',
        payload: { total: parsed.total ?? 0 },
      };
    }
  } catch {
    if (stream === 'stderr') {
      return {
        type: 'error',
        payload: { message: line },
      };
    }

    return {
      type: 'log',
      payload: { stream, message: line },
    };
  }

  return null;
}

export class CrawlerRuntime {
  private crawlerProcess: ChildProcess | null = null;
  private hasCompleted = false;

  constructor(
    private readonly appInfo: {
      isPackaged: boolean;
      resourcesPath: string;
      appPath: string;
    }
  ) {}

  stop() {
    if (!this.crawlerProcess) {
      return { success: false };
    }

    this.crawlerProcess.kill('SIGINT');
    this.crawlerProcess = null;
    return { success: true };
  }

  cleanup() {
    if (this.crawlerProcess) {
      this.crawlerProcess.kill();
      this.crawlerProcess = null;
    }
  }

  async start(config: CrawlerConfig, onMessage: MessageHandler) {
    if (this.crawlerProcess) {
      throw new Error('已有采集任务正在运行，请先停止当前任务。');
    }

    const paths = getCrawlerPaths(this.appInfo.isPackaged, this.appInfo.resourcesPath, this.appInfo.appPath);
    const useBundledRuntime = fs.existsSync(paths.bundledExecutable);

    this.hasCompleted = false;

    return new Promise<{ success: boolean }>((resolve, reject) => {
      if (useBundledRuntime) {
        this.crawlerProcess = spawn(paths.bundledExecutable, [], {
          env: {
            ...process.env,
            CHITU_PLAYWRIGHT_BROWSERS_PATH: paths.bundledBrowsersDir,
          },
          cwd: paths.bundledBaseDir,
        });
      } else {
        const mcDir = paths.mediaCrawlerDir;
        const bridgePath = paths.bridgePath;
        if (!fs.existsSync(mcDir) || !fs.existsSync(bridgePath)) {
          throw new Error(`爬虫目录缺失：${paths.legacyCrawlerBase}`);
        }

        const pythonExecutable = resolvePythonExecutable(mcDir);
        if (!pythonExecutable) {
          throw new Error('未找到可用的 Python 解释器。请先执行 start.sh 或在 crawler/MediaCrawler 下准备 .venv 环境。');
        }

        this.crawlerProcess = spawn(pythonExecutable, [bridgePath], {
          env: {
            ...process.env,
            CHITU_MEDIA_CRAWLER_DIR: mcDir,
            CHITU_VENV_PYTHON: pythonExecutable,
          },
          cwd: mcDir,
        });
      }

      const processRef = this.crawlerProcess;
      const emit = (message: BridgeMessage) => {
        if (message.type === 'complete') {
          this.hasCompleted = true;
        }
        onMessage(message);
      };

      const bindStream = (stream: NodeJS.ReadableStream | null, streamName: 'stdout' | 'stderr') => {
        if (!stream) {
          return;
        }

        const rl = readline.createInterface({ input: stream });
        rl.on('line', (line) => {
          const message = parseBridgeLine(line, streamName);
          if (message) {
            emit(message);
          }
        });
      };

      bindStream(processRef.stdout, 'stdout');
      bindStream(processRef.stderr, 'stderr');

      processRef.on('close', (code) => {
        if (!this.hasCompleted) {
          const payload: BridgeCompleteMessage['payload'] = { total: 0, code };
          emit({ type: 'complete', payload });
        }
        resolve({ success: code === 0 });
        if (this.crawlerProcess === processRef) {
          this.crawlerProcess = null;
        }
      });

      processRef.on('error', (error) => {
        emit({
          type: 'error',
          payload: { message: `启动爬虫失败: ${error.message}` },
        });
        if (this.crawlerProcess === processRef) {
          this.crawlerProcess = null;
        }
        reject(error);
      });

      const payload = JSON.stringify(config) + '\n';
      processRef.stdin?.write(payload, (error) => {
        if (error) {
          reject(error);
        }
      });
    });
  }
}
