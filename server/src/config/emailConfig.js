/**
 * E-posta ayarları: DB (gizli alanlar şifreli) > env. email.js göndericisini
 * ayar değişince yeniden kurar. DB anahtar öneki `smtp.*`tır (2026-10-03'teki
 * ilk SMTP kurulumundan kalma; Mailtrap alanları da aynı store'u kullanır).
 *
 * İki alan (2026-10-03, Communication Providers kartı):
 *  - provider: panelde hazır değerler (Mailtrap/Mailgun/SES/Postmark/özel) doldurur;
 *    SMTP için transport etkisi yok — sadece "hangi hizmet" bilgisidir. Mailtrap
 *    için BİLTEREK etkilidir: `resolveEmailMode` API mi SMTP mi seçer. Üretim
 *    ortam değişkeni yoksa panel host'tan çıkarır (`smtp.mailgun.org` → mailgun).
 *  - fromName: From başlığındaki görünen ad; boşsa site adı kullanılır
 *    (email.js `formatFrom`).
 *
 * Üçüncü alan (2026-10-06, Modules → Email Gateway kartı):
 *  - gatewayEnabled: `true` → transport panel/DB ayarlarını kullanır
 *    (DB > env, eski davranış); `false` → transport YALNIZCA sunucu .env
 *    değerlerini kullanır (`emailEnvView`) — paneldeki DB değerleri
 *    bilerek yok sayılır.
 *
 * Dördüncü alan grubu (2026-10-30, Mailtrap Email API):
 *  - token: Mailtrap Sending API anahtarı (gizli).
 *  - useSandbox: `true` → Sandbox'a gönderir, gerçek alıcıya çıkmaz.
 *  - sandboxInboxId: Sandbox inbox sayısı; `useSandbox=true` ile zorunlu.
 */
import { createSecretSettingsStore, mongoLoad, mongoSave } from './secretSettingsStore.js';

export const EMAIL_PROVIDERS = ['mailtrap', 'mailgun', 'ses', 'postmark', 'custom'];

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
  { name: 'token', env: 'MAILTRAP_TOKEN', secret: true },
  { name: 'useSandbox', env: 'MAILTRAP_SANDBOX', default: 'false' },
  { name: 'sandboxInboxId', env: 'MAILTRAP_INBOX_ID' },
];

/** Gönderim mekanizmaları (email.js bu üçünden birini seçer). */
export const EMAIL_MODES = ['mailtrap', 'smtp', 'none'];

/**
 * Hangi mekanizma kullanılır?
 *  - `mailtrap`: token çözülmüş VE sağlayıcı mailtrap seçili — ya da SMTP
 *    host'u hiç yok (token-only kurulum).
 *  - `smtp`: host var ve sağlayıcı mailtrap DEĞİL (eski operatör kurulumları
 *    token olsa bile SMTP'de kalır).
 *  - `none`: ikisi de yok → email.js mock'a düşer (geliştirme davranışı).
 */
export function resolveEmailMode(c = {}) {
  if (c.token && (c.provider === 'mailtrap' || !c.host)) return 'mailtrap';
  if (c.host) return 'smtp';
  return 'none';
}

/**
 * Sunucu .env görünümü — Email Gateway anahtarı KAPALIYKEN email.js
 * göndericisi bunu kullanır: yalnız .env (+ alan varsayılanları), panel DB'si
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

function normalizeOptions(options) {
  if (!options) return {};
  if (typeof options === 'string' || options._bsontype || options.constructor?.name === 'ObjectId') {
    return { tenantId: options };
  }
  return options;
}

export function createEmailConfigStore(deps = {}) {
  const store = createSecretSettingsStore({
    prefix: 'smtp',
    fields: EMAIL_FIELDS,
    load: mongoLoad,
    save: mongoSave,
    scope: 'tenant',
    ...deps,
  });
  const originalGetAll = store.getAll;
  store.getAll = function (options = {}) {
    return originalGetAll.call(this, normalizeOptions(options));
  };
  return store;
}

export const emailConfig = createEmailConfigStore();
