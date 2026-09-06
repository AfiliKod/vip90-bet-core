/**
 * Ana sayfa "sayfa ve blok düzenleyici" saf mantığı (A4).
 *
 * HomePage.jsx sabit sırayla 7 bölüm render eder (hero, quickNav,
 * inhouseGames, sportsBets, liveBets, features, bottomCta).
 * Admin panelinden bu sıra değiştirilebilir/bölümler gizlenebilir, kampanya
 * banner'ları (PROMO_SLIDES) yeniden sıralanabilir/metni değiştirilebilir.
 *
 * Sunucu tek bir Setting satırında (`page.home`, JSON) { sectionOrder,
 * banners } tutar — override yoksa (boş/eksik) burada tanımlı varsayılanlara
 * düşülür, sayfa hiçbir zaman bozuk/boş görünmez.
 */

export const DEFAULT_SECTION_ORDER = [
  'hero', 'quickNav', 'inhouseGames', 'sportsBets', 'liveBets', 'features', 'bottomCta',
];

export const SECTION_LABELS = {
  hero: 'Hero Slider',
  quickNav: 'Hızlı Gezinme Kartları',
  inhouseGames: 'Özel Oyunlar',
  sportsBets: 'Spor Bahisleri',
  liveBets: 'Canlı Bahis',
  features: 'Neden Biz?',
  bottomCta: 'Alt Çağrı Bandı',
};

/**
 * Sunucudan gelen (veya eksik/geçersiz) sectionOrder'ı güvenli bir diziye
 * çevirir: tanınmayan id'ler elenir, hiçbir geçerli id kalmazsa (ör. hiç
 * override yoksa) varsayılan tam sıraya düşülür. Sayfa asla boş kalmaz.
 */
export function resolveSectionOrder(order) {
  if (!Array.isArray(order)) return DEFAULT_SECTION_ORDER;
  const valid = order.filter(id => DEFAULT_SECTION_ORDER.includes(id));
  return valid.length ? valid : DEFAULT_SECTION_ORDER;
}

/**
 * `baseBanners` (koddaki PROMO_SLIDES — görsel/gradient/accent'in tek
 * doğruluk kaynağı) ile admin'in sıralama+metin override'larını birleştirir.
 * Override yoksa ya da hiç tanınan id kalmazsa baseBanners'ın tamamı,
 * orijinal sırasıyla döner.
 */
export function resolveBanners(baseBanners, overrides) {
  if (!Array.isArray(overrides) || !overrides.length) return baseBanners;
  const baseById = Object.fromEntries(baseBanners.map(b => [b.id, b]));
  const out = [];
  for (const o of overrides) {
    const base = baseById[o.id];
    if (!base) continue; // bilinmeyen/silinmiş banner id'si sessizce atlanır
    out.push({
      ...base,
      title: o.title?.trim() || base.title,
      desc: o.desc?.trim() || base.desc,
      cta: o.cta?.trim() || base.cta,
      image: o.image?.trim() || base.image,
    });
  }
  return out.length ? out : baseBanners;
}
