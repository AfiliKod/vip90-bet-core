/**
 * 0001 — Baseline. Mevcut şema durumunun başlangıç noktası olarak işaretlenmesi.
 *
 * Veri dokunmaz: bu migration'ın tek işi, koşucunun "buradan sonrası
 * migration'lı" kaydını tutmasıdır (K3 tohumlaması öncesi kurulan sistemler
 * de bu kayıtla idempotent şekilde hizalanır).
 */
export default {
  version: '0.1.0',
  description: 'Baseline — mevcut şema durumu işaretlenir, veri değişmez',
  async up() {
    // no-op — kasıtlı
  },
};
