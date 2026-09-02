/**
 * Kaynak senkronizasyon sağlığı — tek doğruluk kaynağı.
 *
 * 2026-08-14'te 25,3 saatlik sessiz bir sync kesintisi yaşandı: job'lar
 * console.log dışında hiçbir yere rapor vermediği için kimse haberdar olmadı,
 * oranlar donmuş halde bahis kabul edilmeye devam etti. Bu modül o boşluğu
 * kapatır: job'lar her turu buraya raporlar, eşik geçişlerinde alarm üretilir
 * ve oranlar bayatken bahis kabulü otomatik durur.
 *
 * Bellekte tutulur (tek systemd process). Restart'ta sıfırlanması doğrudur —
 * job'lar 60 sn içinde yeniden raporlar, o aralığı `warmup` korur.
 *
 * Tasarım: docs/superpowers/specs/2026-08-14-sync-health-monitoring-design.md
 */
import { errorLogger } from './errorLogger.js';

// Process açılışından sonra, henüz hiç başarı raporlanmamışken bahsi
// engellemediğimiz ve alarm üretmediğimiz pencere.
export const WARMUP_MS = 2 * 60 * 1000;

function envMs(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Feed başına eşikler. Uyarı her zaman bloktan ÖNCE gelir: para riske girmeden
 * haber alınsın, müdahale şansı olsun.
 */
export const FEED_THRESHOLDS = {
  // LiveSync 60 sn cadence ile çalışır — 3 tur kaçırmak anormaldir.
  live: {
    warnMs: envMs('SYNC_STALE_LIVE_WARN_MS', 3 * 60 * 1000),
    blockMs: envMs('SYNC_STALE_LIVE_BLOCK_MS', 5 * 60 * 1000),
  },
  // Oran yenileme 15 dk cadence ile çalışır — 2 tur kaçırmak anormaldir.
  upcomingOdds: {
    warnMs: envMs('SYNC_STALE_UPCOMINGODDS_WARN_MS', 30 * 60 * 1000),
    blockMs: envMs('SYNC_STALE_UPCOMINGODDS_BLOCK_MS', 45 * 60 * 1000),
  },
};

export const FEED_NAMES = Object.keys(FEED_THRESHOLDS);

/** Alarmı platformun mevcut errorLogger → Sentry/webhook/Telegram hattına verir. */
function defaultAlert(a) {
  if (a.state === 'recovered') {
    errorLogger.info('sync_health', `${a.feed} senkronizasyonu toparlandı`, a);
    return;
  }
  errorLogger.critical(
    'sync_health',
    `${a.feed} senkronizasyonu ${Math.round(a.staleSeconds / 60)} dakikadır güncellenmiyor` +
      (a.bettingBlocked ? ' — bahis kabulü durduruldu' : ''),
    a
  );
}

/**
 * İzole bir sağlık kaydı üretir. `now` ve `onAlert` enjekte edilebilir olduğu
 * için zaman mantığı gerçek saat ve gerçek webhook olmadan testlenebilir.
 */
export function createSyncHealth({ now = Date.now, onAlert = defaultAlert } = {}) {
  const startedAt = now();

  const feeds = new Map(
    FEED_NAMES.map(name => [name, {
      name,
      startedAt,
      lastSuccessAt: null,
      consecutiveFailures: 0,
      lastError: null,
      // Alarm yalnızca durum DEĞİŞTİĞİNDE üretilsin diye en son bildirilen
      // durumu tutuyoruz. Aksi halde 1483 ardışık hata 1483 mesaj demek olurdu.
      alertedState: 'ok',
    }])
  );

  /** Son başarıdan (hiç yoksa açılıştan) bu yana geçen süre. */
  function ageMs(f) {
    return now() - (f.lastSuccessAt ?? f.startedAt);
  }

  function stateOf(f) {
    if (!f.lastSuccessAt && now() - f.startedAt < WARMUP_MS) return 'warmup';
    return ageMs(f) >= FEED_THRESHOLDS[f.name].warnMs ? 'stale' : 'ok';
  }

  function blockedOf(f) {
    if (!f.lastSuccessAt && now() - f.startedAt < WARMUP_MS) return false;
    return ageMs(f) >= FEED_THRESHOLDS[f.name].blockMs;
  }

  function payload(f, state) {
    return {
      feed: f.name,
      state,
      staleSeconds: Math.round(ageMs(f) / 1000),
      consecutiveFailures: f.consecutiveFailures,
      lastError: f.lastError,
      bettingBlocked: blockedOf(f),
      base: lastBase,
    };
  }

  let lastBase = null;

  // /api/health/status public'e açık (bkz. app.js) — kaynağın gerçek
  // hostname'i (marka bilgisini taşıyan kısım) burada asla tutulmaz,
  // yalnızca mirror numarası saklanır.
  function maskBase(base) {
    return base?.match(/(\d+)\.com/)?.[1] ? `mirror ${base.match(/(\d+)\.com/)[1]}` : null;
  }

  /**
   * Durum geçişlerini kontrol eder ve yalnızca geçiş anında alarm üretir.
   * reportOk/reportFail bunu kendiliğinden çağırır; ayrıca job tamamen asılıp
   * hiç rapor vermediğinde de yakalanabilsin diye dışarıdan çağrılabilir.
   */
  function evaluate() {
    for (const f of feeds.values()) {
      const state = stateOf(f);
      if (state === 'warmup') continue;
      if (state === f.alertedState) continue;

      const isRecovery = f.alertedState === 'stale' && state === 'ok';
      f.alertedState = state;
      // Alarm gönderimi asla sync akışını bozmamalı.
      try {
        onAlert(payload(f, isRecovery ? 'recovered' : state));
      } catch { /* yut */ }
    }
  }

  function reportOk(feed, meta) {
    const f = feeds.get(feed);
    if (!f) return;
    if (meta?.base) lastBase = maskBase(meta.base);
    f.lastSuccessAt = now();
    f.consecutiveFailures = 0;
    f.lastError = null;
    evaluate();
  }

  function reportFail(feed, error, meta) {
    const f = feeds.get(feed);
    if (!f) return;
    if (meta?.base) lastBase = maskBase(meta.base);
    f.consecutiveFailures++;
    f.lastError = error?.message ? String(error.message) : String(error ?? 'bilinmeyen hata');
    evaluate();
  }

  function getFeedState(feed) {
    const f = feeds.get(feed);
    return f ? stateOf(f) : 'ok'; // bilinmeyen feed sistemi kilitlemesin
  }

  function isBettingBlocked(feed) {
    const f = feeds.get(feed);
    return f ? blockedOf(f) : false; // bilinmeyen feed bahsi engellemez
  }

  function snapshot() {
    const out = { domain: lastBase };
    for (const f of feeds.values()) {
      out[f.name] = {
        state: stateOf(f),
        staleSeconds: Math.round(ageMs(f) / 1000),
        bettingBlocked: blockedOf(f),
        consecutiveFailures: f.consecutiveFailures,
        lastError: f.lastError,
        lastSuccessAt: f.lastSuccessAt ? new Date(f.lastSuccessAt).toISOString() : null,
      };
    }
    return out;
  }

  let timer = null;
  /** Job'ın tamamen asılı kaldığı durumu da yakalamak için periyodik kontrol. */
  function startMonitor(intervalMs = 30 * 1000) {
    if (timer) return;
    timer = setInterval(evaluate, intervalMs);
    timer.unref?.();
  }

  return { reportOk, reportFail, getFeedState, isBettingBlocked, snapshot, evaluate, startMonitor };
}

/** Uygulama genelinde paylaşılan örnek. */
export const syncHealth = createSyncHealth();

export const reportOk = (feed, meta) => syncHealth.reportOk(feed, meta);
export const reportFail = (feed, error, meta) => syncHealth.reportFail(feed, error, meta);
export const isBettingBlocked = feed => syncHealth.isBettingBlocked(feed);
export const getFeedState = feed => syncHealth.getFeedState(feed);
export const snapshot = () => syncHealth.snapshot();
export const startMonitor = ms => syncHealth.startMonitor(ms);
