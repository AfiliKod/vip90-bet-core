/**
 * Tema token sisteminin üretim bağlantısı (A1).
 *
 * DB anahtarı biçimi: `theme.<id>` — mevcut Setting koleksiyonunu kullanır,
 * modules/index.js'teki aynı yaklaşım.
 */
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import { createThemeStore, THEME_TOKEN_DEFINITIONS } from './registry.js';

const KEY_PREFIX = 'theme.';
const dbKey = id => `${KEY_PREFIX}${id}`;

export const themeStore = createThemeStore({
  load: async () => {
    if (mongoose.connection.readyState !== 1) return {};
    const keys = THEME_TOKEN_DEFINITIONS.map(t => dbKey(t.id));
    const rows = await Setting.find({ key: { $in: keys } }).lean();
    const overrides = {};
    for (const r of rows) overrides[r.key.slice(KEY_PREFIX.length)] = r.value;
    return overrides;
  },
});

export const getThemeCssVars = () => themeStore.getCssVars();
export const listThemeTokens = () => themeStore.list();
export const invalidateTheme = () => themeStore.invalidate();

/** Admin panelinden bir token'ı değiştirir (A3 kapsamının üzerine ineceği yüzey). */
export async function setThemeToken(id, value, updatedBy) {
  if (!THEME_TOKEN_DEFINITIONS.some(t => t.id === id)) {
    throw new Error(`Bilinmeyen tema token'ı: ${id}`);
  }
  await Setting.updateOne(
    { key: dbKey(id) },
    { $set: { value: String(value), updatedBy } },
    { upsert: true },
  );
  invalidateTheme();
}
