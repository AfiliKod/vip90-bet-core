import speakeasy from 'speakeasy';
import { encryptSensitive, decryptSensitive, isEncryptedSecret } from '../utils/secretCrypto.js';

export function encryptTwoFactorSecret(secret) { return encryptSensitive(secret); }

export function decryptTwoFactorSecret(user) { return decryptSensitive(user?.twoFactorSecret ?? null); }

export function writeBackupCodes(codes) { return encryptSensitive(JSON.stringify(codes)); }

export function readBackupCodes(user) {
  const raw = user?.twoFactorBackupCodes;
  if (!raw) return [];
  try {
    if (Array.isArray(raw)) return raw; // legacy düz dizi
    const parsed = JSON.parse(isEncryptedSecret(raw) ? decryptSensitive(raw) : raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/**
 * TOTP veya yedek kod doğrular. Kullanıcı `+twoFactorSecret +twoFactorBackupCodes`
 * ile yüklenmiş olmalı. Yedek kod kullanıldıysa çağıran `remainingBackupCodes`'u
 * `writeBackupCodes` ile kaydeder.
 *
 * Legacy düz metin sır başarılı TOTP sonrası şifrelenerek yeniden yazılır; bu
 * best-effort'tur: OPERATOR_SECRET_ENCRYPTION_KEY yoksa giriş yine doğrulanır,
 * yeniden şifreleme atlanır ve uyarı loglanır (yeni sır YAZMAK fail-closed'dır).
 */
export async function verifySecondFactor(user, token) {
  const clean = String(token ?? '').replace(/\s/g, '');
  const secret = decryptTwoFactorSecret(user);
  if (secret && speakeasy.totp.verify({ secret, encoding: 'base32', token: clean, window: 1 })) {
    if (user?.twoFactorSecret && !isEncryptedSecret(user.twoFactorSecret)) {
      try {
        user.twoFactorSecret = encryptTwoFactorSecret(secret);
        await user.save();
      } catch (e) {
        console.warn('[2fa] legacy sır yeniden şifrelenemedi (OPERATOR_SECRET_ENCRYPTION_KEY?):', e.message);
      }
    }
    return { ok: true, usedBackupCode: false };
  }
  const codes = readBackupCodes(user);
  const idx = codes.indexOf(clean);
  if (idx === -1) return { ok: false };
  return { ok: true, usedBackupCode: true, remainingBackupCodes: codes.filter((_, i) => i !== idx) };
}
