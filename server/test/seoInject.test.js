import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildSeoTags, injectIntoHtml, escapeHtml } from '../src/seo/render.js';
import { createSpaFallback } from '../src/seo/http.js';
import { createSeoStore } from '../src/seo/store.js';
import { SEO_DEFAULTS, sanitizeStored } from '../src/seo/schema.js';

const INDEX = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="description" content="eski">\n    <title>VIP90.bet</title>\n  </head>\n  <body>\n    <div id="root"></div>\n  </body>\n</html>\n';
const seo = (o = {}) => ({ ...SEO_DEFAULTS, ...o });
const render = (o, ctx = {}) => injectIntoHtml(INDEX, buildSeoTags(seo(o), { path: '/', baseUrl: 'https://vip90.bet', ...ctx }));

describe('buildSeoTags / injectIntoHtml', () => {
  test('temel etiketler doğru üretilir, eski title/description yerine geçer', () => {
    const html = render({
      siteTitle: 'VIP90 Bahis', description: 'En iyi oranlar', keywords: 'bahis, casino',
      ogImage: '/og.png', ogSiteName: 'VIP90', twitterHandle: 'vip90', twitterCard: 'summary_large_image',
    });
    assert.match(html, /<title>VIP90 Bahis<\/title>/);
    assert.equal((html.match(/<title>/g) || []).length, 1);
    assert.equal((html.match(/name="description"/g) || []).length, 1);
    assert.match(html, /<meta name="description" content="En iyi oranlar">/);
    assert.match(html, /<meta name="keywords" content="bahis, casino">/);
    assert.match(html, /<meta name="robots" content="index, follow">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/vip90.bet\/">/);
    assert.match(html, /property="og:image" content="https:\/\/vip90.bet\/og.png"/);
    assert.match(html, /property="og:url" content="https:\/\/vip90.bet\/"/);
    assert.match(html, /property="og:site_name" content="VIP90"/);
    assert.match(html, /property="og:type" content="website"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /name="twitter:site" content="@vip90"/);
  });

  test('canonical istek yoluna göre; özel yollar noindex ve canonical yok', () => {
    const t = buildSeoTags(seo({ siteTitle: 'X' }), { path: '/legal/terms/?a=1', baseUrl: 'https://vip90.bet' });
    assert.match(t.head, /href="https:\/\/vip90.bet\/legal\/terms"/);
    const p = buildSeoTags(seo({ siteTitle: 'X' }), { path: '/admin/users', baseUrl: 'https://vip90.bet' });
    assert.match(p.head, /noindex, nofollow/);
    assert.doesNotMatch(p.head, /rel="canonical"/);
  });

  test('noindex ayarı robots meta\'ya yansır', () => {
    assert.match(render({ siteTitle: 'X', indexing: 'noindex' }), /content="noindex, nofollow"/);
  });

  test('doğrulama meta\'ları yalnız girilince', () => {
    const none = render({ siteTitle: 'X' });
    assert.doesNotMatch(none, /site-verification|msvalidate|yandex-verification/);
    const html = render({ googleVerification: 'abcdEFGH1234', bingVerification: 'BING1234567890', yandexVerification: 'yan_dex-12345' });
    assert.match(html, /name="google-site-verification" content="abcdEFGH1234"/);
    assert.match(html, /name="msvalidate.01" content="BING1234567890"/);
    assert.match(html, /name="yandex-verification" content="yan_dex-12345"/);
  });

  test('değerler HTML kaçışlı: "><script> içeren başlık/açıklama zararsız', () => {
    const evil = '"><script>alert(1)</script>';
    const html = render({ siteTitle: evil, description: evil, keywords: evil, ogSiteName: evil, ogImage: '/a.png' });
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.doesNotMatch(html, /"><script>/);
    assert.match(html, /&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  });

  test('geçersiz kimlikler script üretmez (render katmanı savunması)', () => {
    const html = render({
      siteTitle: 'X',
      ga4Id: "G-ABCD');alert(1);//", gtmId: 'GTM-"><img src=x>', pixelId: "1');alert(1);//",
      googleVerification: '"><script>x</script>',
    });
    assert.doesNotMatch(html, /googletagmanager|fbevents|gtag|fbq|alert\(1\)|<img src=x>/);
    assert.doesNotMatch(html, /site-verification/);
  });

  test('geçerli kimlikler snippet üretir', () => {
    const html = render({ ga4Id: 'G-ABC123XYZ9', gtmId: 'GTM-ABCD123', pixelId: '123456789012345' });
    assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-ABC123XYZ9/);
    assert.match(html, /gtag\('config','G-ABC123XYZ9'\)/);
    assert.match(html, /'dataLayer','GTM-ABCD123'/);
    assert.match(html, /<body[^>]*><noscript><iframe src="https:\/\/www\.googletagmanager\.com\/ns\.html\?id=GTM-ABCD123"/);
    assert.match(html, /fbq\('init','123456789012345'\)/);
  });

  test('kimlik girilmediyse analytics snippet yok', () => {
    assert.doesNotMatch(render({ siteTitle: 'X' }), /googletagmanager|facebook|<script/);
  });

  test('host doğrulanamazsa (baseUrl null) canonical/og:url üretilmez', () => {
    const t = buildSeoTags(seo({ siteTitle: 'X' }), { path: '/', baseUrl: null });
    assert.doesNotMatch(t.head, /canonical|og:url/);
  });
});

describe('saklanan değer temizliği', () => {
  test('DB\'deki geçersiz alan varsayılana düşer', () => {
    const s = sanitizeStored({ ga4Id: "G-X');alert(1)", siteTitle: 'Ok', indexing: 'weird' });
    assert.equal(s.ga4Id, '');
    assert.equal(s.siteTitle, 'Ok');
    assert.equal(s.indexing, 'index');
  });
});

describe('SPA fallback', () => {
  let dir, server, base, configured, values;
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'seo-index-'));
    writeFileSync(join(dir, 'index.html'), INDEX);
    const store = createSeoStore({ load: async () => (configured ? values : null), save: async () => {}, ttlMs: 0 });
    const app = express();
    app.get('*', createSpaFallback({ indexPath: join(dir, 'index.html'), store, getSiteName: async () => 'Marka' }));
    server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

  test('ayar kaydı yoksa sade index.html (değişmeden) servis edilir', async () => {
    configured = false;
    const body = await (await fetch(`${base}/casino`)).text();
    assert.equal(body, INDEX);
  });

  test('ayar varsa etiketler enjekte edilir; Host canonical\'a yansır', async () => {
    configured = true; values = { siteTitle: 'Canlı Site', description: 'd' };
    const body = await (await fetch(`${base}/casino?x=1`)).text();
    assert.match(body, /<title>Canlı Site<\/title>/);
    assert.match(body, new RegExp(`rel="canonical" href="${base.replace(/\./g, '\\.')}/casino"`));
  });

  test('canonicalBase ayarı Host\'a baskındır', async () => {
    configured = true; values = { siteTitle: 'S', canonicalBase: 'https://vip90.bet' };
    const body = await (await fetch(`${base}/bahis`)).text();
    assert.match(body, /href="https:\/\/vip90\.bet\/bahis"/);
  });
});
