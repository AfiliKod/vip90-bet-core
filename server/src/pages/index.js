/**
 * Ana sayfa içerik modelinin üretim bağlantısı (A4).
 *
 * DB anahtarı: `page.home` — mevcut Setting koleksiyonunda tek bir JSON
 * gövde, theme/index.js ve branding/index.js'teki aynı yaklaşımın (Setting
 * yeniden kullanımı) yapılı içerik versiyonu.
 */
import { createHomeContentStore } from './registry.js';
import { mongoLoad } from '../config/secretSettingsStore.js';
import { saveScopedSetting, createTenantStoreFacade } from '../services/settings.js';

const KEY = 'page.home';

// Tenant-keyed instances (İP-4 Task 4): the registry cache is per instance.
const stores = createTenantStoreFacade(({ tenantId, brandId }) => createHomeContentStore({
  load: async () => {
    const raw = await mongoLoad([KEY], { tenantId, brandId });
    return raw[KEY] ?? null;
  },
}));

export const homeContentStore = {
  get: () => stores.current().get(),
  invalidate: () => stores.invalidateAll(),
};

export const getHomeContent = () => homeContentStore.get();
export const invalidateHomeContent = () => homeContentStore.invalidate();

/** Admin panelinden ana sayfa içeriğini (bölüm sırası + banner'lar) değiştirir. */
export async function setHomeContent(content, updatedBy) {
  await saveScopedSetting(KEY, JSON.stringify(content), updatedBy);
  invalidateHomeContent();
}
