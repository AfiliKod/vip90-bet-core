import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { captureException } from './sentry.js';
import { sendAlert } from './alert.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, '../../logs');
const ERROR_LOG = path.join(LOG_DIR, 'errors.log');
const MAX_SIZE = 5 * 1024 * 1024; // 5MB rotation

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function rotateIfNeeded() {
  try {
    if (!fs.existsSync(ERROR_LOG)) return;
    const size = fs.statSync(ERROR_LOG).size;
    if (size < MAX_SIZE) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.renameSync(ERROR_LOG, path.join(LOG_DIR, `errors-${ts}.log`));
  } catch (e) {
    // silent
  }
}

function append(line) {
  rotateIfNeeded();
  fs.appendFile(ERROR_LOG, line + '\n', err => {
    if (err) console.error('[errorLogger] write failed:', err.message);
  });
}

function formatLine(level, category, message, meta) {
  const ts = new Date().toISOString();
  const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}] ${category}: ${message}${metaStr}`;
}

export const errorLogger = {
  /**
   * Kritik hata (Palace API timeout, casino crash, bonus kayıp)
   */
  critical(category, message, meta) {
    const line = formatLine('CRITICAL', category, message, meta);
    console.error(line);
    append(line);
    // Sentry + webhook
    captureException(new Error(`${category}: ${message}`), meta);
    sendAlert('CRITICAL', category, message, meta);
  },

  /**
   * Hata (Palace API 500, DB timeout)
   */
  error(category, message, meta) {
    const line = formatLine('ERROR', category, message, meta);
    console.error(line);
    append(line);
    captureException(new Error(`${category}: ${message}`), meta);
    sendAlert('ERROR', category, message, meta);
  },

  /**
   * Uyarı (Palace API 4xx, kullanıcı limit aşımı)
   */
  warn(category, message, meta) {
    const line = formatLine('WARN', category, message, meta);
    console.warn(line);
    append(line);
    sendAlert('WARN', category, message, meta);
  },

  /**
   * Bilgi (callback, deposit)
   */
  info(category, message, meta) {
    if (process.env.NODE_ENV === 'production') return;
    const line = formatLine('INFO', category, message, meta);
    console.log(line);
    append(line);
  },

  /**
   * Son N error satırını oku (admin panel için)
   */
  readRecent(limit = 100) {
    try {
      if (!fs.existsSync(ERROR_LOG)) return [];
      const content = fs.readFileSync(ERROR_LOG, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.slice(-limit).reverse();
    } catch {
      return [];
    }
  },

  /**
   * Log dosya boyutu + path
   */
  status() {
    try {
      const stats = fs.statSync(ERROR_LOG);
      return {
        path: ERROR_LOG,
        sizeBytes: stats.size,
        sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
        lastModified: stats.mtime.toISOString(),
      };
    } catch {
      return { path: ERROR_LOG, sizeBytes: 0, sizeMB: 0 };
    }
  },

  /**
   * Log dosyasını temizle
   */
  clear() {
    try {
      fs.writeFileSync(ERROR_LOG, '');
      return true;
    } catch {
      return false;
    }
  },
};