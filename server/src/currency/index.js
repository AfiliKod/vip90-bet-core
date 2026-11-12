/**
 * Para birimi sisteminin üretim bağlantısı (U4).
 *
 * DB anahtarı: `currency.code` — mevcut Setting koleksiyonunu kullanır
 * (theme/index.js, modules/index.js ile aynı yaklaşım).
 */
import { createCurrencyStore, CURRENCY_DEFINITIONS, formatMoney as formatMoneyPure } from './registry.js';
import { mongoLoad } from '../config/secretSettingsStore.js';
import { saveScopedSetting, createTenantStoreFacade } from '../services/settings.js';

const KEY = 'currency.code';

// Tenant-keyed instances (İP-4 Task 4): the registry cache is per instance.
const stores = createTenantStoreFacade(({ tenantId, brandId }) => createCurrencyStore({
  load: async () => {
    const raw = await mongoLoad([KEY], { tenantId, brandId });
    return raw[KEY] ? { code: raw[KEY] } : {};
  },
}));

export const currencyStore = {
  getActive: () => stores.current().getActive(),
  list: () => stores.current().list(),
  invalidate: () => stores.invalidateAll(),
};

export const getActiveCurrency = () => currencyStore.getActive();
export const listCurrencies = () => currencyStore.list();
export const invalidateCurrency = () => currencyStore.invalidate();

/** Aktif para birimiyle bir tutarı biçimlendirir — hata/log mesajları için. */
export async function formatMoney(amount) {
  const active = await getActiveCurrency();
  return formatMoneyPure(amount, active);
}

/** Admin panelinden aktif para birimini değiştirir. */
export async function setActiveCurrency(code, updatedBy) {
  if (!CURRENCY_DEFINITIONS.some(c => c.code === code)) {
    throw new Error(`Bilinmeyen para birimi: ${code}`);
  }
  await saveScopedSetting(KEY, code, updatedBy);
  invalidateCurrency();
}
