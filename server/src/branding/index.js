/**
 * Marka kimliği alanlarının üretim bağlantısı (A3).
 *
 * DB anahtarı biçimi: `branding.<id>` — mevcut Setting koleksiyonunu kullanır,
 * theme/index.js ve modules/index.js'teki aynı yaklaşım.
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { createBrandingStore, BRANDING_FIELD_DEFINITIONS } from './registry.js';

const KEY_PREFIX = 'branding.';
const dbKey = id => `${KEY_PREFIX}${id}`;

export const brandingStore = createBrandingStore({
  load: async () => {
    if (mongoose.connection.readyState !== 1) return {};
    const keys = BRANDING_FIELD_DEFINITIONS.map(f => dbKey(f.id));
    const rows = await Setting.find({ key: { $in: keys } }).lean();
    const overrides = {};
    for (const r of rows) overrides[r.key.slice(KEY_PREFIX.length)] = r.value;
    return overrides;
  },
});

export const getBrandingValues = () => brandingStore.getValues();
export const listBranding = () => brandingStore.list();
export const invalidateBranding = () => brandingStore.invalidate();

/** Admin panelinden bir marka alanını değiştirir. */
export async function setBrandingField(id, value, updatedBy) {
  if (!BRANDING_FIELD_DEFINITIONS.some(f => f.id === id)) {
    throw new Error(`Bilinmeyen marka alanı: ${id}`);
  }
  await Setting.updateOne(
    { key: dbKey(id) },
    { $set: { value: String(value), updatedBy } },
    { upsert: true },
  );
  invalidateBranding();
}
