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
}

export type AccountIdentificationPlatformId = 'xiaohongshu' | 'douyin' | 'weibo';

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
  incremental?: boolean;
  sinceTimestamp?: string | null;
}

export interface AccountIdentificationConfig {
  taskType: 'account_identification';
  companyName: string;
  keywords: string[];
  platforms: AccountIdentificationPlatformId[];
  count: number;
  outputDir: string;
  exportFormat: ExportFormat;
}

export interface EmployeeAccountResult {
  rank: number;
  platform: AccountIdentificationPlatformId;
  platformName: string;
  accountName: string;
  suspectedEmployeeName: string;
  userId: string;
  profileUrl: string;
  followersCount: number | null;
  followersText: string;
  confidenceLevel: '高' | '中' | '低';
  confidenceScore: number;
  evidence: string[];
  matchedPostCount: number;
  latestActiveAt: string;
  sourceKeywords: string[];
  collectedAt: string;
  rawBio?: string;
  rawVerifiedReason?: string;
}

export interface AccountIdentificationProgress {
  companyName: string;
  platform: string;
  current: number;
  total: number;
  data: EmployeeAccountResult[];
}

export interface AccountIdentificationPayload {
  data: EmployeeAccountResult[];
  outputDir: string;
  exportFormat: ExportFormat;
  companyName: string;
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
  itemCount?: number;
  format?: ExportFormat;
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

export interface UpdateCheckResult {
  hasUpdate: boolean;
  latestVersion?: string;
  currentVersion?: string;
  url?: string;
  name?: string;
  error?: string;
}

export interface TaskHistoryRecord {
  timestamp: string;
  keywords: string[];
  platforms: string[];
  count: number;
  outputDir: string;
  exportFormat: string;
  status: 'running' | 'completed' | 'failed';
  totalItems?: number;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  firstRun: boolean;
  onboardingCompleted: boolean;
  notificationsEnabled: boolean;
  badgeEnabled: boolean;
  lastCrawlTimestamps: Record<string, string>;
}

export interface SettingsResult {
  success: boolean;
  settings?: AppSettings;
  error?: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  silent?: boolean;
}

export interface SelectDirectoryResult {
  canceled: boolean;
  filePaths: string[];
}

export interface BridgeProgressMessage {
  type: 'progress';
  payload: CrawlerProgress;
}

export interface BridgeAccountProgressMessage {
  type: 'account-progress';
  payload: AccountIdentificationProgress;
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
    taskType?: 'content' | 'account_identification' | null;
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
  | BridgeAccountProgressMessage
  | BridgeErrorMessage
  | BridgeCompleteMessage
  | BridgeLogMessage;

export interface ElectronAPI {
  selectOutputDir: () => Promise<SelectDirectoryResult>;
  getAppVersion: () => Promise<string>;
  checkCrawlerEnv: () => Promise<EnvStatus>;
  startCrawler: (config: CrawlerConfig) => Promise<CrawlerStartResult>;
  startAccountIdentification: (config: AccountIdentificationConfig) => Promise<CrawlerStartResult>;
  stopCrawler: () => Promise<StopCrawlerResult>;
  exportCrawledData: (payload: ExportPayload) => Promise<ExportResult>;
  exportAccountIdentificationData: (payload: AccountIdentificationPayload) => Promise<ExportResult>;
  onCrawlerProgress: (callback: (data: CrawlerProgress) => void) => () => void;
  onAccountIdentificationProgress: (callback: (data: AccountIdentificationProgress) => void) => () => void;
  onCrawlerError: (callback: (error: string) => void) => () => void;
  onCrawlerComplete: (callback: (result: BridgeCompleteMessage['payload']) => void) => () => void;
  saveCookies: (cookies: Record<string, string>) => Promise<SaveCookiesResult>;
  loadCookies: () => Promise<Record<string, string>>;
  checkForUpdate: () => Promise<UpdateCheckResult>;
  getTaskHistory: () => Promise<TaskHistoryRecord[]>;
  getSettings: () => Promise<SettingsResult>;
  setSettings: (partial: Partial<AppSettings>) => Promise<SettingsResult>;
  showNotification: (payload: NotificationPayload) => void;
  openFolder: (filePath: string) => Promise<{ success: boolean }>;
  copyToClipboard: (text: string) => Promise<{ success: boolean }>;
}
