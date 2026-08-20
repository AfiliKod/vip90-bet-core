/**
 * Lokal ajan maskeleme katmanı (D6 — bakım ajanı, adım 1).
 *
 * Merkeze giden her teşhis verisi buradan geçer. Denylist ("kötüyü sil")
 * DEĞİL, allowlist ("yalnızca bilinen güvenli alanı gönder") — bilinmeyen
 * bir alan, base64 blob, stack trace içindeki kullanıcı verisi vb. varsayılan
 * olarak SIZMAZ. Rapordaki "maskeleme allowlist olsun" kararının kod karşılığı.
 *
 * Allowlist'teki bir alanın değeri primitive (string/number/boolean) DEĞİLSE
 * — obje, dizi, fonksiyon — hiç geçirilmez. Beklenmeyen bir şekli serileştirmeye
 * çalışmak (ör. JSON.stringify ile nested içeriği aktarmak), allowlist'in
 * önlemeye çalıştığı sızıntının ta kendisidir: alan adı tanıdık olsa bile
 * içeriği tanıdık değilse güvenli sayılmaz.
 */

const MAX_VALUE_LENGTH = 500;
const isPrimitive = v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/**
 * @param {object|null} raw - ham teşhis verisi
 * @param {string[]} allowlist - yalnızca bu anahtarlar geçer
 * @returns {object} - allowlist'e uyan, primitive, uzunluğu sınırlı alt küme
 */
export function maskDiagnostics(raw, allowlist) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of allowlist) {
    const value = raw[key];
    if (!isPrimitive(value)) continue; // obje/dizi/fonksiyon/null/undefined: fail-closed düş
    const str = String(value);
    out[key] = str.length > MAX_VALUE_LENGTH ? str.slice(0, MAX_VALUE_LENGTH) : str;
  }
  return out;
}
