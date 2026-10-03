/**
 * SEO etiketlerinin üretimi ve index.html'e enjeksiyonu — saf fonksiyonlar.
 *
 * Güvenlik: tüm değerler HTML kaçışlıdır; script içine giden kimlikler
 * (GA4/GTM/Pixel) burada TEKRAR regex ile doğrulanır, geçersizse hiç üretilmez.
 */
import { GA4_RE, GTM_RE, PIXEL_RE, VERIFICATION_RE, TWITTER_RE } from './schema.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

const XML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
export const escapeXml = v => String(v ?? '').replace(/[&<>"']/g, c => XML_ESC[c]);

/** Oturum açmış/özel alanlar — arama motorlarına kapalı, sitemap'e girmez. */
export const PRIVATE_PATH_PREFIXES = [
  '/admin', '/api', '/install', '/login', '/auth', '/forgot-password',
  '/reset-password', '/verify-email', '/profile', '/my-bets', '/favorites',
  '/recently-played', '/kyc', '/settings', '/responsible-gaming', '/help', '/igames', '/games',
];

export function isPrivatePath(path) {
  return PRIVATE_PATH_PREFIXES.some(p => path === p || path.startsWith(`${p}/`));
}

const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;

/**
 * Taban URL: ayarlı canonical varsa o, yoksa isteğin host'u. Host başlığı
 * istemci kontrollüdür; biçimi doğrulanamazsa null (etiket üretilmez).
 */
export function resolveBaseUrl(seo, req) {
  if (seo?.canonicalBase) return seo.canonicalBase;
  const host = req?.get?.('host') || req?.headers?.host;
  if (!host || !HOST_RE.test(host)) return null;
  return `${req.protocol === 'https' ? 'https' : 'http'}://${host}`;
}

/** İstek yolunu canonical için normalleştirir (sorgu yok, sondaki / yok). */
export function normalizePath(path) {
  let p = String(path || '/').split(/[?#]/)[0] || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

function absoluteImage(img, base) {
  if (!img) return '';
  if (/^https?:\/\//i.test(img)) return img;
  return base ? `${base}${img}` : '';
}

const meta = (attr, name, content) => `<meta ${attr}="${name}" content="${escapeHtml(content)}">`;

/**
 * `<head>` blokları + `<body>` başı noscript'leri.
 * @returns {{ title: string|null, head: string, bodyStart: string }}
 */
export function buildSeoTags(seo, { path = '/', baseUrl = null, siteName = '' } = {}) {
  const p = normalizePath(path);
  const site = seo.siteTitle || siteName || '';
  const head = [];
  const bodyStart = [];
  const title = seo.siteTitle || null;

  if (seo.description) head.push(meta('name', 'description', seo.description));
  if (seo.keywords) head.push(meta('name', 'keywords', seo.keywords));
  const noindex = seo.indexing === 'noindex' || isPrivatePath(p);
  head.push(meta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow'));

  const url = baseUrl ? `${baseUrl}${p === '/' ? '/' : p}` : null;
  if (url && !isPrivatePath(p)) head.push(`<link rel="canonical" href="${escapeHtml(url)}">`);

  // Open Graph
  const ogTitle = title || site;
  if (ogTitle) head.push(meta('property', 'og:title', ogTitle));
  if (seo.description) head.push(meta('property', 'og:description', seo.description));
  const image = absoluteImage(seo.ogImage, baseUrl);
  if (image) head.push(meta('property', 'og:image', image));
  if (url) head.push(meta('property', 'og:url', url));
  const ogSite = seo.ogSiteName || site;
  if (ogSite) head.push(meta('property', 'og:site_name', ogSite));
  head.push(meta('property', 'og:type', 'website'));

  // Twitter / X
  head.push(meta('name', 'twitter:card', seo.twitterCard === 'summary' ? 'summary' : 'summary_large_image'));
  if (ogTitle) head.push(meta('name', 'twitter:title', ogTitle));
  if (seo.description) head.push(meta('name', 'twitter:description', seo.description));
  if (image) head.push(meta('name', 'twitter:image', image));
  if (seo.twitterHandle && TWITTER_RE.test(seo.twitterHandle)) head.push(meta('name', 'twitter:site', `@${seo.twitterHandle}`));

  // Site doğrulama
  const verif = [
    ['google-site-verification', seo.googleVerification],
    ['msvalidate.01', seo.bingVerification],
    ['yandex-verification', seo.yandexVerification],
  ];
  for (const [name, val] of verif) if (val && VERIFICATION_RE.test(val)) head.push(meta('name', name, val));

  // Analytics — yalnızca doğrulanmış kimlik varsa
  if (seo.gtmId && GTM_RE.test(seo.gtmId)) {
    head.push(`<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${seo.gtmId}');</script>`);
    bodyStart.push(`<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${seo.gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`);
  }
  if (seo.ga4Id && GA4_RE.test(seo.ga4Id)) {
    head.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${seo.ga4Id}"></script>`);
    head.push(`<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${seo.ga4Id}');</script>`);
  }
  if (seo.pixelId && PIXEL_RE.test(seo.pixelId)) {
    head.push(`<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${seo.pixelId}');fbq('track','PageView');</script>`);
    bodyStart.push(`<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${seo.pixelId}&amp;ev=PageView&amp;noscript=1"></noscript>`);
  }

  return { title, head: head.join('\n    '), bodyStart: bodyStart.join('') };
}

const STRIP_RES = [
  /<meta\s+name=["'](?:description|keywords|robots)["'][^>]*>\s*/gi,
];

/** index.html'e etiketleri yerleştirir; `<title>` varsa değiştirir. */
export function injectIntoHtml(html, tags) {
  let out = html;
  if (tags.title) {
    const titleTag = `<title>${escapeHtml(tags.title)}</title>`;
    out = /<title>[\s\S]*?<\/title>/i.test(out)
      ? out.replace(/<title>[\s\S]*?<\/title>/i, () => titleTag)
      : out.replace(/<\/head>/i, () => `${titleTag}</head>`);
  }
  for (const re of STRIP_RES) out = out.replace(re, '');
  if (tags.head) out = out.replace(/<\/head>/i, () => `    ${tags.head}\n  </head>`);
  if (tags.bodyStart) out = out.replace(/<body([^>]*)>/i, (m) => `${m}${tags.bodyStart}`);
  return out;
}

/** CSP'ye eklenecek ek kaynaklar — yalnızca ilgili kimlik girildiyse. */
export function seoCspExtras(seo) {
  const ex = { scriptSrc: [], connectSrc: [], imgSrc: [], frameSrc: [] };
  const add = (k, ...v) => { for (const x of v) if (!ex[k].includes(x)) ex[k].push(x); };
  if (seo?.ga4Id && GA4_RE.test(seo.ga4Id)) {
    add('scriptSrc', 'https://www.googletagmanager.com');
    add('connectSrc', 'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://www.googletagmanager.com');
    add('imgSrc', 'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://www.googletagmanager.com');
  }
  if (seo?.gtmId && GTM_RE.test(seo.gtmId)) {
    add('scriptSrc', 'https://www.googletagmanager.com');
    add('connectSrc', 'https://www.googletagmanager.com');
    add('imgSrc', 'https://www.googletagmanager.com');
    add('frameSrc', 'https://www.googletagmanager.com');
  }
  if (seo?.pixelId && PIXEL_RE.test(seo.pixelId)) {
    add('scriptSrc', 'https://connect.facebook.net');
    add('connectSrc', 'https://www.facebook.com', 'https://connect.facebook.net');
    add('imgSrc', 'https://www.facebook.com');
  }
  return ex;
}

export function buildRobotsTxt(seo, baseUrl) {
  if (seo?.indexing === 'noindex') return 'User-agent: *\nDisallow: /\n';
  const lines = ['User-agent: *', 'Allow: /'];
  for (const p of ['/admin', '/api/', '/install', '/auth/', '/login']) lines.push(`Disallow: ${p}`);
  if (baseUrl) lines.push('', `Sitemap: ${baseUrl}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

export function buildSitemapXml(paths, baseUrl) {
  const urls = [...new Set(paths.map(normalizePath))]
    .filter(p => !isPrivatePath(p))
    .map(p => `  <url><loc>${escapeXml(`${baseUrl}${p === '/' ? '/' : p}`)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
