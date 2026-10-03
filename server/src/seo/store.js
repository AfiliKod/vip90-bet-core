/**
 * SEO ayar deposu — `Setting` koleksiyonunda tek bir JSON kaydı (`seo.config`),
 * kısa TTL cache + kayıtta geçersiz kılma (branding/index.js ile aynı DI deseni).
 *
 * `isConfigured()` = hiç kayıt yok → enjeksiyon yapılmaz, index.html olduğu gibi
 * servis edilir (mevcut davranış korunur).
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { SEO_DEFAULTS, sanitizeStored } from './schema.js';

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

export const seoStore = createSeoStore({
  load: async () => {
    if (mongoose.connection.readyState !== 1) return null;
    const row = await Setting.findOne({ key: SEO_DB_KEY }).lean();
    if (!row?.value) return null;
    try { return JSON.parse(row.value); } catch { return null; }
  },
  save: async (values, updatedBy) => {
    await Setting.updateOne(
      { key: SEO_DB_KEY },
      { $set: { value: JSON.stringify(values), ...(updatedBy ? { updatedBy } : {}) } },
      { upsert: true },
    );
  },
});

export { SEO_DEFAULTS };
