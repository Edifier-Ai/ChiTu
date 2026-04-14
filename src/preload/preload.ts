import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { BridgeCompleteMessage, CrawlerConfig, CrawlerProgress, ExportPayload } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkCrawlerEnv: () => ipcRenderer.invoke('check-crawler-env'),
  startCrawler: (config: CrawlerConfig) => ipcRenderer.invoke('start-crawler', config),
  stopCrawler: () => ipcRenderer.invoke('stop-crawler'),
  exportCrawledData: (payload: ExportPayload) => ipcRenderer.invoke('export-crawled-data', payload),
  onCrawlerProgress: (callback: (data: CrawlerProgress) => void) => {
    const handler = (_: IpcRendererEvent, data: CrawlerProgress) => callback(data);
    ipcRenderer.on('crawler-progress', handler);
    return () => ipcRenderer.removeListener('crawler-progress', handler);
  },
  onCrawlerError: (callback: (error: string) => void) => {
    const handler = (_: IpcRendererEvent, error: string) => callback(error);
    ipcRenderer.on('crawler-error', handler);
    return () => ipcRenderer.removeListener('crawler-error', handler);
  },
  onCrawlerComplete: (callback: (result: BridgeCompleteMessage['payload']) => void) => {
    const handler = (_: IpcRendererEvent, result: BridgeCompleteMessage['payload']) => callback(result);
    ipcRenderer.on('crawler-complete', handler);
    return () => ipcRenderer.removeListener('crawler-complete', handler);
  },
  saveCookies: (cookies: Record<string, string>) => ipcRenderer.invoke('save-cookies', cookies),
  loadCookies: () => ipcRenderer.invoke('load-cookies'),
  openLoginWindow: (platformId: string) => ipcRenderer.invoke('open-login-window', platformId),
  analyzeData: (texts: string[]) => ipcRenderer.invoke('analyze-data', texts),
});
