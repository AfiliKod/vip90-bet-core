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

function canonicalPayload({ actionId, params, approvedBy }) {
  // Anahtar sırası sabit tutulur ki aynı mantıksal komut her zaman aynı
  // baytları üretsin. approvedBy DE imza kapsamına dahildir (D7): yıkıcı
  // bir eylemde bu alan kurcalanırsa (ör. başka bir temsilcinin adı
  // yazılırsa) imza geçersiz olur — onay bilgisi de veri kadar korunur.
  return Buffer.from(JSON.stringify({ actionId, params, approvedBy: approvedBy ?? null }));
}

/**
 * @param {object} payload - { actionId, params, approvedBy? } — approvedBy
 *   yalnızca yıkıcı eylemlerde (D7 onay kapısından geçtikten sonra) taşınır.
 * @returns {object} orijinal payload + base64 imza
 */
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
