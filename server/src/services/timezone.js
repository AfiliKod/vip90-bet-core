/**
 * U5 — Operatör saat dilimi tercihi.
 *
 * settings.js'in (DB-önce, TTL cache) deseni; yeni şema açılmaz, var olan
 * Setting koleksiyonu kullanılır. Sunucu tarihleri UTC saklar — bu değer
 * istemciye bildirilir ve render anında Intl.DateTimeFormat timeZone
 * parametresiyle uygulanır.
 *
 * load/save enjekte edilebilir: DB'siz test edilebilir (settings.js ile aynı).
 */

const TTL_MS = 30 * 1000;

export const TIMEZONE_KEY = 'general.timezone';
export const DEFAULT_TIMEZONE = 'Europe/Istanbul';

/** IANA bölgesi geçerlilik kontrolü — Node'un ICU verisiyle. */
export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {object} backend
 * @param {(key: string) => Promise<string|null>} backend.loadSetting
 * @param {(key: string, value: string, updatedBy?: string) => Promise<unknown>} backend.saveSetting
 */
export function createTimezoneStore(backend, { now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function snapshot() {
    if (cache !== null && now() - loadedAt < ttlMs) return cache;
    try {
      cache = (await backend.loadSetting(TIMEZONE_KEY)) || DEFAULT_TIMEZONE;
    } catch {
      cache = DEFAULT_TIMEZONE; // fail-safe: okunamıyorsa varsayılanla devam
    }
    loadedAt = now();
    return cache;
  }

  return {
    async get() {
      return snapshot();
    },

    async set(value, updatedBy) {
      if (!isValidTimezone(value)) {
        const err = new Error(`[VALIDATION] Geçersiz IANA saat dilimi: ${value}`);
        err.code = 'VALIDATION';
        throw err;
      }
      await backend.saveSetting(TIMEZONE_KEY, value, updatedBy);
      cache = null; // sonraki get taze değeri okusun
      loadedAt = 0;
      return value;
    },
  };
}
