/**
 * SEO ayar deposu — `Setting` koleksiyonunda tek bir JSON kaydı (`seo.config`),
 * kısa TTL cache + kayıtta geçersiz kılma (branding/index.js ile aynı DI deseni).
 *
 * `isConfigured()` = hiç kayıt yok → DB SEO alanı yoktur; SPA fallback yine de
 * kiracı markası etiketlerini enjekte eder (marka, SEO ayarına bağlı değildir).
 */
import { SEO_DEFAULTS, sanitizeStored } from './schema.js';
import { mongoLoad } from '../config/secretSettingsStore.js';
import { saveScopedSetting, createTenantStoreFacade } from '../services/settings.js';

export const SEO_DB_KEY = 'seo.config';
const TTL_MS = 30 * 1000;

export function createSeoStore({ load, save, now = Date.now, ttlMs = TTL_MS } = {}) {
  let cache = null;
  let loadedAt = 0;

  async function snapshot() {
    if (cache && now() - loadedAt < ttlMs) return cache;
    let raw = null;
    try { raw = await load(); } catch { /* DB yok → ayarsız davranış */ }
    cache = { configured: raw != null, values: sanitizeStored(raw) };
    loadedAt = now();
    return cache;
  }

  return {
    async get() { return { ...(await snapshot()).values }; },
    async isConfigured() { return (await snapshot()).configured; },
    /** Kısmi güncelleme: yalnızca gelen alanlar değişir. */
    async update(patch, updatedBy) {
      const current = (await snapshot()).values;
      const next = sanitizeStored({ ...current, ...patch });
      await save(next, updatedBy);
      cache = null;
      loadedAt = 0;
      return next;
    },
    invalidate() { cache = null; loadedAt = 0; },
  };
}

// Tenant-keyed instances (İP-4 Task 4): the factory cache is per instance.
const stores = createTenantStoreFacade(({ tenantId, brandId }) => createSeoStore({
  load: async () => {
    const value = (await mongoLoad([SEO_DB_KEY], { tenantId, brandId }))[SEO_DB_KEY];
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
  },
  save: async (values, updatedBy) => {
    await saveScopedSetting(SEO_DB_KEY, JSON.stringify(values), updatedBy);
  },
}));

export const seoStore = {
  get: () => stores.current().get(),
  isConfigured: () => stores.current().isConfigured(),
  update: (patch, updatedBy) => stores.current().update(patch, updatedBy),
  invalidate: () => stores.invalidateAll(),
};

export { SEO_DEFAULTS };
