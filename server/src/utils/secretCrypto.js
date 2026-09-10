/**
 * Geri döndürülebilir (reversible) sır şifreleme — AES-256-GCM.
 *
 * Neden bcrypt DEĞİL: `provider/models/Operator.js`'deki `apiKeySecretHash`
 * (bcrypt, User.password ile aynı desen) yalnızca DOĞRULAMA için yeterliydi
 * — ama bu sunucu aynı zamanda kendi operatörü gibi davranıp KENDİ isteklerini
 * imzalıyor (`services/inhouseProviderClient.js`), bunun için düz metne
 * ihtiyaç var. Bir yönlü hash'ten bu geri alınamaz. Bilinçli bir karar:
 * "tek yönlü hash, asla geri alınamaz" garantisinden geri adım — ama DB zaten
 * .env kadar güvenilir kabul ediliyor (JWT_SECRET gibi başka sırlar da düz
 * metin .env'de duruyor), ve bu iki tarafın (doğrulama + imzalama) AYNI sırra
 * ihtiyaç duyduğu self-referential (kendi kendine operatör) bir senaryo.
 */
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey() {
  const raw = process.env.OPERATOR_SECRET_ENCRYPTION_KEY;
  if (!raw) throw new Error('OPERATOR_SECRET_ENCRYPTION_KEY tanımlı değil (.env) — 64 hex karakter (32 byte) olmalı.');
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) throw new Error('OPERATOR_SECRET_ENCRYPTION_KEY 32 byte (64 hex karakter) olmalı.');
  return key;
}

/** Düz metni şifreleyip `iv.authTag.ciphertext` (base64, nokta ayraçlı) döner. */
export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map(b => b.toString('base64')).join('.');
}

/** `encryptSecret`'in tersini alır. Bozuk/yanlış anahtarla şifrelenmiş payload'da throw eder. */
export function decryptSecret(payload) {
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Geçersiz şifreli payload biçimi');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Sabit-zamanlı karşılaştırma — `provided` (kullanıcıdan gelen) ile şifreli saklanan değeri kıyaslar. */
export function secretsMatch(provided, encryptedStored) {
  try {
    const stored = decryptSecret(encryptedStored);
    const a = Buffer.from(String(provided), 'utf8');
    const b = Buffer.from(stored, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
