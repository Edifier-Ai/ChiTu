import fs from 'fs';
import os from 'os';
import path from 'path';
import { safeStorage } from 'electron';
import { SaveCookiesResult } from '../../shared/types';

const COOKIES_DIR = path.join(os.homedir(), '.chitu');
export const COOKIES_FILE = path.join(COOKIES_DIR, 'cookies.json');
const ENCRYPTED_COOKIES_FILE = path.join(COOKIES_DIR, 'cookies.enc');

/**
 * Migrate old plaintext cookies to encrypted format.
 * Reads the old file, encrypts, writes the new file, and deletes the old one.
 */
function migrateIfNeeded(): void {
  if (!fs.existsSync(COOKIES_FILE) || fs.existsSync(ENCRYPTED_COOKIES_FILE)) {
    return;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return;
  }

  try {
    const plaintext = fs.readFileSync(COOKIES_FILE, 'utf-8');
    // Validate it's valid JSON before migrating
    JSON.parse(plaintext);

    const encrypted = safeStorage.encryptString(plaintext);
    const dir = path.dirname(ENCRYPTED_COOKIES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(ENCRYPTED_COOKIES_FILE, encrypted);
    fs.chmodSync(ENCRYPTED_COOKIES_FILE, 0o600);

    // Remove the old plaintext file
    fs.unlinkSync(COOKIES_FILE);
  } catch {
    // Migration failed — keep the old file, it will be read as fallback
  }
}

export function loadCookies(): Record<string, string> {
  try {
    migrateIfNeeded();

    // Try encrypted file first
    if (fs.existsSync(ENCRYPTED_COOKIES_FILE) && safeStorage.isEncryptionAvailable()) {
      const encryptedBuffer = fs.readFileSync(ENCRYPTED_COOKIES_FILE);
      const decrypted = safeStorage.decryptString(encryptedBuffer);
      return JSON.parse(decrypted);
    }

    // Fallback to plaintext for backward compatibility
    if (fs.existsSync(COOKIES_FILE)) {
      return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
    }

    return {};
  } catch {
    return {};
  }
}

export function saveCookies(cookies: Record<string, string>): SaveCookiesResult {
  try {
    const dir = path.dirname(ENCRYPTED_COOKIES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const jsonStr = JSON.stringify(cookies, null, 2);

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(jsonStr);
      fs.writeFileSync(ENCRYPTED_COOKIES_FILE, encrypted);
      fs.chmodSync(ENCRYPTED_COOKIES_FILE, 0o600);

      // Remove old plaintext file if it exists
      if (fs.existsSync(COOKIES_FILE)) {
        fs.unlinkSync(COOKIES_FILE);
      }
    } else {
      // Fallback: write plaintext but with restricted permissions
      fs.writeFileSync(COOKIES_FILE, jsonStr, 'utf-8');
      fs.chmodSync(COOKIES_FILE, 0o600);
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存 Cookie 失败';
    return { success: false, error: message };
  }
}
