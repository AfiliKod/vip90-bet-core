/**
 * Abonelik/lisans doğrulama servisi çekirdeği (M2).
 *
 * modules/registry.js'teki DI desenini (load/now/ttlMs, TTL cache) kullanır
 * AMA fail yönü BİLİNÇLİ OLARAK FARKLIDIR:
 *
 *   modules  → fail-CLOSED: DB okunamazsa her modül kapalı sayılır. Bir ödeme
 *              modülünün ölçülemez şekilde açık kalması daha büyük hatadır.
 *   licensing→ fail-TOLERANT: merkez sunucu/LISANS sunucusu geçici olarak
 *              erişilemezse SON BİLİNEN GEÇERLİ durum graceMs kadar korunur.
 *              Geçici bir ağ kesintisi operatörün tüm modüllerini kapatamaz.
 *
 * İki sabit kural iki yönde de geçerlidir:
 *   1. Lisans expiresAt zamanı geçtiyse modül KAPANIR — bu karşılaştırma
 *      yereldir, ağ gerekmez (çevrimdışiyken bile süre dolunca kapanır).
 *   2. Hiç bilinen geçerli durum yokken merkez erişilemezse kapalıdır
 *      (fail-closed; asla doğrulanmamış lisansla açılmaz).
 */

export function createLicenseStore({
  fetchLicenseState,
  now = Date.now,
  ttlMs = 30 * 1000,
  graceMs = 72 * 60 * 60 * 1000, // son doğrulamadan bu kadar süre tolerans tanınır
  moduleIds = [],
}) {
  let cache = null;      // son bilinen durum haritası { [id]: {valid, expiresAt} }
  let loadedAt = 0;      // son denemenin (başarılı ya da başarısız) zamanı
  let lastOkAt = 0;      // son BAŞARILI fetch zamanı — grace bunun üzerinden ölçülür
  let degraded = false;  // merkez erişilemiyor, önbellekteki veriyle yaşlıyoruz
  const knownIds = new Set(moduleIds);

  async function snapshot() {
    if (cache !== null && now() - loadedAt < ttlMs) {
      return { state: cache, degraded };
    }
    try {
      cache = await fetchLicenseState();
      lastOkAt = now();
      degraded = false;
      for (const id of Object.keys(cache)) knownIds.add(id);
    } catch {
      const withinGrace = cache !== null && now() - lastOkAt < graceMs;
      if (withinGrace) {
        degraded = true; // son bilinen geçerli durumu koru — site çalışmaya devam eder
      } else {
        cache = {};      // ne bilinen durum var ne tolerans — güvenli kapanış
        degraded = true;
      }
    }
    loadedAt = now();
    return { state: cache || {}, degraded };
  }

  function entryLicensed(entry, t) {
    if (!entry || entry.valid !== true) return false;
    if (entry.expiresAt != null && t >= entry.expiresAt) return false;
    return true;
  }

  return {
    async isLicensed(moduleId) {
      const { state } = await snapshot();
      return entryLicensed(state[moduleId], now());
    },

    /**
     * Bilinen tüm modüller için {id, licensed, source, expiresAt}.
     * source: 'live' (merkezden taze) | 'cached' (grace içindeki son bilinen)
     *       | 'closed' (veri yok/tolerans doldu — modüller kapalı sayılır).
     */
    async list() {
      const { state, degraded: deg } = await snapshot();
      const ids = new Set([...knownIds, ...Object.keys(state)]);
      const t = now();
      return [...ids].map(id => {
        const entry = state[id];
        const licensed = entryLicensed(entry, t);
        let source;
        if (!deg) source = 'live';
        else if (Object.keys(state).length > 0) source = 'cached';
        else source = 'closed';
        return { id, licensed, source, expiresAt: entry?.expiresAt ?? null };
      });
    },

    invalidate() {
      cache = null;
      loadedAt = 0;
    },
  };
}
