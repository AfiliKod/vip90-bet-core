/**
 * Marka dosyası (logo/favicon/font) ön doğrulama — saf mantık (A3).
 *
 * FileReader.readAsDataURL() çağırmadan ÖNCE çalışır ki geçersiz/aşırı büyük
 * bir dosya gereksiz yere okunup enjekte edilmeye çalışılmasın. Gerçek
 * bir `File` nesnesi değil, `{ size, type, name }` şeklinde herhangi bir
 * nesne kabul eder — DOM olmadan `node --test` ile test edilir.
 *
 * Son söz sunucudadır (validators/admin.js aynı maxBytes/tip kontrolünü
 * tekrar yapar) — burası yalnızca kullanıcıya erken, anlaşılır bir hata
 * göstermek için.
 */
export function validateBrandingFile(file, def) {
  if (!file) return { ok: false, error: 'Dosya seçilmedi' };

  if (def.type === 'image') {
    if (!/^image\//.test(file.type || '')) return { ok: false, error: 'Görsel dosyası olmalı (PNG, JPG, SVG…)' };
  } else if (def.type === 'font') {
    const looksLikeFont = /font|woff|ttf|otf/i.test(file.type || '') || /\.(woff2?|ttf|otf)$/i.test(file.name || '');
    if (!looksLikeFont) return { ok: false, error: 'Font dosyası olmalı (.woff, .woff2, .ttf, .otf)' };
  }

  if (typeof def.maxBytes === 'number' && file.size > def.maxBytes) {
    return { ok: false, error: `Dosya çok büyük (maks ${Math.round(def.maxBytes / 1024)} KB)` };
  }

  return { ok: true };
}
