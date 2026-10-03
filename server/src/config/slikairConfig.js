/**
 * Slikair kimlik bilgileri: DB (şifreli) > env. Servis kodu her istekte
 * buradan okur (30 sn TTL cache; admin güncellemesinde anında geçersiz olur).
 */
import { createSecretSettingsStore, mongoLoad, mongoSave } from './secretSettingsStore.js';

export const SLIKAIR_FIELDS = [
  { name: 'merchantId', env: 'SLIKAIR_MERCHANT_ID' },
  { name: 'merchantToken', env: 'SLIKAIR_MERCHANT_TOKEN', secret: true },
  { name: 'siteId', env: 'SLIKAIR_SITE_ID' },
  { name: 'baseUrl', env: 'SLIKAIR_BASE_URL', default: 'https://sandbox.slikair.online/api/v2' },
  { name: 'webhookSecret', env: 'SLIKAIR_WEBHOOK_SECRET', secret: true },
];

export function createSlikairConfigStore(deps = {}) {
  return createSecretSettingsStore({
    prefix: 'slikair',
    fields: SLIKAIR_FIELDS,
    load: mongoLoad,
    save: mongoSave,
    ...deps,
  });
}

export const slikairConfig = createSlikairConfigStore();

/** { merchantId, merchantToken, siteId, baseUrl, webhookSecret } */
export const getSlikairCredentials = () => slikairConfig.getAll();

export async function isSlikairConfigured() {
  const c = await slikairConfig.getAll();
  return !!(c.merchantId && c.merchantToken && c.siteId);
}
