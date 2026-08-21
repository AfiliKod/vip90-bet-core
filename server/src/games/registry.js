/**
 * Oyun vitrini — "öne çıkan" oyunlar listesi (A5).
 *
 * Kategori (all/popular/new/slots/inhouse) zaten CasinoRedesign.jsx'te
 * sabit kodlu var; burada eklenen tek şey admin panelinden yönetilen,
 * sırası önemli bir "featured" oyun kodu listesi. theme/registry.js ve
 * pages/registry.js'teki aynı DI deseni — tek fark burada içerik tek bir
 * JSON dizi (id→değer haritası değil).
 */

export const DEFAULT_FEATURED_GAMES = [];

const TTL_MS = 30 * 1000;

export function createFeaturedGamesStore({ load, now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;
  let hasLoaded = false;

  async function snapshot() {
    if (hasLoaded && now() - loadedAt < ttlMs) return cache;
    try {
      cache = await load();
    } catch {
      cache = null; // DB okunamıyor — vitrin curation'sız (boş) devam eder
    }
    hasLoaded = true;
    loadedAt = now();
    return cache;
  }

  return {
    /** Kaydedilmiş kod listesini döner; yoksa/bozuksa DEFAULT_FEATURED_GAMES ([]) . */
    async get() {
      const raw = await snapshot();
      if (!raw) return DEFAULT_FEATURED_GAMES;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return DEFAULT_FEATURED_GAMES;
      }
      if (!Array.isArray(parsed)) return DEFAULT_FEATURED_GAMES;
      return parsed.filter(x => typeof x === 'string');
    },

    invalidate() {
      cache = null;
      hasLoaded = false;
      loadedAt = 0;
    },
  };
}
