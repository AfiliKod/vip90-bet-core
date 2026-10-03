/**
 * Modül kayıt defteri (M1 — Faz 0 sözleşmesi).
 *
 * Çekirdek platform (admin, bahis kuponu, bonus motoru) her zaman açıktır ve
 * bir modül DEĞİLDİR. Ayrı satılan/lisanslanan modüller burada tanımlıdır;
 * M2 (abonelik doğrulama) ve M3 (admin ekranı) bu tek doğruluk kaynağının
 * üzerine inşa edilir.
 *
 * 2026-09-10: `inhouse-games` de bu listeye eklendi. Önceki yorum "13 in-house
 * oyun çekirdek platform, asla gate'lenmez" diyordu — bu, `server/src/provider/`
 * mimarisi (in-house oyunları Igames ile AYNI çok-kiracılı provider desenine
 * — API key + JWT launch/session + HMAC callback — sokan mimari) henüz yokken
 * alınmış geçici bir karardı. In-house oyunlar artık `casino-content` ile
 * birebir aynı ilişkide (ayrı bir "sağlayıcı" olarak operatöre bağlanıyor,
 * "Operatör #1" ifadesi başka operatörlerin de bağlanabileceğini varsayıyor)
 * — tutarlılık için o da lisanslanabilir/aç-kapa bir modül oldu. Hırsızlığa
 * karşı koruma (JWT+origin kilidi, `server/src/provider/routes/launch.js`)
 * bu gate'ten TAMAMEN bağımsız, ayrı bir katman — ikisi çelişmiyor.
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
  { id: 'inhouse-games', title: 'In-house Oyunlar', description: 'Özel geliştirilmiş casino oyunları (Crash, Mines, Roulette vb.), ayrı bir oyun sunucusundan servis edilir.' },
  { id: 'crypto-payment', title: 'Crypto Ödeme Ağ Geçidi', description: 'TRC20 USDT ile para yatırma ve çekme.' },
  // licenseExempt: operatörün kendi ödeme yöntemi, satılan eklenti değil —
  // yalnız admin anahtarıyla açılıp kapanır. Lisans sunucusu bu modülü
  // listelemese bile kapanmaz (aksi halde canlıda ödemeler dururdu).
  { id: 'slikair-payment', title: 'Slikair Ödeme Ağ Geçidi', description: 'Kart ve alternatif ödeme yöntemleriyle para yatırma (Slikair).', licenseExempt: true },
  { id: 'kyc-verification', title: 'KYC Kimlik Doğrulama', description: 'Manuel belge inceleme veya Sumsub ile otomatik doğrulama.' },
  { id: 'sms-gateway', title: 'SMS Gateway', description: 'Twilio üzerinden sistem ve kampanya SMS mesajları gönderimi.' },
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
