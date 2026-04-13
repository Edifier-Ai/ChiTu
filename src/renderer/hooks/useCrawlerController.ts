import { useEffect, useRef, useState, useCallback } from 'react';
import { CrawledItem, CrawlerConfig, CrawlerProgress, ExportFormat } from '../../shared/types';
import throttle from 'lodash/throttle';

interface StartOptions extends CrawlerConfig {
  envReady: boolean;
  missingCookiePlatforms: string[];
}

interface ExportOptions {
  outputDir: string;
  exportFormat: ExportFormat;
}

export function useCrawlerController() {
  const [isCrawling, setIsCrawling] = useState(false);
  const [progress, setProgress] = useState<CrawlerProgress | null>(null);
  const [crawledData, setCrawledData] = useState<CrawledItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const crawledDataRef = useRef<CrawledItem[]>([]);
  const indexByKeyRef = useRef<Map<string, number>>(new Map());
  const errorRef = useRef<string | null>(null);

  // Use throttle to prevent React state updates from blocking the main thread during high-frequency IPC
  const throttledUpdateUI = useCallback(
    throttle((newProgress: CrawlerProgress | null, newData: CrawledItem[]) => {
      if (newProgress) setProgress(newProgress);
      setCrawledData([...newData]); // Update state with a new array reference
    }, 200),
    []
  );

  useEffect(() => {
    crawledDataRef.current = crawledData;
  }, [crawledData]);

  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  useEffect(() => {
    const unsubProgress = window.electronAPI.onCrawlerProgress((data) => {
      let changed = false;
      if (data.data && data.data.length > 0) {
        const merged = crawledDataRef.current;
        const indexByKey = indexByKeyRef.current;
        for (const item of data.data) {
          const key = `${item.platform}-${item.id}-${item.timestamp}`;
          const existingIndex = indexByKey.get(key);
          
          if (existingIndex === undefined) {
            indexByKey.set(key, merged.length);
            merged.push(item);
            changed = true;
          } else {
            const existing = merged[existingIndex];
            const existingCommentCount = existing.comments?.length || 0;
            const nextCommentCount = item.comments?.length || 0;
            if (nextCommentCount >= existingCommentCount) {
              merged[existingIndex] = item;
              changed = true;
            }
          }
        }
      }
      
      // Update UI using throttle
      throttledUpdateUI(data, changed ? crawledDataRef.current : crawledDataRef.current);
    });

    const unsubError = window.electronAPI.onCrawlerError((message: string) => {
      setError(message);
      setIsCrawling(false);
      throttledUpdateUI.flush();
    });

    const unsubComplete = window.electronAPI.onCrawlerComplete(() => {
      setIsCrawling(false);
      setProgress(null);
      throttledUpdateUI.flush(); // Ensure any pending updates are committed
      if (crawledDataRef.current.length === 0 && !errorRef.current) {
        setError('本次采集已结束，但没有返回任何数据。请检查 Cookie、关键词筛选条件，或稍后重试。');
      }
    });

    return () => {
      unsubProgress();
      unsubError();
      unsubComplete();
      throttledUpdateUI.cancel();
    };
  }, [throttledUpdateUI]);

  const startCrawler = async ({ envReady, missingCookiePlatforms, ...config }: StartOptions) => {
    if (!envReady) {
      setError('运行环境未就绪，请先修复环境问题后再试。');
      return false;
    }

    if (config.keywords.length === 0) {
      setError('请至少添加一个搜索关键词');
      return false;
    }
    if (config.platforms.length === 0) {
      setError('请至少选择一个平台');
      return false;
    }
    if (!config.outputDir) {
      setError('请选择数据保存目录');
      return false;
    }
    if (missingCookiePlatforms.length > 0) {
      setError(`以下平台缺少 Cookie：${missingCookiePlatforms.join('、')}。请先在右上角“账号设置”中保存登录态。`);
      return false;
    }

    try {
      setError(null);
      errorRef.current = null;
      setIsCrawling(true);
      setCrawledData([]);
      crawledDataRef.current = [];
      indexByKeyRef.current.clear();
      setProgress(null);
      await window.electronAPI.startCrawler(config);
      return true;
    } catch (startError) {
      const message = startError instanceof Error ? startError.message : '启动采集失败';
      setError(message);
      setIsCrawling(false);
      return false;
    }
  };

  const stopCrawler = async () => {
    await window.electronAPI.stopCrawler();
    setIsCrawling(false);
  };

  const exportData = async ({ outputDir, exportFormat }: ExportOptions) => {
    const result = await window.electronAPI.exportCrawledData({
      data: crawledData,
      outputDir,
      exportFormat,
    });

    if (!result.success) {
      setError(result.error || '导出失败');
      return null;
    }

    setError(null);
    return result.filePath || null;
  };

  return {
    isCrawling,
    progress,
    crawledData,
    error,
    setError,
    startCrawler,
    stopCrawler,
    exportData,
  };
}
