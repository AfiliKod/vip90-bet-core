/**
 * Google ile giriş ayarları: DB (sır şifreli) > env > varsayılan.
 * Panel: Settings → Modules → Google Login kartı. 30 sn TTL cache; admin
 * güncellemesinde anında geçersiz olur.
 *
 * `enabled` kartın başlık anahtarıdır; varsayılanı 'true' — yalnız .env ile
 * yapılandırılmış kurulumlar eskisi gibi çalışır. Giriş, anahtar açık VE
 * istemci kimliği + sırrı tanımlıysa etkindir.
 */
import { createSecretSettingsStore, mongoLoad, mongoSave } from './secretSettingsStore.js';

export const GOOGLE_AUTH_FIELDS = [
  { name: 'enabled', env: 'GOOGLE_LOGIN_ENABLED', default: 'true' },
  { name: 'clientId', env: 'GOOGLE_CLIENT_ID' },
  { name: 'clientSecret', env: 'GOOGLE_CLIENT_SECRET', secret: true },
  { name: 'redirectUri', env: 'GOOGLE_REDIRECT_URI' },
];

export function createGoogleAuthConfigStore(deps = {}) {
  return createSecretSettingsStore({
    prefix: 'googleAuth',
    fields: GOOGLE_AUTH_FIELDS,
    load: mongoLoad,
    save: mongoSave,
    ...deps,
  });
}

export const googleAuthConfig = createGoogleAuthConfigStore();

/**
 * Redirect URI boşsa birincil frontend adresinden türetilir
 * (CLIENT_URL'deki ilk origin + /api/auth/google/callback).
 */
export function defaultRedirectUri(env = process.env) {
  const origin = (env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/+$/, '');
  return `${origin}/api/auth/google/callback`;
}

/** { enabled, clientId, clientSecret, redirectUri, active } — active: giriş kullanılabilir mi. */
export async function getGoogleAuthSettings(store = googleAuthConfig, env = process.env) {
  const c = await store.getAll();
  const enabled = c.enabled !== 'false';
  return {
    enabled,
    clientId: c.clientId,
    clientSecret: c.clientSecret,
    redirectUri: c.redirectUri || defaultRedirectUri(env),
    active: enabled && Boolean(c.clientId && c.clientSecret),
  };
}
