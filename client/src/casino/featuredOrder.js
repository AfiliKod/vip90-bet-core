/**
 * Oyun vitrini sıralama saf mantığı (A5).
 *
 * CasinoRedesign.jsx'in 'popular' kategorisi zaten aynı deseni (bir kod
 * dizisine göre filtrele + sırala) satır içi olarak kullanıyordu; A5
 * bunu admin panelinden yönetilen bir 'featured' kategorisi için de
 * kullanmak üzere paylaşılan, test edilebilir bir fonksiyona çıkarır.
 */
export function filterAndOrderByCodes(games, codes) {
  if (!Array.isArray(codes) || !codes.length) return [];
  const order = new Map(codes.map((c, i) => [c, i]));
  return games.filter(g => order.has(g.game_code)).sort((a, b) => order.get(a.game_code) - order.get(b.game_code));
}
