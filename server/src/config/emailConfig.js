/**
 * SMTP ayarları: DB (şifre şifreli) > env. email.js transport'u ayar
 * değişince yeniden kurar.
 *
 * İki alan (2026-10-03, Communication Providers kartı):
 *  - provider: panelde hazır değerler (Mailgun/SES/Postmark/özel) doldurur;
 *    transport etkisi yok — sadece "hangi hizmet" bilgisidir. Üretim ortam
 *    değişkeni yoksa panel host'tan çıkarır (`smtp.mailgun.org` → mailgun).
 *  - fromName: From başlığındaki görünen ad; boşsa site adı kullanılır
 *    (email.js `formatFrom`).
 *
 * Üçüncü alan (2026-10-06, Modules → Email Gateway kartı):
 *  - gatewayEnabled: `true` → transport panel/DB ayarlarını kullanır
 *    (DB > env, eski davranış); `false` → transport YALNIZCA sunucu .env
 *    değerlerini kullanır (`emailEnvView`) — paneldeki DB değerleri
 *    bilerek yok sayılır.
 */
import { createSecretSettingsStore, mongoLoad, mongoSave } from './secretSettingsStore.js';

export const EMAIL_PROVIDERS = ['mailgun', 'ses', 'postmark', 'custom'];

export const EMAIL_FIELDS = [
  { name: 'host', env: 'SMTP_HOST' },
  { name: 'port', env: 'SMTP_PORT', default: '587' },
  { name: 'secure', env: 'SMTP_SECURE', default: 'false' },
  { name: 'user', env: 'SMTP_USER' },
  { name: 'pass', env: 'SMTP_PASS', secret: true },
  { name: 'from', env: 'SMTP_FROM', default: 'noreply@vip90.bet' },
  { name: 'fromName', env: 'SMTP_FROM_NAME' },
  { name: 'provider', env: 'SMTP_PROVIDER' },
  { name: 'gatewayEnabled', env: 'SMTP_GATEWAY_ENABLED', default: 'true' },
];

/**
 * Sunucu SMTP görünümü — Email Gateway anahtarı KAPALIYKEN email.js
 * transport'u bunu kullanır: yalnız .env (+ alan varsayılanları), panel DB'si
 * bilerek girmez. `secret` alan burada çözülmez (env değeri zaten düz metin).
 */
export function emailEnvView(env = process.env) {
  const out = {};
  for (const f of EMAIL_FIELDS) {
    const v = env[f.env] ?? f.default ?? '';
    if (v) out[f.name] = String(v);
  }
  return out;
}

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
