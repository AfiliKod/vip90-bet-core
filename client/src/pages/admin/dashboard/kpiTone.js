// client/src/pages/admin/dashboard/kpiTone.js
//
// Admin Dashboard ilk 5 kartının rengi ve filigran ikonu, kartta GÖSTERİLEN
// SAYININ İŞARETİNE göre belirlenir (docs/admin-redesign/README.md §F1).
//
// KURAL — sayı, renk ve ok birbirini ASLA çeliştirmez:
//   "+" ile başlayan sayı → yeşil  arka plan + yukarı ok  (kazanç / yükseliş)
//   "−" ile başlayan sayı → kırmızı arka plan + aşağı ok   (zarar / düşüş)
//   0 / sayı yok           → nötr    arka plan + metrik ikonu
//
// Renk sabittir: yönetici seçimi yok, yalnızca kartın içeriği belirler.

/** `up` = "+" (kazanç, yeşil), `down` = "−" (zarar, kırmızı). */
export const KPI_TONE_COLORS = {
  up: '#10b981',
  down: '#ef4444',
  neutral: null,
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** #abc / #aabbcc → "r g b"; geçersizse null. */
export function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const int = parseInt(h, 16);
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

/**
 * Ham sayı → yön tonu. KURAL: işaret doğrudan rengi ve oku belirler.
 * 0 ve sayı olmayan değerler nötr (yön yokken yön uydurmak yanıltıcı).
 */
export function kpiTone(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 'neutral';
  return n > 0 ? 'up' : 'down';
}

/** Değişim yüzdesi → yön tonu. Kartla aynı kural, çelişemez. */
export function deltaTone(deltaPct) {
  return kpiTone(deltaPct);
}
