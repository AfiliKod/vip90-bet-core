import 'dotenv/config';

// Global console timing patch
['log', 'warn', 'error', 'info'].forEach(method => {
  const orig = console[method].bind(console);
  console[method] = (...args) => {
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    orig(`[${ts}]`, ...args);
  };
});
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { createApp, corsOptions } from './app.js';
import { connectDB } from './db.js';
import { initSocket } from './socket/handler.js';
import { initCrashGame } from './services/inhouse/crashGame.js';
import { initRouletteGame } from './services/inhouse/rouletteGame.js';
import { startoddsSourceLiveSync } from './jobs/oddsSourceLiveSync.js';
import { startoddsSourceUpcomingSync } from './jobs/oddsSourceUpcomingSync.js';
import { startMonitor } from './services/syncHealth.js';
import { startStatusTransition } from './jobs/statusTransition.js';
import { startCleanupJob } from './jobs/cleanup.js';
import { startReconciliation } from './scripts/reconcilePalace.js';
import { initSentry } from './services/sentry.js';
import { errorLogger } from './services/errorLogger.js';

const app = createApp();

// Phase C2 — Sentry init
await initSentry(app);

const httpServer = createServer(app);
export const io = new Server(httpServer, { cors: corsOptions });
import { setIO } from './services/socketEmitter.js';
setIO(io);

const PORT = process.env.PORT || 3001;

// Track all intervals for graceful shutdown (Phase E13)
const intervals = [];
const wrapInterval = (fn, ms) => {
  const id = setInterval(fn, ms);
  intervals.push(id);
  return id;
};

// Patch startXxx fonksiyonlarını wrapInterval kullanacak şekilde override et
import { setInterval as _setInterval } from 'timers';
// (Daha temiz: interval'ları jobs içinde track etmek için jobManager pattern)
// Şimdilik: startXxx çağrılarından dönen interval'ları manuel track edeceğiz.

const _intervals = new Set();
const _origSetInterval = global.setInterval;
global.setInterval = (fn, ms, ...args) => {
  const id = _origSetInterval(fn, ms, ...args);
  _intervals.add(id);
  return id;
};
const clearAllIntervals = () => {
  for (const id of _intervals) clearInterval(id);
  _intervals.clear();
};

// Phase E13 — Graceful shutdown
async function shutdown(signal) {
  console.log(`\n${signal} alındı, graceful shutdown başlıyor...`);
  try {
    // 1. Yeni istekleri kabul etme
    httpServer.close(() => console.log('✅ HTTP server kapandı'));
    io.close(() => console.log('✅ Socket.IO kapandı'));
    // 2. Interval'ları temizle
    clearAllIntervals();
    console.log('✅ Job interval\'ları temizlendi');
    // 3. DB bağlantısını kapat
    await mongoose.disconnect();
    console.log('✅ MongoDB bağlantısı kapatıldı');
    setTimeout(() => process.exit(0), 1000).unref();
  } catch (e) {
    console.error('Shutdown hatası:', e);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

connectDB()
  .then(async () => {
    httpServer.listen(PORT, () => console.log(`Server :${PORT} üzerinde çalışıyor`));
    initSocket(io);
    initCrashGame(io);
    initRouletteGame(io);
    startCleanupJob();
    startStatusTransition(io);
    startoddsSourceLiveSync(io);
    startoddsSourceUpcomingSync(io);
    // Job'lar tamamen asılıp hiç rapor vermediğinde de bayatlığı yakala
    startMonitor();
    startReconciliation();
    // Casino statik cache'ini boot'ta ısıt (best-effort, non-blocking) — ilk
    // kullanıcı Palace API soğuk maliyetini beklemesin.
    import('./services/palaceCasinoService.js')
      .then(m => m.warmCache())
      .catch(() => {});
  })
  .catch(err => {
    console.error('DB bağlantı hatası:', err.message);
    errorLogger.critical('db_connect', err.message);
    process.exit(1);
  });
