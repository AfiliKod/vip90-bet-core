/**
 * SEO ayarlarının alan tanımı, biçim doğrulaması ve normalizasyonu.
 *
 * Tek kaynak: admin uçları (zod), enjeksiyon (render sırasında tekrar
 * doğrulanır — DB'ye başka yoldan kötü değer girse bile script'e sızmaz) ve
 * CSP üretimi aynı regex'leri kullanır.
 *
 * Serbest HTML/script alanı BİLEREK yoktur (güvenlik kararı): script'e giden
 * tek değerler aşağıdaki regex'lerle doğrulanmış kimliklerdir.
 */
import { z } from 'zod';

export const GA4_RE = /^G-[A-Z0-9]{4,12}$/;
export const GTM_RE = /^GTM-[A-Z0-9]{4,10}$/;
export const PIXEL_RE = /^\d{5,20}$/;
export const VERIFICATION_RE = /^[A-Za-z0-9_-]{10,100}$/;
export const TWITTER_RE = /^[A-Za-z0-9_]{1,15}$/;

export const TWITTER_CARDS = ['summary', 'summary_large_image'];
export const INDEXING = ['index', 'noindex'];
export const DEFAULT_TITLE_TEMPLATE = '{page} | {site}';

export const SEO_LIMITS = {
  siteTitle: 120,
  titleTemplate: 120,
  description: 320,
  keywords: 300,
  canonicalBase: 200,
  ogImage: 500,
  ogSiteName: 80,
};

export const SEO_DEFAULTS = Object.freeze({
  siteTitle: '',
  titleTemplate: DEFAULT_TITLE_TEMPLATE,
  description: '',
  keywords: '',
  canonicalBase: '',
  indexing: 'index',
  ogImage: '',
  ogSiteName: '',
  twitterHandle: '',
  twitterCard: 'summary_large_image',
  googleVerification: '',
  bingVerification: '',
  yandexVerification: '',
  ga4Id: '',
  gtmId: '',
  pixelId: '',
});

export const SEO_FIELDS = Object.keys(SEO_DEFAULTS);

/** Kullanıcı tüm `<meta ... content="...">` etiketini yapıştırırsa yalnız content'i ayıklar. */
export function extractVerificationCode(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/</.test(s)) {
    const m = s.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    return (m ? (m[1] ?? m[2] ?? m[3] ?? '') : '').trim();
  }
  return s;
}

/** `@kullanici` ve `https://x.com/kullanici` girdilerini `kullanici`'ya indirger. */
export function normalizeTwitterHandle(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\/(?:www\.)?(?:twitter|x)\.com\//i, '').replace(/[/?#].*$/, '');
  return s.replace(/^@/, '');
}

/** http(s) kök adres → `origin` (yol/sorgu/fragment atılır); geçersizse null. */
export function normalizeBaseUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    return u.origin;
  } catch { return null; }
}

/** Paylaşım görseli: mutlak http(s) URL ya da `/` ile başlayan site-içi yol. */
export function isValidImageUrl(raw) {
  const s = String(raw ?? '');
  if (/[\s"'<>\\]/.test(s)) return false;
  if (s.startsWith('/') && !s.startsWith('//')) return true;
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password;
  } catch { return false; }
}

const str = max => z.string().trim().max(max, `en fazla ${max} karakter`);
const optionalId = (re, msg, upper = false) => z.string().trim().max(60)
  .transform(v => (upper ? v.toUpperCase() : v))
  .refine(v => v === '' || re.test(v), msg);
const code = z.string().max(1000).transform(extractVerificationCode)
  .refine(v => v === '' || VERIFICATION_RE.test(v), 'doğrulama kodu geçersiz (10-100 karakter, harf/rakam/-/_)');

/** Admin PUT gövdesi — tüm alanlar isteğe bağlı (kısmi güncelleme); boş string alanı temizler. */
export const seoSettingsSchema = z.object({
  siteTitle: str(SEO_LIMITS.siteTitle),
  titleTemplate: str(SEO_LIMITS.titleTemplate)
    .refine(v => v === '' || v.includes('{page}') || v.includes('{site}'), 'şablon {page} veya {site} içermeli'),
  description: str(SEO_LIMITS.description),
  keywords: str(SEO_LIMITS.keywords),
  canonicalBase: str(SEO_LIMITS.canonicalBase)
    .transform(normalizeBaseUrl)
    .refine(v => v !== null, 'canonical adres geçerli bir http(s) adresi olmalı'),
  indexing: z.enum(INDEXING),
  ogImage: str(SEO_LIMITS.ogImage).refine(v => v === '' || isValidImageUrl(v), 'görsel adresi geçersiz (http(s) URL veya / ile başlayan yol)'),
  ogSiteName: str(SEO_LIMITS.ogSiteName),
  twitterHandle: z.string().max(100).transform(normalizeTwitterHandle)
    .refine(v => v === '' || TWITTER_RE.test(v), 'kullanıcı adı geçersiz (1-15 harf/rakam/_)'),
  twitterCard: z.enum(TWITTER_CARDS),
  googleVerification: code,
  bingVerification: code,
  yandexVerification: code,
  ga4Id: optionalId(GA4_RE, 'GA4 kimliği G-XXXXXXXX biçiminde olmalı', true),
  gtmId: optionalId(GTM_RE, 'GTM kimliği GTM-XXXXXXX biçiminde olmalı', true),
  pixelId: optionalId(PIXEL_RE, 'Meta Pixel kimliği 5-20 haneli rakam olmalı'),
}).partial().strict();

/** DB'den gelen ham nesneyi tam, güvenli bir ayar nesnesine çevirir (geçersiz alan → varsayılan). */
export function sanitizeStored(raw) {
  const out = { ...SEO_DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of SEO_FIELDS) {
    if (raw[key] === undefined) continue;
    const r = seoSettingsSchema.safeParse({ [key]: raw[key] });
    if (r.success && r.data[key] !== undefined) out[key] = r.data[key];
  }
  return out;
}
