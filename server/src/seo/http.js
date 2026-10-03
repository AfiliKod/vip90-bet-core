/**
 * SEO'nun HTTP katmanı: robots/sitemap, herkese açık ayar ucu, SPA fallback
 * (head enjeksiyonu) ve dinamik CSP. Bağımlılıklar enjekte edilir (testte mock).
 */
import { Router } from 'express';
import helmet from 'helmet';
import { readFile } from 'fs/promises';
import { seoStore } from './store.js';
import {
  buildSeoTags, injectIntoHtml, seoCspExtras, buildRobotsTxt, buildSitemapXml,
  resolveBaseUrl, isPrivatePath,
} from './render.js';

/** Sitemap'te her zaman bulunan çekirdek rotalar (modül açıksa). */
const CORE_ROUTES = [
  { path: '/', module: null },
  { path: '/bahis', module: 'betting' },
  { path: '/canli', module: 'betting' },
  { path: '/casino', module: 'casino-content' },
];

/** StaticPage tablosu okunamazsa kullanılan, App.jsx'te var olan herkese açık sayfalar. */
export const FALLBACK_PUBLIC_ROUTES = [
  '/about', '/career', '/press', '/contact',
  '/legal/terms', '/legal/user-agreement', '/legal/privacy', '/legal/kvkk',
  '/legal/cookies', '/legal/bonus-terms', '/legal/responsible-gaming',
];

async function defaultStaticRoutes() {
  const { getPublicPageList } = await import('../services/staticPages.js');
  const pages = await getPublicPageList();
  return pages.map(p => p.route).filter(Boolean);
}

async function defaultIsModuleUsable(id) {
  const { isModuleUsable } = await import('../services/licensing/index.js');
  return isModuleUsable(id);
}

export function createSeoPublicRouter({
  store = seoStore,
  getStaticRoutes = defaultStaticRoutes,
  isModuleUsable = defaultIsModuleUsable,
} = {}) {
  const r = Router();

  r.get('/robots.txt', async (req, res, next) => {
    try {
      const seo = await store.get();
      res.set('Cache-Control', 'public, max-age=300');
      res.type('text/plain').send(buildRobotsTxt(seo, resolveBaseUrl(seo, req)));
    } catch (e) { next(e); }
  });

  r.get('/sitemap.xml', async (req, res, next) => {
    try {
      const seo = await store.get();
      const base = resolveBaseUrl(seo, req);
      if (seo.indexing === 'noindex' || !base) return res.status(404).type('text/plain').send('Not found');
      const paths = [];
      for (const c of CORE_ROUTES) {
        let ok = true;
        if (c.module) { try { ok = await isModuleUsable(c.module); } catch { ok = true; } }
        if (ok) paths.push(c.path);
      }
      let statics;
      try { statics = await getStaticRoutes(); } catch { statics = FALLBACK_PUBLIC_ROUTES; }
      paths.push(...statics.filter(p => typeof p === 'string' && p.startsWith('/') && !isPrivatePath(p)));
      res.set('Cache-Control', 'public, max-age=3600');
      res.type('application/xml').send(buildSitemapXml(paths, base));
    } catch (e) { next(e); }
  });

  // Oyuncu istemcisinin okuduğu, hassas olmayan alt küme (başlık şablonu).
  r.get('/api/seo', async (req, res, next) => {
    try {
      const s = await store.get();
      res.set('Cache-Control', 'public, max-age=30');
      res.json({ values: { siteTitle: s.siteTitle, titleTemplate: s.titleTemplate, indexing: s.indexing } });
    } catch (e) { next(e); }
  });

  return r;
}

/**
 * SPA fallback: index.html bellekte tutulur; ayar kaydı varsa etiketler enjekte
 * edilir. Ayar yoksa (ya da okuma hata verirse) sade index.html aynen servis edilir.
 */
export function createSpaFallback({ indexPath, store = seoStore, getSiteName = async () => '' }) {
  let rawPromise = null;
  const raw = () => (rawPromise ||= readFile(indexPath, 'utf8').catch(e => { rawPromise = null; throw e; }));

  return async function spaFallback(req, res, next) {
    try {
      let seoConfigured = false;
      let seo;
      try { seoConfigured = await store.isConfigured(); if (seoConfigured) seo = await store.get(); } catch { /* sade index */ }
      if (!seoConfigured) return res.sendFile(indexPath);
      const html = await raw();
      const siteName = await getSiteName().catch(() => '');
      const tags = buildSeoTags(seo, { path: req.path, baseUrl: resolveBaseUrl(seo, req), siteName });
      res.set('Cache-Control', 'no-cache');
      res.type('html').send(injectIntoHtml(html, tags));
    } catch (e) { next(e); }
  };
}

const BASE_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", 'https://challenges.cloudflare.com'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  imgSrc: ["'self'", 'data:', 'https:'],
  fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
  connectSrc: ["'self'", 'wss:'],
  frameSrc: ["'self'", 'https://*'],
  frameAncestors: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
};

/** Temel CSP + ayarlı kimliklerin gerektirdiği alan adları. */
export function buildCspDirectives(seo) {
  const extras = seoCspExtras(seo);
  const d = {};
  for (const [k, v] of Object.entries(BASE_DIRECTIVES)) d[k] = [...v];
  for (const [k, list] of Object.entries(extras)) {
    for (const x of list) if (!d[k].includes(x)) d[k].push(x);
  }
  return d;
}

const helmetOptions = csp => ({
  contentSecurityPolicy: csp,
  crossOriginEmbedderPolicy: false,
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false,
});

/**
 * helmet middleware'i. Dev'de CSP kapalı (HMR). Prod'da SEO ayarına göre CSP
 * istek başına seçilir; helmet örnekleri kimlik kombinasyonuna göre önbelleklenir
 * (en çok 8 farklı örnek). /api istekleri ek alan adı almaz (JSON yanıtlar).
 */
export function createSecurityHeaders({ isProd, store = seoStore } = {}) {
  if (!isProd) return helmet(helmetOptions(false));
  const cache = new Map();
  const forSeo = seo => {
    const d = buildCspDirectives(seo);
    const key = JSON.stringify(d);
    if (!cache.has(key)) cache.set(key, helmet(helmetOptions({ directives: d })));
    return cache.get(key);
  };
  return async (req, res, next) => {
    let seo = null;
    if (!req.path.startsWith('/api/')) {
      try { seo = await store.get(); } catch { /* ek alan adı yok */ }
    }
    forSeo(seo)(req, res, next);
  };
}
