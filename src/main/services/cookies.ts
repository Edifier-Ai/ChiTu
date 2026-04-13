import fs from 'fs';
import os from 'os';
import path from 'path';
import { SaveCookiesResult } from '../../shared/types';

export const COOKIES_FILE = path.join(os.homedir(), '.chitu', 'cookies.json');

export function loadCookies(): Record<string, string> {
  try {
    if (!fs.existsSync(COOKIES_FILE)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveCookies(cookies: Record<string, string>): SaveCookiesResult {
  try {
    const dir = path.dirname(COOKIES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存 Cookie 失败';
    return { success: false, error: message };
  }
}
