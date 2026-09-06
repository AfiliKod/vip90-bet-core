/**
 * Ana sayfa "sayfa ve blok düzenleyici" içerik modeli (A4).
 *
 * TALIMAT.md'nin önerdiği gibi burası yeni bir Mongoose şeması AÇMIYOR;
 * tek bir `Setting` satırında (`page.home`) JSON gövde tutuyor. theme/registry.js
 * ve modules/registry.js'teki atomik id→değer deseninden farklı olarak
 * (sectionOrder + banners) tek bir yapılı içerik dokümanı — çünkü bölüm
 * sırası ile banner listesi birlikte kaydedilip birlikte okunuyor.
 *
 * id listeleri client/src/pages/home/pageContent.js (DEFAULT_SECTION_ORDER)
 * ve HomePage.jsx'teki PROMO_SLIDES ile senkron tutulmalı — orası görsel/
 * render tarafının, burası doğrulamanın tek doğruluk kaynağı.
 */

export const HOME_SECTION_IDS = [
  'hero', 'quickNav', 'inhouseGames', 'sportsBets', 'liveBets', 'casinoGames', 'features', 'bottomCta',
];

// 'welcome'..'casino' — HomePage'in hero slider'ındaki 4 gezinme slaydı
// (önceden PromoHeroSlider.jsx içinde ayrı, override edilemeyen sabit bir
// dizi olan HERO_SLIDES) artık kampanya banner'larıyla (deneme-bonusu vb.)
// AYNI override sözleşmesine dahil — "Slider Düzenleme Aracı" (Pages.jsx)
// bu 7 slaydın tamamının başlık/açıklama/buton/GÖRSELİNİ düzenleyebilir.
export const HOME_BANNER_IDS = [
  'welcome', 'sports', 'live', 'casino',
  'deneme-bonusu', 'hosgeldin-bonusu', 'arkadasini-getir',
];

export const DEFAULT_HOME_CONTENT = { sectionOrder: [], banners: [] };

const TTL_MS = 30 * 1000;

export function createHomeContentStore({ load, now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;
  let hasLoaded = false;

  async function snapshot() {
    if (hasLoaded && now() - loadedAt < ttlMs) return cache;
    try {
      cache = await load();
    } catch {
      cache = null; // DB okunamıyor — varsayılan (sabit kodlanmış) sayfaya düş
    }
    hasLoaded = true;
    loadedAt = now();
    return cache;
  }

  return {
    /** Kaydedilmiş içeriği (varsa) döner; yoksa/bozuksa DEFAULT_HOME_CONTENT. */
    async get() {
      const raw = await snapshot();
      if (!raw) return DEFAULT_HOME_CONTENT;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return DEFAULT_HOME_CONTENT;
      }
      return {
        sectionOrder: Array.isArray(parsed?.sectionOrder) ? parsed.sectionOrder : [],
        banners: Array.isArray(parsed?.banners) ? parsed.banners : [],
      };
    },

    invalidate() {
      cache = null;
      hasLoaded = false;
      loadedAt = 0;
    },
  };
}
