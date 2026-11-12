/**
 * Öne çıkan oyunlar listesinin üretim bağlantısı (A5).
 *
 * DB anahtarı: `games.featured` — mevcut Setting koleksiyonunda tek bir JSON
 * dizi, theme/index.js ve pages/index.js'teki aynı yaklaşım (Setting
 * yeniden kullanımı).
 */
import { createFeaturedGamesStore } from './registry.js';
import { mongoLoad } from '../config/secretSettingsStore.js';
import { saveScopedSetting, createTenantStoreFacade } from '../services/settings.js';

const KEY = 'games.featured';

// Tenant-keyed instances (İP-4 Task 4): the registry cache is per instance.
const stores = createTenantStoreFacade(({ tenantId, brandId }) => createFeaturedGamesStore({
  load: async () => {
    const raw = await mongoLoad([KEY], { tenantId, brandId });
    return raw[KEY] ?? null;
  },
}));

export const featuredGamesStore = {
  get: () => stores.current().get(),
  invalidate: () => stores.invalidateAll(),
};

export const getFeaturedGameCodes = () => featuredGamesStore.get();
export const invalidateFeaturedGames = () => featuredGamesStore.invalidate();

/** Admin panelinden öne çıkan oyun listesini (kodlar, sırayla) değiştirir. */
export async function setFeaturedGameCodes(codes, updatedBy) {
  await saveScopedSetting(KEY, JSON.stringify(codes), updatedBy);
  invalidateFeaturedGames();
}
