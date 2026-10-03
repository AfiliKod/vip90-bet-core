// İstemci tarafı SEO alan doğrulaması — sunucudaki server/src/seo/schema.js ile
// AYNI kurallar (sunucu yine de kendi doğrulamasını yapar). Saf modül.

export const GA4_RE = /^G-[A-Z0-9]{4,12}$/;
export const GTM_RE = /^GTM-[A-Z0-9]{4,10}$/;
export const PIXEL_RE = /^\d{5,20}$/;
export const VERIFICATION_RE = /^[A-Za-z0-9_-]{10,100}$/;
export const TWITTER_RE = /^[A-Za-z0-9_]{1,15}$/;

export const DESCRIPTION_RECOMMENDED = 160;

/** Tüm `<meta ... content="...">` yapıştırılırsa yalnız content değerini ayıklar. */
export function extractVerificationCode(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.includes('<')) {
    const m = s.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    return (m ? (m[1] ?? m[2] ?? m[3] ?? '') : '').trim();
  }
  return s;
}

export function normalizeTwitterHandle(raw) {
  let s = String(raw ?? '').trim();
  s = s.replace(/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\//i, '').replace(/[/?#].*$/, '');
  return s.replace(/^@/, '');
}

function validUrl(s, { relative = false } = {}) {
  if (/[\s"'<>\\]/.test(s)) return false;
  if (relative && s.startsWith('/') && !s.startsWith('//')) return true;
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password;
  } catch { return false; }
}

/**
 * Form değerlerini doğrular. Dönen nesne: alan → hata i18n anahtarı (boşsa geçerli).
 * Boş değer her zaman geçerlidir (alanı temizler).
 */
export function validateSeo(v) {
  const e = {};
  const get = k => String(v[k] ?? '').trim();
  const tpl = get('titleTemplate');
  if (tpl && !tpl.includes('{page}') && !tpl.includes('{site}')) e.titleTemplate = 'admin.seo.errTemplate';
  const base = get('canonicalBase');
  if (base && !validUrl(base)) e.canonicalBase = 'admin.seo.errUrl';
  const img = get('ogImage');
  if (img && !validUrl(img, { relative: true })) e.ogImage = 'admin.seo.errImage';
  const tw = normalizeTwitterHandle(v.twitterHandle);
  if (tw && !TWITTER_RE.test(tw)) e.twitterHandle = 'admin.seo.errTwitter';
  for (const k of ['googleVerification', 'bingVerification', 'yandexVerification']) {
    const c = extractVerificationCode(v[k]);
    if (c && !VERIFICATION_RE.test(c)) e[k] = 'admin.seo.errVerification';
  }
  if (get('ga4Id') && !GA4_RE.test(get('ga4Id').toUpperCase())) e.ga4Id = 'admin.seo.errGa4';
  if (get('gtmId') && !GTM_RE.test(get('gtmId').toUpperCase())) e.gtmId = 'admin.seo.errGtm';
  if (get('pixelId') && !PIXEL_RE.test(get('pixelId'))) e.pixelId = 'admin.seo.errPixel';
  return e;
}
