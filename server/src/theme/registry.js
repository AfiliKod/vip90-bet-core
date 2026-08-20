/**
 * Tema token sistemi (A1 — Faz 0 sözleşmesi).
 *
 * Renk/tipografi/köşe/gölge değerlerinin tek doğruluk kaynağı. Değerler CSS
 * custom property adına (`cssVar`) eşlenir; istemci bunları runtime'da
 * `document.documentElement.style.setProperty()` ile enjekte eder — panelden
 * bir değer değişince yeniden build gerekmeden tüm arayüze yansır.
 *
 * Varsayılan değerler mevcut tasarımın gerçek renkleridir (tailwind.config.js,
 * index.css) — override yoksa görsel hiçbir şey değişmez.
 *
 * Aynı DI deseni `services/settings.js` ve `modules/registry.js`'ten alınmıştır.
 */

export const THEME_TOKEN_DEFINITIONS = [
  { id: 'primary', cssVar: '--color-primary', default: '#00d4ff', type: 'color' },
  { id: 'primaryDark', cssVar: '--color-primary-dark', default: '#00aed4', type: 'color' },
  { id: 'accent', cssVar: '--color-accent', default: '#7c3aed', type: 'color' },
  { id: 'radiusMd', cssVar: '--radius-md', default: '0.75rem', type: 'radius' },
  { id: 'fontDisplay', cssVar: '--font-display', default: 'system-ui, -apple-system, sans-serif', type: 'font' },
];

const TTL_MS = 30 * 1000;

export function createThemeStore({ load, now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function snapshot() {
    if (cache && now() - loadedAt < ttlMs) return cache;
    try {
      cache = await load();
    } catch {
      cache = {}; // DB okunamıyor — tasarımın varsayılan haliyle ayakta kal
    }
    loadedAt = now();
    return cache;
  }

  return {
    /** cssVar → değer haritası; istemcinin doğrudan enjekte edeceği şekil. */
    async getCssVars() {
      const overrides = await snapshot();
      const vars = {};
      for (const def of THEME_TOKEN_DEFINITIONS) {
        vars[def.cssVar] = overrides[def.id] ?? def.default;
      }
      return vars;
    },

    /** Tek doğruluk kaynağı: tüm tanımlar + güncel değer + kaynağı (db/default). */
    async list() {
      const overrides = await snapshot();
      return THEME_TOKEN_DEFINITIONS.map(def => ({
        ...def,
        value: overrides[def.id] ?? def.default,
        source: overrides[def.id] !== undefined ? 'db' : 'default',
      }));
    },

    invalidate() {
      cache = null;
      loadedAt = 0;
    },
  };
}
