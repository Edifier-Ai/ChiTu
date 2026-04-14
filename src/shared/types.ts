export type PlatformId = 'xiaohongshu' | 'douyin' | 'weibo' | 'bilibili';

export type ExportFormat = 'excel' | 'csv' | 'jsonl';

export interface CommentItem {
  id: string;
  author: string;
  content: string;
  timestamp: string;
}

export interface CrawledItem {
  id: string;
  platform: string;
  keyword: string;
  content: string;
  author: string;
  timestamp: string;
  url: string;
  comments?: CommentItem[];
}

export interface CrawlerProgress {
  keyword: string;
  platform: string;
  current: number;
  total: number;
  data: CrawledItem[];
  filtered?: number;  // 被过滤掉的数量
  actual?: number;    // 实际有效数量
}

export interface EnvStatus {
  ready: boolean;
  runtimeMode: 'bundled' | 'python';
  crawlerDirExists: boolean;
  mediaCrawlerExists: boolean;
  bridgeExists: boolean;
  crawlerExecutableExists: boolean;
  browserBundleExists: boolean;
  venvExists: boolean;
  pythonExecutable: string;
  pythonVersion: string;
  playwrightInstalled: boolean;
  chromiumInstalled: boolean;
  runtimeLabel: string;
  cookies: Partial<Record<PlatformId, boolean>>;
  issues: string[];
}

export interface CrawlerConfig {
  keywords: string[];
  includeKeywords: string[];
  excludeKeywords: string[];
  platforms: PlatformId[];
  startDate: string | null;
  endDate: string | null;
  count: number;
  outputDir: string;
  exportFormat: ExportFormat;
  cookies?: Record<string, string>;
}

export interface ExportPayload {
  data: CrawledItem[];
  outputDir: string;
  exportFormat: ExportFormat;
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface CrawlerStartResult {
  success: boolean;
}

export interface StopCrawlerResult {
  success: boolean;
}

export interface SaveCookiesResult {
  success: boolean;
  error?: string;
}

export interface SelectDirectoryResult {
  canceled: boolean;
  filePaths: string[];
}

export interface BridgeProgressMessage {
  type: 'progress';
  payload: CrawlerProgress;
}

export interface BridgeErrorMessage {
  type: 'error';
  payload: {
    message: string;
  };
}

export interface BridgeCompleteMessage {
  type: 'complete';
  payload: {
    total: number;
    code?: number | null;
  };
}

export interface BridgeLogMessage {
  type: 'log';
  payload: {
    stream: 'stdout' | 'stderr';
    message: string;
  };
}

export type BridgeMessage =
  | BridgeProgressMessage
  | BridgeErrorMessage
  | BridgeCompleteMessage
  | BridgeLogMessage;

export interface ElectronAPI {
  selectOutputDir: () => Promise<SelectDirectoryResult>;
  getAppVersion: () => Promise<string>;
  checkCrawlerEnv: () => Promise<EnvStatus>;
  startCrawler: (config: CrawlerConfig) => Promise<CrawlerStartResult>;
  stopCrawler: () => Promise<StopCrawlerResult>;
  exportCrawledData: (payload: ExportPayload) => Promise<ExportResult>;
  onCrawlerProgress: (callback: (data: CrawlerProgress) => void) => () => void;
  onCrawlerError: (callback: (error: string) => void) => () => void;
  onCrawlerComplete: (callback: (result: BridgeCompleteMessage['payload']) => void) => () => void;
  saveCookies: (cookies: Record<string, string>) => Promise<SaveCookiesResult>;
  loadCookies: () => Promise<Record<string, string>>;
  openLoginWindow: (platformId: string) => Promise<string | null>;
  analyzeData: (texts: string[]) => Promise<any>;
}
