/**
 * Komut imzalama/doğrulama (D6 — bakım ajanı, adım 3-4).
 *
 * Ed25519 asimetrik imza: özel anahtar yalnızca destek iş istasyonunda/HSM'de
 * kalır, müşteri kurulumlarına yalnızca AÇIK doğrulama anahtarı dağıtılır.
 * Anahtar çalınsa bile sahte komut ÜRETİLEMEZ, yalnızca üretilmiş bir komut
 * doğrulanabilir — imzalama yetkisi hiçbir zaman müşteri makinesine geçmez.
 *
 * Yalnızca actionId+params imzalanır (canonical envelope). Bunun dışındaki
 * taşıyıcı alanlar (ör. receivedAt gibi meta) imza kapsamı dışıdır ve
 * doğrulamayı etkilemez — imza kapsamı kasıtlı olarak dar tutulur.
 */
import { sign, verify } from 'crypto';

function canonicalPayload({ actionId, params }) {
  // Anahtar sırası sabit tutulur ki aynı mantıksal komut her zaman aynı
  // baytları üretsin (JSON.stringify obje anahtar sırasını korur, biz de
  // burada sırayı elle sabitliyoruz).
  return Buffer.from(JSON.stringify({ actionId, params }));
}

/** @returns {object} orijinal payload + base64 imza */
export function signCommand(payload, privateKey) {
  const signature = sign(null, canonicalPayload(payload), privateKey).toString('base64');
  return { ...payload, signature };
}

/** @returns {boolean} imza geçerli mi — hiçbir girdide throw etmez */
export function verifyCommand(signedPayload, publicKey) {
  try {
    if (typeof signedPayload?.signature !== 'string') return false;
    const sigBuf = Buffer.from(signedPayload.signature, 'base64');
    return verify(null, canonicalPayload(signedPayload), publicKey, sigBuf);
  } catch {
    return false;
  }
}
