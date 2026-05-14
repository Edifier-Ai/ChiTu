import React, { useEffect, useState } from 'react';
import Header from './components/Header';
import KeywordInput from './components/KeywordInput';
import PlatformSelector from './components/PlatformSelector';
import DateRangePicker from './components/DateRangePicker';
import CountSelector from './components/CountSelector';
import ExportFormatSelector from './components/ExportFormatSelector';
import ProgressBar from './components/ProgressBar';
import ContentPreview from './components/ContentPreview';
import ActionButtons from './components/ActionButtons';
import CookieSettings from './components/CookieSettings';
import ExportActions from './components/ExportActions';
import OnboardingOverlay from './components/OnboardingOverlay';
import PreviewFilters from './components/PreviewFilters';
import BatchQueuePanel, { BatchTask } from './components/BatchQueuePanel';
import AccountResults from './components/AccountResults';
import {
  AccountIdentificationPlatformId,
  CrawlerProgress,
  ExportFormat,
  PlatformId,
  UpdateCheckResult,
  TaskHistoryRecord,
} from '../shared/types';
import { useEnvStatus } from './hooks/useEnvStatus';
import { useCrawlerController } from './hooks/useCrawlerController';
import { useAccountIdentificationController } from './hooks/useAccountIdentificationController';
import { useSettings } from './hooks/useSettings';
import './App.css';

const ACCOUNT_ALLOWED_PLATFORMS: AccountIdentificationPlatformId[] = ['xiaohongshu', 'douyin', 'weibo'];
const DEFAULT_ACCOUNT_KEYWORDS = ['追觅员工', '追觅上班', '追觅入职', '追觅内推', '追觅招聘', '追觅研发', '追觅售后', 'Dreame'];

const App: React.FC = () => {
  const [workMode, setWorkMode] = useState<'content' | 'accounts'>('content');
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [includeKeywords, setIncludeKeywords] = useState<string[]>([]);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<PlatformId[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [count, setCount] = useState<number>(100);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('excel');
  const [outputDir, setOutputDir] = useState<string>('');
  const [showCookieSettings, setShowCookieSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<Pick<
    UpdateCheckResult,
    'hasUpdate' | 'latestVersion' | 'url' | 'error'
  > | null>(null);
  const [taskHistory, setTaskHistory] = useState<TaskHistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [lastExportPath, setLastExportPath] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [incremental, setIncremental] = useState(false);
  const [keywordFilter, setKeywordFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformId | null>(null);
  const [batchQueue, setBatchQueue] = useState<BatchTask[]>([]);
  const [configTab, setConfigTab] = useState<'setup' | 'queue'>('setup');
  const [accountCompanyName, setAccountCompanyName] = useState('追觅');
  const [accountKeywords, setAccountKeywords] = useState<string[]>(DEFAULT_ACCOUNT_KEYWORDS);
  const [accountPlatforms, setAccountPlatforms] = useState<AccountIdentificationPlatformId[]>(ACCOUNT_ALLOWED_PLATFORMS);
  const [accountCount, setAccountCount] = useState(100);

  const { envStatus, appVersion, refreshEnvStatus } = useEnvStatus();
  const { settings, updateSettings } = useSettings();
  const {
    isCrawling,
    progress,
    crawledData,
    error,
    setError,
    friendlyError,
    setFriendlyError,
    startCrawler,
    stopCrawler,
    exportData,
  } = useCrawlerController({
    onComplete: refreshTaskHistory,
    onError: refreshTaskHistory,
  });
  const {
    isIdentifying,
    progress: accountProgress,
    accountData,
    error: accountError,
    setError: setAccountError,
    friendlyError: accountFriendlyError,
    setFriendlyError: setAccountFriendlyError,
    startIdentification,
    stopIdentification,
    exportData: exportAccountData,
  } = useAccountIdentificationController();

  const filteredData = crawledData.filter((item) => {
    if (keywordFilter && !item.content.includes(keywordFilter)) return false;
    if (authorFilter && !item.author.includes(authorFilter)) return false;
    if (platformFilter && item.platform !== platformFilter) return false;
    return true;
  });

  const isBusy = isCrawling || isIdentifying;
  const activeError = workMode === 'accounts' ? accountError : error;
  const activeFriendlyError = workMode === 'accounts' ? accountFriendlyError : friendlyError;
  const activeProgress: CrawlerProgress | null = workMode === 'accounts'
    ? accountProgress && {
        keyword: accountCompanyName,
        platform: accountProgress.platform,
        current: accountProgress.current,
        total: accountProgress.total,
        data: [],
      }
    : progress;
  async function refreshTaskHistory() {
    const history = await window.electronAPI.getTaskHistory();
    setTaskHistory(history);
  }

  useEffect(() => {
    refreshTaskHistory();
  }, []);

  useEffect(() => {
    if (settings && settings.firstRun && !settings.onboardingCompleted) {
      setShowOnboarding(true);
    }
  }, [settings]);

  const handleToggleTheme = () => {
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      return next;
    });
  };

  const handleSelectDir = async () => {
    const result = await window.electronAPI.selectOutputDir();
    if (!result.canceled && result.filePaths.length > 0) {
      setOutputDir(result.filePaths[0]);
      setError(null);
      setAccountError(null);
      setNotice(null);
    }
  };

  const handleAddToBatch = () => {
    if (keywords.length === 0 || platforms.length === 0) {
      setError('请至少添加一个关键词并选择一个平台');
      return;
    }
    const newTasks: BatchTask[] = [];
    for (const keyword of keywords) {
      for (const platform of platforms) {
        const id = `${platform}-${keyword}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        newTasks.push({ id, keyword, platform });
      }
    }
    setBatchQueue((prev) => [...prev, ...newTasks]);
    setConfigTab('queue');
    setNotice(`已添加 ${newTasks.length} 个任务到队列`);
  };

  const handleSelectBatchTask = (task: BatchTask) => {
    setKeywords([task.keyword]);
    setPlatforms([task.platform as PlatformId]);
    setConfigTab('setup');
    setNotice(`已切换至: ${task.platform} / ${task.keyword}`);
  };

  const handleStart = async () => {
    setNotice(null);
    const missingCookiePlatforms = envStatus
      ? platforms.filter((platform) => platform !== 'xiaohongshu' && !envStatus.cookies?.[platform])
      : [];

    let sinceTimestamp: string | null = null;
    if (incremental && settings) {
      const key = `${platforms[0]}:${keywords[0]}`;
      sinceTimestamp = settings.lastCrawlTimestamps[key] || null;
    }

    const success = await startCrawler({
      keywords,
      includeKeywords,
      excludeKeywords,
      platforms,
      startDate,
      endDate,
      count,
      outputDir,
      exportFormat,
      incremental,
      sinceTimestamp,
      envReady: Boolean(envStatus?.ready),
      missingCookiePlatforms,
    });

    if (success && incremental && settings) {
      const key = `${platforms[0]}:${keywords[0]}`;
      await updateSettings({
        lastCrawlTimestamps: {
          ...settings.lastCrawlTimestamps,
          [key]: new Date().toISOString(),
        },
      });
    }
  };

  const handleStartAccountIdentification = async () => {
    setNotice(null);
    const missingCookiePlatforms = envStatus
      ? accountPlatforms.filter((platform) => platform !== 'xiaohongshu' && !envStatus.cookies?.[platform])
      : [];

    await startIdentification({
      taskType: 'account_identification',
      companyName: accountCompanyName,
      keywords: accountKeywords,
      platforms: accountPlatforms,
      count: accountCount,
      outputDir,
      exportFormat,
      envReady: Boolean(envStatus?.ready),
      missingCookiePlatforms,
    });
  };

  const handleExport = async () => {
    setNotice('正在导出...');
    setLastExportPath(null);
    const filePath = await exportData({
      outputDir,
      exportFormat,
    });

    if (filePath) {
      setNotice('导出完成');
      setLastExportPath(filePath);
    }
  };

  const handleExportAccountData = async () => {
    setNotice('正在导出账号识别结果...');
    setLastExportPath(null);
    const filePath = await exportAccountData({
      outputDir,
      exportFormat,
      companyName: accountCompanyName,
    });

    if (filePath) {
      setNotice('账号识别结果导出完成');
      setLastExportPath(filePath);
    }
  };

  const handleQuickDemo = async () => {
    setKeywords(['AI']);
    setPlatforms(['xiaohongshu']);
    setCount(5);
    setStartDate(null);
    setEndDate(null);
    setNotice(null);
    setError(null);
    setFriendlyError(null);

    if (!outputDir) {
      const defaultDir = await window.electronAPI.selectOutputDir();
      if (!defaultDir.canceled && defaultDir.filePaths.length > 0) {
        setOutputDir(defaultDir.filePaths[0]);
      }
    }

    setTimeout(() => handleStart(), 200);
  };

  const handleCheckUpdate = async () => {
    const result = await window.electronAPI.checkForUpdate();
    setUpdateInfo(result);
    if (result.error) {
      setNotice(`更新检查：${result.error}`);
    } else if (result.hasUpdate) {
      setNotice(`发现新版本 ${result.latestVersion}，请点击标题栏更新按钮查看`);
    } else {
      setNotice('当前已是最新版本');
    }
  };

  return (
    <div className="app">
        <Header
          onOpenCookieSettings={() => setShowCookieSettings(true)}
          appVersion={appVersion}
          envStatus={envStatus}
          themeMode={themeMode}
          onToggleTheme={handleToggleTheme}
          updateInfo={updateInfo}
          onCheckUpdate={handleCheckUpdate}
        />
        <div className="main-content">
          <div className="config-panel">
            <div className="ct-mode-tabs" role="tablist" aria-label="工作模式">
              <button
                className={`ct-mode-tab ${workMode === 'content' ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={workMode === 'content'}
                onClick={() => setWorkMode('content')}
                disabled={isBusy}
              >
                内容采集
              </button>
              <button
                className={`ct-mode-tab ${workMode === 'accounts' ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={workMode === 'accounts'}
                onClick={() => setWorkMode('accounts')}
                disabled={isBusy}
              >
                员工账号识别
              </button>
            </div>

            {workMode === 'content' && (
            <div className="ct-config-tabs" role="tablist" aria-label="采集配置">
              <button
                className={`ct-config-tab ${configTab === 'setup' ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={configTab === 'setup'}
                onClick={() => setConfigTab('setup')}
              >
                采集配置
              </button>
              <button
                className={`ct-config-tab ${configTab === 'queue' ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={configTab === 'queue'}
                onClick={() => setConfigTab('queue')}
              >
                任务队列
                <span className="ct-config-tab-count">{batchQueue.length}</span>
              </button>
            </div>
            )}

            {workMode === 'accounts' ? (
              <>
                {envStatus && (
                  <div className={`env-panel ${envStatus.ready ? 'ready' : 'warning'}`}>
                    <div className="env-panel-header">
                      <span className="env-panel-title">运行环境</span>
                      <button
                        className="env-refresh-btn"
                        onClick={refreshEnvStatus}
                        disabled={isBusy}
                      >
                        刷新状态
                      </button>
                    </div>
                    <div className="env-summary">
                      {envStatus.ready
                        ? '环境已就绪，可以开始账号识别。'
                        : `需处理：${envStatus.issues.join('、')}`}
                    </div>
                    <div className="env-check-grid">
                      <span className={envStatus.cookies?.xiaohongshu ? 'ok' : 'bad'}>
                        小红书 Cookie
                      </span>
                      <span className={envStatus.cookies?.douyin ? 'ok' : 'bad'}>抖音 Cookie</span>
                      <span className={envStatus.cookies?.weibo ? 'ok' : 'bad'}>微博 Cookie</span>
                    </div>
                  </div>
                )}
                <div className="ct-account-config-block">
                  <label className="label">
                    <span className="label-text">公司名称</span>
                    <span className="label-hint">用于生成员工识别关键词和证据判断</span>
                  </label>
                  <input
                    className="ct-account-company-input"
                    value={accountCompanyName}
                    onChange={(event) => setAccountCompanyName(event.target.value)}
                    disabled={isBusy}
                    placeholder="追觅"
                  />
                </div>
                <KeywordInput
                  keywords={accountKeywords}
                  includeKeywords={[]}
                  excludeKeywords={[]}
                  onKeywordsChange={setAccountKeywords}
                  onIncludeKeywordsChange={() => undefined}
                  onExcludeKeywordsChange={() => undefined}
                  disabled={isBusy}
                />
                <PlatformSelector
                  selected={accountPlatforms}
                  onChange={(next) => setAccountPlatforms(next as AccountIdentificationPlatformId[])}
                  disabled={isBusy}
                  allowedPlatforms={ACCOUNT_ALLOWED_PLATFORMS}
                />
                <CountSelector value={accountCount} onChange={setAccountCount} disabled={isBusy} />
                <ExportFormatSelector
                  value={exportFormat}
                  onChange={setExportFormat}
                  disabled={isBusy}
                />
                <div className="output-dir">
                  <div className="output-dir-label">
                    <span className="label">输出目录</span>
                    {outputDir && <span className="dir-path">{outputDir}</span>}
                  </div>
                  <button
                    className="select-dir-btn"
                    onClick={handleSelectDir}
                    disabled={isBusy}
                  >
                    选择保存目录
                  </button>
                </div>
              </>
            ) : configTab === 'setup' ? (
              <>
                {envStatus && (
                  <div className={`env-panel ${envStatus.ready ? 'ready' : 'warning'}`}>
                    <div className="env-panel-header">
                      <span className="env-panel-title">运行环境</span>
                      <button
                        className="env-refresh-btn"
                        onClick={refreshEnvStatus}
                        disabled={isBusy}
                      >
                        刷新状态
                      </button>
                    </div>
                    <div className="env-summary">
                      {envStatus.ready
                        ? '环境已就绪，可以直接开始。'
                        : `需处理：${envStatus.issues.join('、')}`}
                    </div>
                    <div className="env-meta">
                      <span>运行时: {envStatus.runtimeLabel}</span>
                      <span>
                        {envStatus.runtimeMode === 'bundled' ? '版本' : 'Python'}:{' '}
                        {envStatus.pythonVersion || '未检测到'}
                      </span>
                    </div>
                    <div className="env-check-grid">
                      <span
                        className={
                          envStatus.crawlerExecutableExists
                            ? 'ok'
                            : envStatus.runtimeMode === 'bundled'
                              ? 'bad'
                              : 'ok'
                        }
                      >
                        内置引擎
                      </span>
                      <span className={envStatus.playwrightInstalled ? 'ok' : 'bad'}>
                        {envStatus.runtimeMode === 'bundled' ? '运行时' : '依赖'}
                      </span>
                      <span className={envStatus.chromiumInstalled ? 'ok' : 'bad'}>
                        {envStatus.runtimeMode === 'bundled' ? '内置浏览器' : '浏览器'}
                      </span>
                      <span className={envStatus.cookies?.xiaohongshu ? 'ok' : 'bad'}>
                        小红书 Cookie
                      </span>
                      <span className={envStatus.cookies?.douyin ? 'ok' : 'bad'}>抖音 Cookie</span>
                      <span className={envStatus.cookies?.weibo ? 'ok' : 'bad'}>微博 Cookie</span>
                      <span className={envStatus.cookies?.bilibili ? 'ok' : 'bad'}>B站 Cookie</span>
                    </div>
                  </div>
                )}
                <KeywordInput
                  keywords={keywords}
                  includeKeywords={includeKeywords}
                  excludeKeywords={excludeKeywords}
                  onKeywordsChange={setKeywords}
                  onIncludeKeywordsChange={setIncludeKeywords}
                  onExcludeKeywordsChange={setExcludeKeywords}
                  disabled={isBusy}
                />
                <PlatformSelector
                  selected={platforms}
                  onChange={setPlatforms}
                  disabled={isBusy}
                />
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  disabled={isBusy}
                />
                <CountSelector value={count} onChange={setCount} disabled={isBusy} />
                <div className="ct-incremental-toggle">
                  <label className="ct-incremental-label">
                    <input
                      type="checkbox"
                      checked={incremental}
                      onChange={(e) => setIncremental(e.target.checked)}
                      disabled={isBusy}
                    />
                    <span>仅采集上次之后的新数据</span>
                  </label>
                  {incremental && settings && keywords.length > 0 && platforms.length > 0 && (
                    <span className="ct-incremental-hint">
                      上次采集:{' '}
                      {settings.lastCrawlTimestamps[`${platforms[0]}:${keywords[0]}`]
                        ? new Date(
                            settings.lastCrawlTimestamps[`${platforms[0]}:${keywords[0]}`]
                          ).toLocaleString('zh-CN')
                        : '无记录'}
                    </span>
                  )}
                </div>
                <ExportFormatSelector
                  value={exportFormat}
                  onChange={setExportFormat}
                  disabled={isBusy}
                />
                <div className="output-dir">
                  <div className="output-dir-label">
                    <span className="label">输出目录</span>
                    {outputDir && <span className="dir-path">{outputDir}</span>}
                  </div>
                  <button
                    className="select-dir-btn"
                    onClick={handleSelectDir}
                    disabled={isBusy}
                  >
                    选择保存目录
                  </button>
                </div>
                <button
                  className="ct-batch-add-btn"
                  onClick={handleAddToBatch}
                  disabled={isBusy}
                >
                  添加到队列
                </button>
              </>
            ) : (
              <div className="ct-config-tab-panel" role="tabpanel">
                <BatchQueuePanel
                  tasks={batchQueue}
                  onRemove={(id) => setBatchQueue((prev) => prev.filter((t) => t.id !== id))}
                  onClear={() => setBatchQueue([])}
                  onSelect={handleSelectBatchTask}
                />
              </div>
            )}
          </div>

          <div className="preview-panel">
            <ProgressBar
              progress={activeProgress}
              isCrawling={isBusy}
              crawledCount={workMode === 'accounts' ? accountData.length : crawledData.length}
              activeLabel={workMode === 'accounts' ? '正在识别...' : '正在爬取...'}
              doneLabel={workMode === 'accounts' ? '识别完成' : '爬取完成'}
              countLabel={workMode === 'accounts' ? '已识别' : '已爬取'}
            />

            {activeError && (
              <div className="error-message">
                <span className="error-icon">!</span>
                <span className="error-text">{activeError}</span>
                {activeFriendlyError?.actionable && activeFriendlyError.action === 'check_cookies' && (
                  <button className="error-action-btn" onClick={() => setShowCookieSettings(true)}>
                    {activeFriendlyError.actionLabel}
                  </button>
                )}
                {activeFriendlyError?.actionable && activeFriendlyError.action === 'retry' && (
                  <button
                    className="error-action-btn"
                    onClick={() => {
                      if (workMode === 'accounts') {
                        setAccountError(null);
                        setAccountFriendlyError(null);
                        handleStartAccountIdentification();
                      } else {
                        setError(null);
                        setFriendlyError(null);
                        handleStart();
                      }
                    }}
                  >
                    {activeFriendlyError.actionLabel}
                  </button>
                )}
              </div>
            )}

            {notice && (
              <div className="error-message success-message">
                <span className="error-icon">✓</span>
                {notice}
              </div>
            )}

            {lastExportPath && <ExportActions filePath={lastExportPath} />}

            {workMode === 'accounts' ? (
              <AccountResults data={accountData} />
            ) : (
              <>
                <PreviewFilters
                  keywordFilter={keywordFilter}
                  onKeywordFilterChange={setKeywordFilter}
                  authorFilter={authorFilter}
                  onAuthorFilterChange={setAuthorFilter}
                  platformFilter={platformFilter}
                  onPlatformFilterChange={setPlatformFilter}
                />
                <ContentPreview
                  data={crawledData}
                  onQuickDemo={handleQuickDemo}
                  filteredData={filteredData}
                />
              </>
            )}

            {workMode === 'content' && <div className="task-history">
              <button className="task-history-toggle" onClick={() => setShowHistory((p) => !p)}>
                {showHistory ? '▼' : '▶'} 最近任务 ({taskHistory.length})
              </button>
              {showHistory && (
                <div className="task-history-list">
                  {taskHistory.length === 0 && (
                    <div className="task-history-empty">
                      <span className="task-history-empty-icon">📋</span>
                      <span>暂无历史任务</span>
                      <span className="task-history-empty-hint">
                        完成一次采集后，任务记录将出现在这里
                      </span>
                    </div>
                  )}
                  {taskHistory.map((task, idx) => (
                    <div key={idx} className={`task-history-item ${task.status}`}>
                      <div className="task-history-meta">
                        <span className="task-history-time">
                          {new Date(task.timestamp).toLocaleString('zh-CN')}
                        </span>
                        <span className={`task-history-status ${task.status}`}>
                          {task.status === 'running'
                            ? '进行中'
                            : task.status === 'completed'
                              ? '已完成'
                              : '失败'}
                        </span>
                      </div>
                      <div className="task-history-detail">
                        {task.keywords.join('、')} / {task.platforms.join('、')} / {task.count}条
                        {task.totalItems !== undefined && ` → ${task.totalItems}条`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>}
          </div>
        </div>

        <ActionButtons
          isCrawling={isBusy}
          onStart={workMode === 'accounts' ? handleStartAccountIdentification : handleStart}
          onStop={workMode === 'accounts' ? stopIdentification : stopCrawler}
          onExport={workMode === 'accounts' ? handleExportAccountData : handleExport}
          canExport={workMode === 'accounts' ? accountData.length > 0 : crawledData.length > 0}
          disableStart={Boolean(envStatus && !envStatus.ready)}
          startLabel={workMode === 'accounts' ? '开始识别' : '开始爬取'}
          stopLabel={workMode === 'accounts' ? '停止识别' : '停止爬取'}
          exportLabel={workMode === 'accounts' ? '导出账号' : '导出数据'}
        />
        <CookieSettings
          visible={showCookieSettings}
          onClose={() => setShowCookieSettings(false)}
          onSaved={refreshEnvStatus}
        />
        <OnboardingOverlay
          visible={showOnboarding}
          onComplete={() => {
            setShowOnboarding(false);
            updateSettings({ firstRun: false, onboardingCompleted: true });
          }}
          onSkip={() => {
            setShowOnboarding(false);
            updateSettings({ firstRun: false, onboardingCompleted: true });
          }}
        />
    </div>
  );
};

export default App;
