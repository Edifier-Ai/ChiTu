import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  AccountIdentificationConfig,
  AccountIdentificationPayload,
  AccountIdentificationProgress,
  AppSettings,
  BridgeCompleteMessage,
  CrawlerConfig,
  CrawlerProgress,
  ExportPayload,
  NotificationPayload,
  PlatformId,
} from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  selectOutputDir: () => ipcRenderer.invoke('select-output-dir'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkCrawlerEnv: () => ipcRenderer.invoke('check-crawler-env'),
  startCrawler: (config: CrawlerConfig) => ipcRenderer.invoke('start-crawler', config),
  startAccountIdentification: (config: AccountIdentificationConfig) => ipcRenderer.invoke('start-account-identification', config),
  stopCrawler: () => ipcRenderer.invoke('stop-crawler'),
  exportCrawledData: (payload: ExportPayload) => ipcRenderer.invoke('export-crawled-data', payload),
  exportAccountIdentificationData: (payload: AccountIdentificationPayload) => ipcRenderer.invoke('export-account-identification-data', payload),
  onCrawlerProgress: (callback: (data: CrawlerProgress) => void) => {
    const handler = (_: IpcRendererEvent, data: CrawlerProgress) => callback(data);
    ipcRenderer.on('crawler-progress', handler);
    return () => ipcRenderer.removeListener('crawler-progress', handler);
  },
  onAccountIdentificationProgress: (callback: (data: AccountIdentificationProgress) => void) => {
    const handler = (_: IpcRendererEvent, data: AccountIdentificationProgress) => callback(data);
    ipcRenderer.on('account-identification-progress', handler);
    return () => ipcRenderer.removeListener('account-identification-progress', handler);
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
  autoFetchCookie: (platform: PlatformId) => ipcRenderer.invoke('auto-fetch-cookie', platform),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  getTaskHistory: () => ipcRenderer.invoke('get-task-history'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (partial: Partial<AppSettings>) => ipcRenderer.invoke('set-settings', partial),
  showNotification: (payload: NotificationPayload) => ipcRenderer.invoke('show-notification', payload),
  openFolder: (filePath: string) => ipcRenderer.invoke('open-folder', filePath),
  copyToClipboard: (text: string) => ipcRenderer.invoke('copy-to-clipboard', text),
});
