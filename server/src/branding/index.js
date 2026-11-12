/**
 * Marka kimliği alanlarının üretim bağlantısı (A3).
 *
 * DB anahtarı biçimi: `branding.<id>` — mevcut Setting koleksiyonunu kullanır,
 * theme/index.js ve modules/index.js'teki aynı yaklaşım.
 */
import { createBrandingStore, BRANDING_FIELD_DEFINITIONS } from './registry.js';
import { mongoLoad } from '../config/secretSettingsStore.js';
import { saveScopedSetting, createTenantStoreFacade } from '../services/settings.js';

const KEY_PREFIX = 'branding.';
const dbKey = id => `${KEY_PREFIX}${id}`;

// Tenant-keyed instances (İP-4 Task 4): the registry cache is per instance.
const stores = createTenantStoreFacade(({ tenantId, brandId }) => createBrandingStore({
  load: async () => {
    const keys = BRANDING_FIELD_DEFINITIONS.map(f => dbKey(f.id));
    const raw = await mongoLoad(keys, { tenantId, brandId });
    const overrides = {};
    for (const key of keys) {
      if (raw[key] != null) overrides[key.slice(KEY_PREFIX.length)] = raw[key];
    }
    return overrides;
  },
}));

export const brandingStore = {
  getValues: () => stores.current().getValues(),
  list: () => stores.current().list(),
  invalidate: () => stores.invalidateAll(),
};

export const getBrandingValues = () => brandingStore.getValues();
export const listBranding = () => brandingStore.list();
export const invalidateBranding = () => brandingStore.invalidate();

/**
 * Sunucu tarafında (e-posta şablonları, 2FA etiketi, web3 imza mesajı,
 * chatbot sistem prompt'u gibi React dışı bağlamlar) kullanılan tek bakiye
 * noktası — admin panelinden ayarlanan siteName'i döner, hiç ayarlanmamışsa
 * client/src/store/brandingStore.js'teki AYNI varsayılana düşer (tutarlı tek
 * fallback — daha önce dosyalar arasında 'VIP90.bet'/'Bet Platform'/'VIP90.bet'
 * gibi farklı varsayılanlar dağınık haldeydi).
 */
export async function getSiteName() {
  const values = await getBrandingValues();
  return values.siteName || 'VIP90.bet';
}

/** Admin panelinden bir marka alanını değiştirir. */
export async function setBrandingField(id, value, updatedBy) {
  if (!BRANDING_FIELD_DEFINITIONS.some(f => f.id === id)) {
    throw new Error(`Bilinmeyen marka alanı: ${id}`);
  }
  await saveScopedSetting(dbKey(id), String(value), updatedBy);
  invalidateBranding();
}
