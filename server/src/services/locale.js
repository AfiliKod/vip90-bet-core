/**
 * Sitenin varsayılan frontend dili — admin panelden ("Bölge/Para Birimi"
 * kartındaki, timezone ile aynı "sistem ayarı" mantığı) ayarlanır.
 *
 * Daha önce `client/src/i18n/index.js`'te `DEFAULT_LOCALE='tr'` sabit kodluydu
 * (2026-09-10 öncesi) — artık admin bunu değiştirebilir, `GET /api/locale-config`
 * (herkese açık, auth'suz) üzerinden client bootstrap'ına iletilir. Kullanıcının
 * kendi seçtiği dil (navbar `LanguageSwitcher`, localStorage) HER ZAMAN bu
 * varsayılanı ezer — bu sadece localStorage boşken (ilk ziyaret) kullanılır.
 *
 * timezone.js ile AYNI desen (DB-önce, TTL cache, load/save enjekte edilebilir).
 */

const TTL_MS = 30 * 1000;

export const LOCALE_KEY = 'general.defaultLocale';
export const DEFAULT_LOCALE = 'tr';

// client/src/i18n/index.js'teki `dictionaries` ile AYNI liste — ayrı bir
// paylaşılan pakete çıkarmak bu kapsam için aşırı mühendislik olur, ikisi de
// yeni bir dil eklenince elle güncellenmeli (nadiren değişir).
export const SUPPORTED_LOCALES = ['tr', 'en', 'ko', 'th', 'es', 'ja', 'pt', 'de'];

export function isValidLocale(locale) {
  return SUPPORTED_LOCALES.includes(locale);
}

/**
 * @param {object} backend
 * @param {(key: string) => Promise<string|null>} backend.loadSetting
 * @param {(key: string, value: string, updatedBy?: string) => Promise<unknown>} backend.saveSetting
 */
export function createLocaleStore(backend, { now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function snapshot() {
    if (cache !== null && now() - loadedAt < ttlMs) return cache;
    try {
      cache = (await backend.loadSetting(LOCALE_KEY)) || DEFAULT_LOCALE;
    } catch {
      cache = DEFAULT_LOCALE; // fail-safe: okunamıyorsa varsayılanla devam
    }
    loadedAt = now();
    return cache;
  }

  return {
    async get() {
      return snapshot();
    },

    async set(value, updatedBy) {
      if (!isValidLocale(value)) {
        const err = new Error(`[VALIDATION] Desteklenmeyen dil: ${value}`);
        err.code = 'VALIDATION';
        err.status = 400;
        throw err;
      }
      await backend.saveSetting(LOCALE_KEY, value, updatedBy);
      cache = null;
      loadedAt = 0;
      return value;
    },
  };
}
