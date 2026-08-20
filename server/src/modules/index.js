/**
 * Modül kayıt defterinin üretim bağlantısı (M1).
 *
 * DB anahtarı biçimi: `module.<id>.enabled` — mevcut Setting koleksiyonunu
 * (key-value, admin panelinden yazılabilir) kullanır; yeni bir şema açmaz.
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { createModuleStore, MODULE_DEFINITIONS } from './registry.js';

const KEY_PREFIX = 'module.';
const KEY_SUFFIX = '.enabled';
const dbKey = id => `${KEY_PREFIX}${id}${KEY_SUFFIX}`;

export const moduleStore = createModuleStore({
  load: async () => {
    // DB bağlı değilse mongoose sorguyu buffer'da tutar; fail-closed davranış
    // zaten "hepsi kapalı" ile sonuçlanır, burada erkenden aynı sonuca düş.
    if (mongoose.connection.readyState !== 1) return {};
    const keys = MODULE_DEFINITIONS.map(m => dbKey(m.id));
    const rows = await Setting.find({ key: { $in: keys } }).lean();
    const flags = {};
    for (const r of rows) flags[r.key.slice(KEY_PREFIX.length, -KEY_SUFFIX.length)] = r.value === 'true';
    return flags;
  },
});

export const isModuleEnabled = id => moduleStore.isEnabled(id);
export const listModules = () => moduleStore.list();
export const invalidateModules = () => moduleStore.invalidate();

/** Admin panelinden bir modülü açıp kapatır. */
export async function setModuleEnabled(id, enabled, updatedBy) {
  if (!MODULE_DEFINITIONS.some(m => m.id === id)) {
    throw new Error(`Bilinmeyen modül: ${id}`);
  }
  await Setting.updateOne(
    { key: dbKey(id) },
    { $set: { value: String(!!enabled), updatedBy } },
    { upsert: true },
  );
  invalidateModules();
}
