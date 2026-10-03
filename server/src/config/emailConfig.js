/**
 * SMTP ayarları: DB (şifre şifreli) > env. email.js transport'u ayar
 * değişince yeniden kurar.
 */
import { createSecretSettingsStore, mongoLoad, mongoSave } from './secretSettingsStore.js';

export const EMAIL_FIELDS = [
  { name: 'host', env: 'SMTP_HOST' },
  { name: 'port', env: 'SMTP_PORT', default: '587' },
  { name: 'secure', env: 'SMTP_SECURE', default: 'false' },
  { name: 'user', env: 'SMTP_USER' },
  { name: 'pass', env: 'SMTP_PASS', secret: true },
  { name: 'from', env: 'SMTP_FROM', default: 'noreply@vip90.bet' },
];

export function createEmailConfigStore(deps = {}) {
  return createSecretSettingsStore({
    prefix: 'smtp',
    fields: EMAIL_FIELDS,
    load: mongoLoad,
    save: mongoSave,
    ...deps,
  });
}

export const emailConfig = createEmailConfigStore();
