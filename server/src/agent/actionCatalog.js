/**
 * Merkezi Action-ID kataloğu (D7 — risk sınıflaması).
 *
 * D6'daki `agent/registry.js` LOKAL ajanın çalıştırma tarafıdır (customer
 * makinesinde: "bu id kayıtlı mı, handler'ı ne"). Bu dosya MERKEZ tarafıdır:
 * destek iş istasyonundaki dispatch/onay akışının "bu eylem yıkıcı mı,
 * temsilci onayı gerekiyor mu" sorusuna cevap verir. İki taraf da aynı
 * actionId string'lerini paylaşır ama farklı amaçlara hizmet eder — yeni
 * bir eylem eklerken HER İKİ tarafa da (bu katalog + müşteri kurulumundaki
 * lokal registry) eklenmesi gerektiği unutulmamalı.
 *
 * Bilinmeyen bir actionId için risk sorgusu SESSİZCE "safe" varsaymaz,
 * hata fırlatır — fail-closed.
 */

export const RISK_LEVELS = { SAFE: 'safe', DESTRUCTIVE: 'destructive' };

export const ACTION_CATALOG = [
  { id: 'REINDEX_DB', risk: RISK_LEVELS.SAFE, description: 'Belirtilen tabloyu yeniden indeksler.' },
  { id: 'CLEAR_CACHE', risk: RISK_LEVELS.SAFE, description: 'Uygulama önbelleğini temizler.' },
  { id: 'HEALTH_CHECK', risk: RISK_LEVELS.SAFE, description: 'Sistem sağlık durumunu raporlar.' },
  { id: 'RESTART_SERVICE', risk: RISK_LEVELS.DESTRUCTIVE, description: 'Uygulama servisini yeniden başlatır — kısa kesinti.' },
  { id: 'RUN_MIGRATION', risk: RISK_LEVELS.DESTRUCTIVE, description: 'Veritabanı şema göçünü uygular.' },
  { id: 'RESET_USER_PASSWORD', risk: RISK_LEVELS.DESTRUCTIVE, description: 'Bir kullanıcının şifresini sıfırlar.' },
  { id: 'APPLY_UPDATE', risk: RISK_LEVELS.DESTRUCTIVE, description: 'İmzalı bir sürüm güncellemesini uygular (D9).' },
];

function findEntry(actionId) {
  const entry = ACTION_CATALOG.find(a => a.id === actionId);
  if (!entry) throw new Error(`Eylem "${actionId}" katalogda kayıtlı değil`);
  return entry;
}

export function getActionRisk(actionId) {
  return findEntry(actionId).risk;
}

export function isDestructive(actionId) {
  return getActionRisk(actionId) === RISK_LEVELS.DESTRUCTIVE;
}
