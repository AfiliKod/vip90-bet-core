/**
 * Merkez tarafı prompt-injection filtresi (D8 — "WAF").
 *
 * D6'daki maskeleme (allowlist) hangi ALANLARIN geçebileceğini sınırlar;
 * bu filtre geçen alanların İÇERİĞİNİ tarar. Bir hata mesajı gibi
 * allowlist'e giren bir alan bile, içine gömülü bir talimat enjeksiyonu
 * taşıyabilir ("ignore previous instructions" vb.) — bu, analiz adımına
 * (LLM) ulaşmadan burada yakalanır.
 *
 * Fail-closed: herhangi bir alan şüpheliyse TÜM payload reddedilir,
 * yalnızca şüpheli alan sessizce atılmaz — kısmen temizlenmiş bir payload
 * yanıltıcı olabilir.
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all|any|previous|above)\s+instructions?/i,
  /disregard\s+(the\s+)?(above|previous|prior)/i,
  /forget\s+(everything|all)\s+(you|above)/i,
  /you\s+are\s+now\b/i,
  /\bact\s+as\b/i,
  /^\s*(system|assistant|user)\s*:/im,
  /###\s*(system|instruction)/i,
];

/** @returns {{clean: boolean, reasons: string[]}} */
export function scanForInjection(text) {
  if (typeof text !== 'string') return { clean: true, reasons: [] };
  const reasons = INJECTION_PATTERNS.filter(rx => rx.test(text)).map(rx => rx.source);
  return { clean: reasons.length === 0, reasons };
}

/**
 * @param {object} payload - maskDiagnostics çıktısı gibi düz string alanlar
 * @returns {object} payload değişmeden (yalnızca temizse)
 * @throws {Error} herhangi bir alan şüpheliyse — `err.flagged` detay taşır
 */
export function filterPayload(payload) {
  const flagged = [];
  for (const [key, value] of Object.entries(payload)) {
    const { clean, reasons } = scanForInjection(value);
    if (!clean) flagged.push({ key, reasons });
  }
  if (flagged.length) {
    const err = new Error('Prompt injection şüphesi tespit edildi, payload reddedildi');
    err.flagged = flagged;
    throw err;
  }
  return payload;
}
