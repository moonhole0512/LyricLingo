import fs from 'fs';
import path from 'path';

const logDir = path.resolve(process.cwd(), '_testcode/debug');
const logFile = path.join(logDir, 'debug.log');

export function initLogger(truncate: boolean = false) {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    if (truncate && fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, `[${new Date().toISOString()}] [Logger Init] Session started\n`, 'utf8');
    }
  } catch {}
}

export function appendDebugLog(message: string) {
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const timeStr = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timeStr}] ${message}\n`, 'utf8');
  } catch {}
}

export function logInfo(tag: string, ...args: any[]) {
  const msg = `[${tag}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`;
  console.log(`\x1b[36m${msg}\x1b[0m`);
  appendDebugLog(msg);
}

export function logWarn(tag: string, ...args: any[]) {
  const msg = `[${tag}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`;
  console.warn(`\x1b[33m${msg}\x1b[0m`);
  appendDebugLog(`[WARN] ${msg}`);
}

export function logError(tag: string, ...args: any[]) {
  const msg = `[${tag}] ${args.map(a => a instanceof Error ? (a.stack || a.message) : (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')}`;
  console.error(`\x1b[31m${msg}\x1b[0m`);
  appendDebugLog(`[ERROR] ${msg}`);
}
