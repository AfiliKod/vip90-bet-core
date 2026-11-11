import crypto from 'node:crypto';

/**
 * Tek kullanımlık e-posta/şifre-sıfırlama token'larının DB'de saklanan hâli.
 * Ham token yalnız e-postadaki linkte bulunur; DB sızsa bile link üretilemez.
 */
export function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}
