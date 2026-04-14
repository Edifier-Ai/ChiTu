import { useEffect, useRef, useState, useCallback } from 'react';
import { CrawledItem, CrawlerConfig, CrawlerProgress, ExportFormat } from '../../shared/types';

// Native throttle implementation — replaces lodash/throttle phantom dependency
function throttle<T extends (...args: unknown[]) => void>(fn: T, delay: number): T & { flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: unknown[] | null = null;

  const invoke = () => {
    if (lastArgs !== null) {
      fn(...lastArgs);
      lastArgs = null;
    }
  };

  const throttled = ((...args: unknown[]) => {
    lastArgs = args;
    if (timer === null) {
      invoke();
      timer = setTimeout(() => {
        timer = null;
        invoke();
      }, delay);
    }
  }) as T & { flush: () => void; cancel: () => void };

  throttled.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    invoke();
  };

  throttled.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  return throttled;
}

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

  // Throttled data update — uses immutable copy to avoid stale closure issues
  const throttledDataUpdate = useCallback(
    throttle(() => {
      // Create a fresh copy from the ref at the time of actual execution
      setCrawledData([...crawledDataRef.current]);
    }, 50),
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
      // 进度实时更新（无节流）
      setProgress(data);
      
      // 数据更新：使用新数组引用避免突变问题
      let changed = false;
      if (data.data && data.data.length > 0) {
        const currentData = crawledDataRef.current;
        const indexByKey = indexByKeyRef.current;
        // Create a new array only when there are changes
        const merged = [...currentData];
        
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

        if (changed) {
          crawledDataRef.current = merged;
        }
      }
      
      // 使用节流更新数据
      if (changed) {
        throttledDataUpdate();
      }
    });

    const unsubError = window.electronAPI.onCrawlerError((message: string) => {
      setError(message);
      setIsCrawling(false);
      throttledDataUpdate.flush();
    });

    const unsubComplete = window.electronAPI.onCrawlerComplete((result) => {
      setIsCrawling(false);
      setProgress(null);
      throttledDataUpdate.flush(); // Ensure any pending updates are committed
      
      // result.code is null if the process was killed by a signal (e.g. stopped manually)
      const wasStoppedManually = result.code === null;
      if (!wasStoppedManually && crawledDataRef.current.length === 0 && !errorRef.current) {
        setError('本次采集已结束，但没有返回任何数据。请检查 Cookie、关键词筛选条件，或稍后重试。');
      }
    });

    return () => {
      unsubProgress();
      unsubError();
      unsubComplete();
      throttledDataUpdate.cancel();
    };
  }, [throttledDataUpdate]);

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
      setError(`以下平台缺少 Cookie：${missingCookiePlatforms.join('、')}。请先在右上角"账号设置"中保存登录态。`);
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
