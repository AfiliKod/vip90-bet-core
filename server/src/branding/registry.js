/**
 * Marka kimliği alan tanımları (A3).
 *
 * Logo, favicon, site adı ve özel font dosyası — hepsi admin panelinden
 * (SSH/FTP olmadan) değiştirilebilir. Aynı DI deseni `theme/registry.js`
 * ve `modules/registry.js`'ten alınmıştır: `load` DB'ye dokunur ve dışarıdan
 * enjekte edilir, kısa TTL cache ile.
 *
 * Dosya alanları (logo/favicon/fontFile) `data:` URL olarak saklanır —
 * sunucu dosya sistemine hiçbir şey yazılmaz, mevcut `Setting`
 * koleksiyonundaki bir metin alanına sığar. `maxBytes`, decode edilmiş
 * (gerçek) dosya boyutu üst sınırıdır; doğrulama `validators/admin.js`'te
 * yapılır.
 */

export const BRANDING_FIELD_DEFINITIONS = [
  { id: 'siteName',   label: 'Site Adı',              type: 'text',  default: null, maxLength: 60 },
  { id: 'logo',       label: 'Logo',                  type: 'image', default: null, maxBytes: 200_000 },
  { id: 'favicon',    label: 'Favicon',                type: 'image', default: null, maxBytes: 100_000 },
  { id: 'fontFamily', label: 'Yazı Tipi Ailesi (CSS)', type: 'text',  default: null, maxLength: 100 },
  { id: 'fontFile',   label: 'Özel Font Dosyası',      type: 'font',  default: null, maxBytes: 400_000 },
];

const TTL_MS = 30 * 1000;

export function createBrandingStore({ load, now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function snapshot() {
    if (cache && now() - loadedAt < ttlMs) return cache;
    try {
      cache = await load();
    } catch {
      cache = {}; // DB okunamıyor — markalama olmadan varsayılan görünümle ayakta kal
    }
    loadedAt = now();
    return cache;
  }

  return {
    /** id → değer haritası (override yoksa null). */
    async getValues() {
      const overrides = await snapshot();
      const values = {};
      for (const def of BRANDING_FIELD_DEFINITIONS) {
        values[def.id] = overrides[def.id] ?? def.default;
      }
      return values;
    },

    /** Tek doğruluk kaynağı: tüm tanımlar + güncel değer + kaynağı (db/default). */
    async list() {
      const overrides = await snapshot();
      return BRANDING_FIELD_DEFINITIONS.map(def => ({
        ...def,
        value: overrides[def.id] ?? def.default,
        source: overrides[def.id] !== undefined ? 'db' : 'default',
      }));
    },

    invalidate() {
      cache = null;
      loadedAt = 0;
    },
  };
}
