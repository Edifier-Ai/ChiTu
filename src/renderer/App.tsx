import React, { useState, useCallback, useMemo, useReducer, useRef, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Header from './components/Header';
import KeywordInput from './components/KeywordInput';
import PlatformSelector from './components/PlatformSelector';
import DateRangePicker from './components/DateRangePicker';
import CountSelector from './components/CountSelector';
import ExportFormatSelector from './components/ExportFormatSelector';
import ProgressBar from './components/ProgressBar';
import ContentPreview from './components/ContentPreview';
import ActionButtons from './components/ActionButtons';
import SettingsModal from './components/SettingsModal';
import { Dashboard } from './components/Dashboard';
import { ExportFormat, PlatformId } from '../shared/types';
import { useEnvStatus } from './hooks/useEnvStatus';
import { useCrawlerController } from './hooks/useCrawlerController';
import './App.css';

// Consolidated config state — replaces 9 individual useState calls
interface ConfigState {
  keywords: string[];
  includeKeywords: string[];
  excludeKeywords: string[];
  platforms: PlatformId[];
  startDate: string | null;
  endDate: string | null;
  count: number;
  exportFormat: ExportFormat;
  outputDir: string;
}

const initialConfig: ConfigState = {
  keywords: [],
  includeKeywords: [],
  excludeKeywords: [],
  platforms: [],
  startDate: null,
  endDate: null,
  count: 100,
  exportFormat: 'excel',
  outputDir: '',
};

function configReducer(state: ConfigState, update: Partial<ConfigState>): ConfigState {
  return { ...state, ...update };
}

const App: React.FC = () => {
  const [config, updateConfig] = useReducer(configReducer, initialConfig);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [showCookieSettings, setShowCookieSettings] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'dashboard'>('list');
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const { envStatus, appVersion, refreshEnvStatus } = useEnvStatus();
  const {
    isCrawling,
    progress,
    crawledData,
    error,
    setError,
    startCrawler,
    stopCrawler,
    exportData,
  } = useCrawlerController();

  const themeAlgorithm = useMemo(() => themeMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm, [themeMode]);

  const handleToggleTheme = useCallback(() => {
    setThemeMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      return next;
    });
  }, []);

  const handleSelectDir = useCallback(async () => {
    const result = await window.electronAPI.selectOutputDir();
    if (!result.canceled && result.filePaths.length > 0) {
      updateConfig({ outputDir: result.filePaths[0] });
      setError(null);
      setNotice(null);
    }
  }, [setError]);

  const showNotice = useCallback((msg: string) => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    setNotice(msg);
    noticeTimerRef.current = setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 5000);
  }, []);

  const handleStart = useCallback(async () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(null);
    const missingCookiePlatforms = envStatus
      ? config.platforms.filter((platform) => platform !== 'xiaohongshu' && !envStatus.cookies?.[platform])
      : [];

    await startCrawler({
      ...config,
      envReady: Boolean(envStatus?.ready),
      missingCookiePlatforms,
    });
  }, [envStatus, config, startCrawler]);

  const handleExport = useCallback(async () => {
    const filePath = await exportData({
      outputDir: config.outputDir,
      exportFormat: config.exportFormat,
    });

    if (filePath) {
      showNotice(`导出完成：${filePath}`);
    }
  }, [exportData, config.outputDir, config.exportFormat, showNotice]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: themeAlgorithm,
        token: {
          colorPrimary: '#ef4444',
          borderRadius: 8,
        },
      }}
    >
      <div className="app">
        <Header
          onOpenCookieSettings={() => setShowCookieSettings(true)}
          appVersion={appVersion}
          envStatus={envStatus}
          themeMode={themeMode}
          onToggleTheme={handleToggleTheme}
        />
        <div className="main-content">
          <div className="config-panel">
            {envStatus && (
              <div className={`env-panel ${envStatus.ready ? 'ready' : 'warning'}`}>
                <div className="env-panel-header">
                  <span className="env-panel-title">运行环境</span>
                  <button className="env-refresh-btn" onClick={refreshEnvStatus} disabled={isCrawling}>
                    刷新状态
                  </button>
                </div>
                <div className="env-summary">
                  {envStatus.ready ? '环境已就绪，可以直接开始。' : `需处理：${envStatus.issues.join('、')}`}
                </div>
                <div className="env-meta">
                  <span>运行时: {envStatus.runtimeLabel}</span>
                  <span>{envStatus.runtimeMode === 'bundled' ? '版本' : 'Python'}: {envStatus.pythonVersion || '未检测到'}</span>
                </div>
                <div className="env-check-grid">
                  <span className={envStatus.crawlerExecutableExists ? 'ok' : envStatus.runtimeMode === 'bundled' ? 'bad' : 'ok'}>
                    内置引擎
                  </span>
                  <span className={envStatus.playwrightInstalled ? 'ok' : 'bad'}>
                    {envStatus.runtimeMode === 'bundled' ? '运行时' : '依赖'}
                  </span>
                  <span className={envStatus.chromiumInstalled ? 'ok' : 'bad'}>
                    {envStatus.runtimeMode === 'bundled' ? '内置浏览器' : '浏览器'}
                  </span>
                  <span className={envStatus.cookies?.xiaohongshu ? 'ok' : 'bad'}>小红书 Cookie</span>
                  <span className={envStatus.cookies?.douyin ? 'ok' : 'bad'}>抖音 Cookie</span>
                  <span className={envStatus.cookies?.weibo ? 'ok' : 'bad'}>微博 Cookie</span>
                  <span className={envStatus.cookies?.bilibili ? 'ok' : 'bad'}>B站 Cookie</span>
                </div>
              </div>
            )}
            <KeywordInput
              keywords={config.keywords}
              includeKeywords={config.includeKeywords}
              excludeKeywords={config.excludeKeywords}
              onKeywordsChange={(keywords) => updateConfig({ keywords })}
              onIncludeKeywordsChange={(includeKeywords) => updateConfig({ includeKeywords })}
              onExcludeKeywordsChange={(excludeKeywords) => updateConfig({ excludeKeywords })}
              disabled={isCrawling}
            />
            <PlatformSelector
              selected={config.platforms}
              onChange={(platforms) => updateConfig({ platforms })}
              disabled={isCrawling}
            />
            <DateRangePicker
              startDate={config.startDate}
              endDate={config.endDate}
              onStartDateChange={(startDate) => updateConfig({ startDate })}
              onEndDateChange={(endDate) => updateConfig({ endDate })}
              disabled={isCrawling}
            />
            <CountSelector
              value={config.count}
              onChange={(count) => updateConfig({ count })}
              disabled={isCrawling}
            />
            <ExportFormatSelector
              value={config.exportFormat}
              onChange={(exportFormat) => updateConfig({ exportFormat })}
              disabled={isCrawling}
            />
            <div className="output-dir">
              <div className="output-dir-label">
                <span className="label">输出目录</span>
                {config.outputDir && <span className="dir-path">{config.outputDir}</span>}
              </div>
              <button
                className="select-dir-btn"
                onClick={handleSelectDir}
                disabled={isCrawling}
              >
                选择保存目录
              </button>
            </div>
          </div>

          <div className="preview-panel">
            <ProgressBar
              progress={progress}
              isCrawling={isCrawling}
              totalExpected={config.keywords.length * config.platforms.length * config.count}
              crawledCount={crawledData.length}
            />

            {error && (
              <div className="error-message">
                <span className="error-icon">!</span>
                {error}
              </div>
            )}

            {notice && (
              <div className="notice-message">
                <span className="notice-icon">✓</span>
                {notice}
              </div>
            )}

            {crawledData.length > 0 && (
              <div className="view-toggle">
                <button 
                  className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                >
                  实时预览
                </button>
                <button 
                  className={`view-toggle-btn ${viewMode === 'dashboard' ? 'active' : ''}`}
                  onClick={() => setViewMode('dashboard')}
                >
                  数据大盘
                </button>
              </div>
            )}

            {viewMode === 'list' || crawledData.length === 0 ? (
              <ContentPreview data={crawledData} />
            ) : (
              <Dashboard data={crawledData} isCrawling={isCrawling} />
            )}
          </div>
        </div>

        <ActionButtons
          isCrawling={isCrawling}
          onStart={handleStart}
          onStop={stopCrawler}
          onExport={handleExport}
          canExport={crawledData.length > 0}
          disableStart={Boolean(envStatus && !envStatus.ready)}
        />
        <SettingsModal
          visible={showCookieSettings}
          onClose={() => setShowCookieSettings(false)}
          onSaved={refreshEnvStatus}
        />
      </div>
    </ConfigProvider>
  );
};

export default App;
