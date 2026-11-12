/**
 * Varsayılan dil deposunun üretim bağlantısı (Setting koleksiyonu) —
 * timezoneLive.js ile birebir aynı desen.
 */
import { createLocaleStore } from './locale.js';
import { mongoLoad } from '../config/secretSettingsStore.js';
import { saveScopedSetting, createTenantStoreFacade } from './settings.js';

// Tenant-keyed instances (İP-4 Task 4): the factory cache is per instance.
const stores = createTenantStoreFacade(({ tenantId, brandId }) => createLocaleStore({
  loadSetting: async (key) => {
    const raw = await mongoLoad([key], { tenantId, brandId });
    return raw[key] ?? null;
  },
  saveSetting: async (key, value, updatedBy) => saveScopedSetting(key, value, updatedBy),
}));

export const localeStore = {
  get: () => stores.current().get(),
  set: (value, updatedBy) => stores.current().set(value, updatedBy),
};