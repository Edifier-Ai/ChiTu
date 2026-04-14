import fs from 'fs';
import os from 'os';
import path from 'path';
import { AppSettings } from '../../shared/types';

const SETTINGS_DIR = path.join(os.homedir(), '.chitu');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

export function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return {};
}

export function saveSettings(settings: Partial<AppSettings>): { success: boolean; error?: string } {
  try {
    if (!fs.existsSync(SETTINGS_DIR)) {
      fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    }
    const current = loadSettings();
    const merged = { ...current, ...settings };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '保存设置失败' };
  }
}
