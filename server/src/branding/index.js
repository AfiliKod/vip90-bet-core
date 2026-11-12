/**
 * Marka kimliği alanlarının üretim bağlantısı (A3).
 *
 * DB anahtarı biçimi: `branding.<id>` — mevcut Setting koleksiyonunu kullanır,
 * theme/index.js ve modules/index.js'teki aynı yaklaşım.
 */
import { createBrandingStore, BRANDING_FIELD_DEFINITIONS } from './registry.js';
import { mongoLoad } from '../config/secretSettingsStore.js';
import { saveScopedSetting, createTenantStoreFacade } from '../services/settings.js';
import mongoose from 'mongoose';
import Tenant from '../models/Tenant.js';
import { clientUrlFallback } from '../tenancy/tenantBaseUrl.js';
import { getCurrentTenantId } from '../tenancy/context.js';
import { getDefaultTenantId } from '../tenancy/defaultTenantId.js';
import { getTenancyMode } from '../config/tenancy.js';

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
 * noktası — admin panelinden ayarlanan siteName'i döner. Ayar yoksa çekirdek
 * marka adı taşımaz: önce geçerli kiracının adı (tek modda varsayılan kiracı,
 * store facade ile aynı çözümleme), o da yoksa boş dize. Boş değerde etiket
 * üretmesi gereken çağırıcılar istek host'una düşer.
 */
export async function getSiteName() {
  const values = await getBrandingValues();
  if (values.siteName) return values.siteName;
  const tenantId = getCurrentTenantId() ?? (getTenancyMode() === 'single' ? getDefaultTenantId() : null);
  if (tenantId && mongoose.connection.readyState === 1) {
    const tenant = await Tenant.findById(tenantId).select('name').lean();
    if (tenant?.name) return tenant.name;
  }
  // Son çare: kurulumun kendi adresinin host'u (CLIENT_URL). Çekirdek ürün adı
  // taşımaz; e-posta, KYC bildirimi ve statik sayfalar boş ad almaz.
  try {
    return new URL(clientUrlFallback()).hostname;
  } catch {
    return '';
  }
}

/** Admin panelinden bir marka alanını değiştirir. */
export async function setBrandingField(id, value, updatedBy) {
  if (!BRANDING_FIELD_DEFINITIONS.some(f => f.id === id)) {
    throw new Error(`Bilinmeyen marka alanı: ${id}`);
  }
  await saveScopedSetting(dbKey(id), String(value), updatedBy);
  invalidateBranding();
}
