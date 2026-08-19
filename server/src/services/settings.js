/**
 * Çalışma anı ayarları — DB önce, `.env` yedek.
 *
 * Alarm kanalları eskiden yalnızca `process.env`'den okunuyordu; sunucuya SSH
 * erişimi olmadan konfigüre edilemiyor, bu yüzden de prod'da boş kalmıştı.
 * Burası admin panelinden yönetilen değerleri öne alır, env'i yedekte tutar:
 * DB erişilemese bile alarm hattı env ile ayakta kalır.
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';

/** Admin panelinden yönetilen anahtarlar. Panel yalnızca bunları yazabilir. */
export const ALERT_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'ALERT_WEBHOOK_URL',
  'ALERT_EMAIL_TO',
];

/** Panelde açık gösterilmeyen anahtarlar. */
export const SECRET_KEYS = new Set(['TELEGRAM_BOT_TOKEN', 'ALERT_WEBHOOK_URL']);

const TTL_MS = 30 * 1000;

/** Secret'ı panelde gösterilebilir hale getirir: `8412…9f3a`. */
export function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * İzole bir ayar deposu üretir. `load`, `env` ve `now` enjekte edilebilir olduğu
 * için depo DB'siz test edilebilir.
 */
export function createSettingsStore({ load, env = process.env, now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function snapshot() {
    if (cache && now() - loadedAt < ttlMs) return cache;
    try {
      cache = await load();
    } catch {
      // DB okunamıyor — env yedeğiyle devam et, alarm hattı ayakta kalsın.
      cache = {};
    }
    loadedAt = now();
    return cache;
  }

  return {
    /** DB değeri varsa onu, yoksa env'i, o da yoksa null döner. */
    async get(key) {
      const fromDb = (await snapshot())[key];
      if (fromDb) return fromDb;
      return env[key] || null;
    },
    /** Hangi kaynaktan geldiğini söyler — panelde rozet olarak gösterilir. */
    async sourceOf(key) {
      if ((await snapshot())[key]) return 'db';
      if (env[key]) return 'env';
      return 'unset';
    },
    invalidate() {
      cache = null;
      loadedAt = 0;
    },
  };
}

/** Uygulama genelinde kullanılan tekil depo. */
export const settings = createSettingsStore({
  load: async () => {
    // DB bağlı değilse mongoose sorguyu 10 sn buffer'da tutar; alarm o kadar
    // gecikmesin diye doğrudan env yedeğine düşülür.
    if (mongoose.connection.readyState !== 1) return {};
    const rows = await Setting.find({ key: { $in: ALERT_KEYS } }).lean();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },
});

export const getSetting = key => settings.get(key);
export const getSettingSource = key => settings.sourceOf(key);
export const invalidateSettings = () => settings.invalidate();
