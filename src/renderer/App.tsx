import React, { useState, useCallback, useMemo } from 'react';
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
import CookieSettings from './components/CookieSettings';
import { ExportFormat, PlatformId } from '../shared/types';
import { useEnvStatus } from './hooks/useEnvStatus';
import { useCrawlerController } from './hooks/useCrawlerController';
import './App.css';

const App: React.FC = () => {
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
      setOutputDir(result.filePaths[0]);
      setError(null);
      setNotice(null);
    }
  }, [setError]);

  const handleStart = useCallback(async () => {
    setNotice(null);
    const missingCookiePlatforms = envStatus
      ? platforms.filter((platform) => platform !== 'xiaohongshu' && !envStatus.cookies?.[platform])
      : [];

    await startCrawler({
      keywords,
      includeKeywords,
      excludeKeywords,
      platforms,
      startDate,
      endDate,
      count,
      outputDir,
      exportFormat,
      envReady: Boolean(envStatus?.ready),
      missingCookiePlatforms,
    });
  }, [envStatus, platforms, keywords, includeKeywords, excludeKeywords, startDate, endDate, count, outputDir, exportFormat, startCrawler]);

  const handleExport = useCallback(async () => {
    const filePath = await exportData({
      outputDir,
      exportFormat,
    });

    if (filePath) {
      setNotice(`导出完成：${filePath}`);
    }
  }, [exportData, outputDir, exportFormat]);

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
              keywords={keywords}
              includeKeywords={includeKeywords}
              excludeKeywords={excludeKeywords}
              onKeywordsChange={setKeywords}
              onIncludeKeywordsChange={setIncludeKeywords}
              onExcludeKeywordsChange={setExcludeKeywords}
              disabled={isCrawling}
            />
            <PlatformSelector
              selected={platforms}
              onChange={setPlatforms}
              disabled={isCrawling}
            />
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              disabled={isCrawling}
            />
            <CountSelector
              value={count}
              onChange={setCount}
              disabled={isCrawling}
            />
            <ExportFormatSelector
              value={exportFormat}
              onChange={setExportFormat}
              disabled={isCrawling}
            />
            <div className="output-dir">
              <div className="output-dir-label">
                <span className="label">输出目录</span>
                {outputDir && <span className="dir-path">{outputDir}</span>}
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
              totalExpected={keywords.length * platforms.length * count}
              crawledCount={crawledData.length}
            />

            {error && (
              <div className="error-message">
                <span className="error-icon">!</span>
                {error}
              </div>
            )}

            {notice && (
              <div className="error-message success-message">
                <span className="error-icon">✓</span>
                {notice}
              </div>
            )}

            <ContentPreview data={crawledData} />
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
        <CookieSettings
          visible={showCookieSettings}
          onClose={() => setShowCookieSettings(false)}
          onSaved={refreshEnvStatus}
        />
      </div>
    </ConfigProvider>
  );
};

export default App;
