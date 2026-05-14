import { useEffect, useState } from 'react';
import { AppSettings, SettingsResult } from '../../shared/types';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.getSettings().then((result: SettingsResult) => {
      if (result.success && result.settings) {
        setSettings(result.settings);
      }
      setIsLoading(false);
    });
  }, []);

  const updateSettings = async (partial: Partial<AppSettings>) => {
    const result = await window.electronAPI.setSettings(partial);
    if (result.success && result.settings) {
      setSettings(result.settings);
    }
    return result;
  };

  return { settings, isLoading, updateSettings };
}
