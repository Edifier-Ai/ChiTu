import fs from 'fs';
import os from 'os';
import path from 'path';

export interface TaskHistoryRecord {
  timestamp: string;
  keywords: string[];
  platforms: string[];
  count: number;
  outputDir: string;
  exportFormat: string;
  status: 'running' | 'completed' | 'failed';
  totalItems?: number;
}

const HISTORY_FILE = path.join(os.homedir(), '.chitu', 'history.jsonl');

function ensureDir() {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function appendTaskHistory(record: TaskHistoryRecord): void {
  ensureDir();
  fs.appendFileSync(HISTORY_FILE, JSON.stringify(record) + '\n', 'utf-8');
}

export function readTaskHistory(limit = 10): TaskHistoryRecord[] {
  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }
  const lines = fs.readFileSync(HISTORY_FILE, 'utf-8').trim().split('\n');
  const records: TaskHistoryRecord[] = [];
  for (let i = lines.length - 1; i >= 0 && records.length < limit; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      records.unshift(JSON.parse(line));
    } catch {
      // ignore invalid lines
    }
  }
  return records;
}

export function updateLastTaskStatus(status: 'completed' | 'failed', totalItems?: number): void {
  if (!fs.existsSync(HISTORY_FILE)) {
    return;
  }
  const lines = fs.readFileSync(HISTORY_FILE, 'utf-8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const record = JSON.parse(line) as TaskHistoryRecord;
      if (record.status === 'running') {
        record.status = status;
        if (totalItems !== undefined) {
          record.totalItems = totalItems;
        }
        lines[i] = JSON.stringify(record);
        fs.writeFileSync(HISTORY_FILE, lines.join('\n') + '\n', 'utf-8');
        return;
      }
    } catch {
      // ignore
    }
  }
}
