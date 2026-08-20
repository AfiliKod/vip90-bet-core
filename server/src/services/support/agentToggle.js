/**
 * Bakım ajanının açık/kapalı durumu (D6 — "ifşalı ve panelden kapatılabilir").
 *
 * Varsayılan KAPALI: operatör açıkça açmadan ajan hiçbir pull isteği
 * göndermez. modules/registry.js ve theme/registry.js ile aynı DI deseni.
 */

const TTL_MS = 30 * 1000;

export function createAgentToggleStore({ load, now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function snapshot() {
    if (cache && now() - loadedAt < ttlMs) return cache;
    try {
      cache = await load();
    } catch {
      cache = {}; // fail-closed: DB okunamazsa ajan kapalı sayılır
    }
    loadedAt = now();
    return cache;
  }

  return {
    async isEnabled() {
      const state = await snapshot();
      return state.enabled === true;
    },
    invalidate() {
      cache = null;
      loadedAt = 0;
    },
  };
}
