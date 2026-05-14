import { useEffect, useRef, useState } from 'react';
import { CrawledItem, CrawlerConfig, CrawlerProgress, ExportFormat } from '../../shared/types';
import { classifyError, FriendlyError } from '../../shared/errorMap';

interface StartOptions extends CrawlerConfig {
  envReady: boolean;
  missingCookiePlatforms: string[];
}

interface ExportOptions {
  outputDir: string;
  exportFormat: ExportFormat;
}

interface UseCrawlerControllerOptions {
  onComplete?: () => void;
  onError?: () => void;
}

export function useCrawlerController(options?: UseCrawlerControllerOptions) {
  const [isCrawling, setIsCrawling] = useState(false);
  const [progress, setProgress] = useState<CrawlerProgress | null>(null);
  const [crawledData, setCrawledData] = useState<CrawledItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [friendlyError, setFriendlyError] = useState<FriendlyError | null>(null);
  const crawledDataRef = useRef<CrawledItem[]>([]);
  const errorRef = useRef<string | null>(null);

  useEffect(() => {
    crawledDataRef.current = crawledData;
  }, [crawledData]);

  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  useEffect(() => {
    const unsubProgress = window.electronAPI.onCrawlerProgress((data) => {
      setProgress(data);
      if (data.data.length > 0) {
        setCrawledData((prev) => {
          const merged = [...prev];
          const indexByKey = new Map(prev.map((item, index) => [`${item.platform}-${item.id}-${item.timestamp}`, index]));
          for (const item of data.data) {
            const key = `${item.platform}-${item.id}-${item.timestamp}`;
            const existingIndex = indexByKey.get(key);
            if (existingIndex == null) {
              indexByKey.set(key, merged.length);
              merged.push(item);
              continue;
            }

            const existing = merged[existingIndex];
            const existingCommentCount = existing.comments?.length || 0;
            const nextCommentCount = item.comments?.length || 0;
            if (nextCommentCount >= existingCommentCount) {
              merged[existingIndex] = item;
            }
          }
          return merged;
        });
      }
    });

    const unsubError = window.electronAPI.onCrawlerError((message: string) => {
      const friendly = classifyError(message);
      setFriendlyError(friendly);
      setError(friendly.userMessage);
      setIsCrawling(false);
      options?.onError?.();
    });

    const unsubComplete = window.electronAPI.onCrawlerComplete((result) => {
      if (result.taskType === 'account_identification') {
        return;
      }
      setIsCrawling(false);
      setProgress(null);
      options?.onComplete?.();
      if (crawledDataRef.current.length === 0 && !errorRef.current) {
        setError('本次采集已结束，但没有返回任何数据。请检查 Cookie、关键词筛选条件，或稍后重试。');
      }
    });

    return () => {
      unsubProgress();
      unsubError();
      unsubComplete();
    };
  }, []);

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
      setFriendlyError(null);
      errorRef.current = null;
      setIsCrawling(true);
      setCrawledData([]);
      crawledDataRef.current = [];
      setProgress(null);
      await window.electronAPI.startCrawler(config);
      return true;
    } catch (startError) {
      const raw = startError instanceof Error ? startError.message : '启动采集失败';
      const friendly = classifyError(raw);
      setFriendlyError(friendly);
      setError(friendly.userMessage);
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
    friendlyError,
    setFriendlyError,
    startCrawler,
    stopCrawler,
    exportData,
  };
}
