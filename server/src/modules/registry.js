/**
 * Modül kayıt defteri (M1 — Faz 0 sözleşmesi).
 *
 * Çekirdek platform (13 in-house oyun, admin, bahis kuponu, bonus motoru)
 * her zaman açıktır ve bir modül DEĞİLDİR. Ayrı satılan/lisanslanan üç
 * modül burada tanımlıdır; M2 (abonelik doğrulama) ve M3 (admin ekranı)
 * bu tek doğruluk kaynağının üzerine inşa edilir.
 *
 * Aynı DI deseni `services/settings.js`'ten alınmıştır: `load` DB'ye
 * dokunur ve dışarıdan enjekte edilir, kısa TTL cache ile.
 *
 * Fail-closed: DB okunamazsa tüm modüller kapalı sayılır. Bir ödeme/bahis
 * modülünün ölçülemez şekilde açık kalması, yanlışlıkla kapalı görünmesinden
 * daha kötü bir hatadır.
 */

export const MODULE_DEFINITIONS = [
  { id: 'betting', title: 'Spor ve Canlı Bahis', description: 'Odds akışı, kupon, sonuçlandırma.' },
  { id: 'casino-content', title: 'Casino İçeriği', description: 'Slot ve masa oyunları, aggregator üzerinden.' },
  { id: 'live-casino', title: 'Canlı Casino', description: 'Gerçek krupiyeli masa ve video oyunları.' },
];

const TTL_MS = 30 * 1000;

export function createModuleStore({ load, now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function snapshot() {
    if (cache && now() - loadedAt < ttlMs) return cache;
    try {
      cache = await load();
    } catch {
      cache = {}; // fail-closed: bilinmeyen durumda hiçbir modül açık sayılmaz
    }
    loadedAt = now();
    return cache;
  }

  return {
    /** Modül tanımsızsa ya da DB'de kaydı yoksa false döner (throw etmez). */
    async isEnabled(moduleId) {
      const flags = await snapshot();
      return flags[moduleId] === true;
    },

    /** Tek doğruluk kaynağı: tüm tanımlar + güncel açık/kapalı durumu. */
    async list() {
      const flags = await snapshot();
      return MODULE_DEFINITIONS.map(def => ({ ...def, enabled: flags[def.id] === true }));
    },

    invalidate() {
      cache = null;
      loadedAt = 0;
    },
  };
}
