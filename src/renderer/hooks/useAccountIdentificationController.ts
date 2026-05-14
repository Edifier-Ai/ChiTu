import { useEffect, useRef, useState } from 'react';
import {
  AccountIdentificationConfig,
  AccountIdentificationProgress,
  EmployeeAccountResult,
  ExportFormat,
} from '../../shared/types';
import { classifyError, FriendlyError } from '../../shared/errorMap';

interface StartOptions extends AccountIdentificationConfig {
  envReady: boolean;
  missingCookiePlatforms: string[];
}

interface ExportOptions {
  outputDir: string;
  exportFormat: ExportFormat;
  companyName: string;
}

export function useAccountIdentificationController() {
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [progress, setProgress] = useState<AccountIdentificationProgress | null>(null);
  const [accountData, setAccountData] = useState<EmployeeAccountResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [friendlyError, setFriendlyError] = useState<FriendlyError | null>(null);
  const accountDataRef = useRef<EmployeeAccountResult[]>([]);
  const errorRef = useRef<string | null>(null);

  useEffect(() => {
    accountDataRef.current = accountData;
  }, [accountData]);

  useEffect(() => {
    errorRef.current = error;
  }, [error]);

  useEffect(() => {
    const unsubProgress = window.electronAPI.onAccountIdentificationProgress((data) => {
      setProgress(data);
      if (data.data.length > 0) {
        setAccountData(data.data);
        accountDataRef.current = data.data;
      }
    });

    const unsubError = window.electronAPI.onCrawlerError((message: string) => {
      const friendly = classifyError(message);
      setFriendlyError(friendly);
      setError(friendly.userMessage);
      setIsIdentifying(false);
    });

    const unsubComplete = window.electronAPI.onCrawlerComplete((result) => {
      if (result.taskType !== 'account_identification') {
        return;
      }
      setIsIdentifying(false);
      setProgress(null);
      if (accountDataRef.current.length === 0 && !errorRef.current) {
        setError('本次账号识别已结束，但没有返回疑似账号。请检查 Cookie、关键词或稍后重试。');
      }
    });

    return () => {
      unsubProgress();
      unsubError();
      unsubComplete();
    };
  }, []);

  const startIdentification = async ({ envReady, missingCookiePlatforms, ...config }: StartOptions) => {
    if (!envReady) {
      setError('运行环境未就绪，请先修复环境问题后再试。');
      return false;
    }
    if (!config.companyName.trim()) {
      setError('请填写公司名称');
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
      setIsIdentifying(true);
      setAccountData([]);
      accountDataRef.current = [];
      setProgress(null);
      await window.electronAPI.startAccountIdentification(config);
      return true;
    } catch (startError) {
      const raw = startError instanceof Error ? startError.message : '启动账号识别失败';
      const friendly = classifyError(raw);
      setFriendlyError(friendly);
      setError(friendly.userMessage);
      setIsIdentifying(false);
      return false;
    }
  };

  const stopIdentification = async () => {
    await window.electronAPI.stopCrawler();
    setIsIdentifying(false);
  };

  const exportData = async ({ outputDir, exportFormat, companyName }: ExportOptions) => {
    const result = await window.electronAPI.exportAccountIdentificationData({
      data: accountData,
      outputDir,
      exportFormat,
      companyName,
    });

    if (!result.success) {
      setError(result.error || '导出失败');
      return null;
    }

    setError(null);
    return result.filePath || null;
  };

  return {
    isIdentifying,
    progress,
    accountData,
    error,
    setError,
    friendlyError,
    setFriendlyError,
    startIdentification,
    stopIdentification,
    exportData,
  };
}
