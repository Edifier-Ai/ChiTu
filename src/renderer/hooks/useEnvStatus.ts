import { useEffect, useState } from 'react';
import { EnvStatus } from '../../shared/types';

export function useEnvStatus() {
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [appVersion, setAppVersion] = useState('');

  const refreshEnvStatus = async () => {
    try {
      const status = await window.electronAPI.checkCrawlerEnv();
      setEnvStatus(status);
      return status;
    } catch {
      setEnvStatus(null);
      return null;
    }
  };

  useEffect(() => {
    refreshEnvStatus();
    window.electronAPI.getAppVersion().then(setAppVersion).catch(() => setAppVersion(''));
  }, []);

  return {
    envStatus,
    appVersion,
    refreshEnvStatus,
    setEnvStatus,
  };
}
