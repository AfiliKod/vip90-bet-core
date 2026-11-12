/**
 * Tema token sisteminin üretim bağlantısı (A1).
 *
 * DB anahtarı biçimi: `theme.<id>` — mevcut Setting koleksiyonunu kullanır,
 * modules/index.js'teki aynı yaklaşım.
 */
import { createThemeStore, THEME_TOKEN_DEFINITIONS } from './registry.js';
import { mongoLoad } from '../config/secretSettingsStore.js';
import { saveScopedSetting, createTenantStoreFacade } from '../services/settings.js';

const KEY_PREFIX = 'theme.';
const dbKey = id => `${KEY_PREFIX}${id}`;

// Tenant-keyed instances (İP-4 Task 4): the registry cache is per instance.
const stores = createTenantStoreFacade(({ tenantId, brandId }) => createThemeStore({
  load: async () => {
    const keys = THEME_TOKEN_DEFINITIONS.map(t => dbKey(t.id));
    const raw = await mongoLoad(keys, { tenantId, brandId });
    const overrides = {};
    for (const key of keys) {
      if (raw[key] != null) overrides[key.slice(KEY_PREFIX.length)] = raw[key];
    }
    return overrides;
  },
}));

export const themeStore = {
  getCssVars: () => stores.current().getCssVars(),
  list: () => stores.current().list(),
  invalidate: () => stores.invalidateAll(),
};

export const getThemeCssVars = () => themeStore.getCssVars();
export const listThemeTokens = () => themeStore.list();
export const invalidateTheme = () => themeStore.invalidate();

/** Admin panelinden bir token'ı değiştirir (A3 kapsamının üzerine ineceği yüzey). */
export async function setThemeToken(id, value, updatedBy) {
  if (!THEME_TOKEN_DEFINITIONS.some(t => t.id === id)) {
    throw new Error(`Bilinmeyen tema token'ı: ${id}`);
  }
  await saveScopedSetting(dbKey(id), String(value), updatedBy);
  invalidateTheme();
}
