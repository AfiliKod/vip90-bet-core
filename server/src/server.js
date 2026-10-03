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
import { startMonitor } from './services/syncHealth.js';
import { startCleanupJob } from './jobs/cleanup.js';
import { startCloseStaleGameSessionsJob } from './jobs/closeStaleGameSessions.js';
import Setting from './models/Setting.js';
import { initSentry } from './services/sentry.js';
import { errorLogger } from './services/errorLogger.js';
import { initDefaultPermissions, initDefaultRoles, migrateOrphanedAdminRoles, syncMissingPermissions } from './services/permissions.js';
import { seedDefaultEnabledModules } from './modules/index.js';
import { initDefaultVipLevels, migrateLegacyVipIcons } from './services/vip.js';
import { startBotScheduler } from './jobs/botScheduler.js';
import { startFakeWinnersScheduler } from './services/fakeWinners.js';
import { seedDefaultPages } from './services/staticPages.js';
import { initDefaultChatRoom } from './services/chat.js';
import { initDefaultRules, dedupeRuleNames } from './services/riskRule.js';
import { initDefaultSegments } from './services/playerSegment.js';

// Igames reconciliation script ayrı (ücretli) bir pakettir — bu kurulumda
// hiç bulunmayabilir (bkz. app.js'deki aynı opsiyonel yükleme deseni).
let startReconciliation = () => {};
try {
  ({ startReconciliation } = await import('./premium/igames/reconcileIgames.js'));
} catch {
  // Igames entegrasyonu bu kurulumda mevcut değil.
}

// In-house oyun provider'ı (server/src/provider/) da ayrı (ücretli) bir
// pakettir — aynı opsiyonel yükleme deseni.
let initCrashGameNamespace = () => {};
let initRouletteGameNamespace = () => {};
let startWalletCallbackRetryWorker = () => {};
try {
  ({ initCrashGameNamespace } = await import('./premium/inhouse-provider/engine/games/crashGame.js'));
  ({ initRouletteGameNamespace } = await import('./premium/inhouse-provider/engine/games/rouletteGame.js'));
  ({ startWalletCallbackRetryWorker } = await import('./premium/inhouse-provider/engine/services/retryOutbox.js'));
} catch {
  // In-house oyun provider'ı bu kurulumda mevcut değil.
}

// Bahis sonuçlandırma motoru (oran çekme + sync job'ları) da ayrı (ücretli)
// bir pakettir — aynı opsiyonel yükleme deseni. Event/Bet modelleri ve
// routes/events.js|bets.js çekirdekte kalıyor, yalnızca bu job'lar taşınıyor.
let startOddsSourceLiveSync = () => {};
let startOddsSourceUpcomingSync = () => {};
let startStatusTransition = () => {};
try {
  ({ startOddsSourceLiveSync } = await import('./premium/betting/jobs/oddsSourceLiveSync.js'));
  ({ startOddsSourceUpcomingSync } = await import('./premium/betting/jobs/oddsSourceUpcomingSync.js'));
  ({ startStatusTransition } = await import('./premium/betting/jobs/statusTransition.js'));
} catch {
  // Bahis sonuçlandırma motoru bu kurulumda mevcut değil.
}

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
  console.log(`\n${signal} received, starting graceful shutdown...`);
  try {
    // 1. Yeni istekleri kabul etme
    httpServer.close(() => console.log('✅ HTTP server closed'));
    io.close(() => console.log('✅ Socket.IO closed'));
    // 2. Interval'ları temizle
    clearAllIntervals();
    console.log('✅ Job intervals cleared');
    // 3. DB bağlantısını kapat
    await mongoose.disconnect();
    console.log('✅ MongoDB connection closed');
    setTimeout(() => process.exit(0), 1000).unref();
  } catch (e) {
    console.error('Shutdown error:', e);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Periyodik arka plan job'larının (LiveSync/UpcomingSync/wallet retry/
// reconciliation/monitor) hiçbiri kendi async hatasını yakalamıyor — daha
// önce hiçbir global unhandledRejection/uncaughtException handler'ı yoktu,
// bu yüzden geçici bir ağ/DB zaman aşımı (ör. yoğun sistem yükü altında
// MongoNetworkTimeoutError) TÜM süreci çökertip systemd'yi restart-loop'a
// sokuyordu (2026-09-17'de production'da gözlemlendi — restart counter
// dakikalar içinde 60'ı geçti). unhandledRejection artık süreci
// ÇÖKERTMİYOR, sadece loglanıyor — bu sınıftaki geçici hatalar zaten
// interval'ın bir sonraki turunda kendiliğinden düzelir. uncaughtException
// (senkron hata, süreç durumu güvenilmez olabilir) hâlâ kontrollü çıkış
// yapıyor ama artık en azından errorLogger'a düşüyor.
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error('Unhandled Rejection:', message);
  errorLogger.critical('unhandled_rejection', message, {
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  errorLogger.critical('uncaught_exception', err.message, { stack: err.stack });
  process.exit(1);
});

connectDB()
  .then(async () => {
    httpServer.listen(PORT, () => console.log(`Server running on :${PORT}`));
    // O4 — kademeli yönetici yetkileri: varsayılan izin/rol setini oluşturur
    // (idempotent, koleksiyon boşsa doldurur). Daha önce hiçbir yerden
    // çağrılmadığı için Permission/Role koleksiyonları hep boştu.
    initDefaultPermissions()
      .then(() => initDefaultRoles()) // roller izinlere referans verir, sırayla çalışmalı
      // mevcut seed'de eksik kalan izinleri (ör. admin:activity:read) idempotent ekle
      .then(() => syncMissingPermissions())
      // roles boş olan role='admin' kullanıcılara super_admin ata — 2026-09-22'de
      // canlı olarak bulundu: bu adım hiç çalışmadığı için tek admin hesabı
      // panelin neredeyse tamamında "Yetki yok" hatası alıyordu.
      .then(() => migrateOrphanedAdminRoles())
      .catch(err => console.error('initDefaultPermissions/Roles error:', err.message));
    // O1 — VIP/seviye programı: varsayılan Bronze..Diamond seviyeleri
    initDefaultVipLevels()
      // Faz 9 (Material Symbols) öncesi kayıtların icon alanını glyph adına taşı
      .then(() => migrateLegacyVipIcons())
      .catch(err => console.error('initDefaultVipLevels/migrateLegacyVipIcons error:', err.message));
    // Yayın öncesi canlı olan modüller (slikair-payment) kayıt yoksa açık tohumlanır
    seedDefaultEnabledModules().catch(err => console.error('seedDefaultEnabledModules error:', err.message));
    // Footer/statik sayfalar: yasal metinler + kurumsal sayfa placeholder'ları
    seedDefaultPages().catch(err => console.error('seedDefaultPages error:', err.message));
    // P1 — sohbet: hiç oda yoksa "Genel Sohbet" odasını oluşturur
    initDefaultChatRoom().catch(err => console.error('initDefaultChatRoom error:', err.message));
    // Risk kuralları: Rules koleksiyonu boşsa varsayılan seti boot'ta bir kez doldurur
    // (initDefaultRules içinde countDocuments guard'ı var — idempotent)
    // dedupeRuleNames önce çalışır: name üzerindeki unique index, bu index
    // eklenmeden önceki eşzamanlı-çağrı bug'ından kalmış olabilecek çift
    // kayıtlar varsa kurulamaz — temizlik olmadan index sessizce kurulmaz.
    dedupeRuleNames()
      .then(() => initDefaultRules())
      .catch(err => console.error('initDefaultRules error:', err.message));
    // Segments sayfası: kriter motoru baştan beri çalışıyordu ama hiç
    // varsayılan segment yoktu, sayfa hep boş görünüyordu (denetim bulgusu)
    initDefaultSegments().catch(err => console.error('initDefaultSegments error:', err.message));
    initSocket(io);
    initCrashGameNamespace(io);
    initRouletteGameNamespace(io);
    startCleanupJob();
    startCloseStaleGameSessionsJob();
    // Demo veri canlı simülasyonu — sunucu restart sonrası önceki durumu geri yükler
    const demoDataLiveRow = await Setting.findOne({ key: 'demoData.live.config' }).lean();
    if (demoDataLiveRow?.value) {
      const config = JSON.parse(demoDataLiveRow.value);
      if (config.enabled) {
        const { startDemoDataLiveJob } = await import('./jobs/demoDataLiveSimulation.js');
        startDemoDataLiveJob((config.tickIntervalMinutes || 2) * 60 * 1000);
      }
    }
    startWalletCallbackRetryWorker();
    startStatusTransition(io);
    startOddsSourceLiveSync(io);
    startOddsSourceUpcomingSync(io);
    // P3 — bot oyuncular: aksiyonu hazır botları periyodik tetikler
    startBotScheduler();
    // Son Kazananlar simülasyonu — gerçek User/bakiye kullanmadan, değişen
    // aralıklarla kozmetik "kazanan" akışı üretir (bkz. services/fakeWinners.js)
    startFakeWinnersScheduler();
    // Job'lar tamamen asılıp hiç rapor vermediğinde de bayatlığı yakala
    startMonitor();
    startReconciliation();
    // Casino statik cache'ini boot'ta ısıt (best-effort, non-blocking) — ilk
    // kullanıcı Igames API soğuk maliyetini beklemesin.
    import('./premium/igames/igamesCasinoService.js')
      .then(m => m.warmCache())
      .catch(() => {});
  })
  .catch(err => {
    console.error('DB connection error:', err.message);
    errorLogger.critical('db_connect', err.message);
    process.exit(1);
  });
