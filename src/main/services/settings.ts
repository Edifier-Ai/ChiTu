import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppSettings, SettingsResult } from '../../shared/types';

const SETTINGS_FILE = path.join(os.homedir(), '.chitu', 'settings.json');

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  firstRun: true,
  onboardingCompleted: false,
  notificationsEnabled: true,
  badgeEnabled: true,
  lastCrawlTimestamps: {},
};

function ensureDir() {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadSettings(): SettingsResult {
  ensureDir();
  if (!fs.existsSync(SETTINGS_FILE)) {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
    } catch {
      return { success: false, error: '无法创建设置文件' };
    }
    return { success: true, settings: { ...DEFAULT_SETTINGS } };
  }

  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const merged: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      lastCrawlTimestamps: {
        ...DEFAULT_SETTINGS.lastCrawlTimestamps,
        ...(parsed.lastCrawlTimestamps || {}),
      },
    };
    return { success: true, settings: merged };
  } catch {
    return { success: false, error: '设置文件损坏，已恢复默认' };
  }
}

export function saveSettings(partial: Partial<AppSettings>): SettingsResult {
  const current = loadSettings();
  if (!current.success || !current.settings) {
    return { success: false, error: current.error || '无法读取当前设置' };
  }

  const next: AppSettings = {
    ...current.settings,
    ...partial,
    lastCrawlTimestamps: {
      ...current.settings.lastCrawlTimestamps,
      ...(partial.lastCrawlTimestamps || {}),
    },
  };

  ensureDir();
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf-8');
    return { success: true, settings: next };
  } catch {
    return { success: false, error: '保存设置失败' };
  }
}
