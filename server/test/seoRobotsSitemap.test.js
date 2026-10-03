import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSeoPublicRouter, FALLBACK_PUBLIC_ROUTES } from '../src/seo/http.js';
import { createSeoStore } from '../src/seo/store.js';

let values = null;
let usable = { betting: true, 'casino-content': true };
let staticRoutes = async () => ['/about', '/legal/terms', '/admin/secret'];
let server, base;

before(async () => {
  const store = createSeoStore({ load: async () => values, save: async () => {}, ttlMs: 0 });
  const app = express();
  app.use(createSeoPublicRouter({ store, getStaticRoutes: () => staticRoutes(), isModuleUsable: async id => usable[id] }));
  server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

describe('GET /robots.txt', () => {
  test('noindex açıkken her şeyi kapatır, sitemap göstermez', async () => {
    values = { indexing: 'noindex' };
    const body = await (await fetch(`${base}/robots.txt`)).text();
    assert.equal(body, 'User-agent: *\nDisallow: /\n');
  });

  test('index durumunda admin/api kapalı + Sitemap satırı (Host\'tan)', async () => {
    values = { indexing: 'index' };
    const res = await fetch(`${base}/robots.txt`);
    assert.match(res.headers.get('content-type'), /text\/plain/);
    const body = await res.text();
    assert.match(body, /Disallow: \/admin/);
    assert.match(body, /Disallow: \/api\//);
    assert.doesNotMatch(body, /^Disallow: \/$/m);
    assert.match(body, new RegExp(`Sitemap: ${base.replace(/\./g, '\\.')}/sitemap\\.xml`));
  });

  test('ayar kaydı hiç yokken de index davranışı', async () => {
    values = null;
    const body = await (await fetch(`${base}/robots.txt`)).text();
    assert.match(body, /Allow: \//);
  });

  test('canonicalBase varsa Sitemap satırı onu kullanır', async () => {
    values = { canonicalBase: 'https://vip90.bet' };
    const body = await (await fetch(`${base}/robots.txt`)).text();
    assert.match(body, /Sitemap: https:\/\/vip90\.bet\/sitemap\.xml/);
  });
});

describe('GET /sitemap.xml', () => {
  test('ana sayfa + açık modül rotaları + statik sayfalar; özel yollar yok', async () => {
    values = { canonicalBase: 'https://vip90.bet' };
    const res = await fetch(`${base}/sitemap.xml`);
    assert.match(res.headers.get('content-type'), /application\/xml/);
    const xml = await res.text();
    for (const p of ['/', '/bahis', '/canli', '/casino', '/about', '/legal/terms']) {
      assert.ok(xml.includes(`<loc>https://vip90.bet${p}</loc>`), p);
    }
    assert.ok(!xml.includes('/admin'));
  });

  test('kapalı modülün rotası sitemap\'te yok', async () => {
    values = { canonicalBase: 'https://vip90.bet' };
    usable = { betting: false, 'casino-content': true };
    const xml = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.ok(!xml.includes('/bahis') && !xml.includes('/canli'));
    assert.ok(xml.includes('/casino'));
    usable = { betting: true, 'casino-content': true };
  });

  test('canonicalBase yoksa isteğin host\'u kullanılır', async () => {
    values = {};
    const xml = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.ok(xml.includes(`<loc>${base}/</loc>`));
  });

  test('noindex iken 404', async () => {
    values = { indexing: 'noindex' };
    assert.equal((await fetch(`${base}/sitemap.xml`)).status, 404);
  });

  test('StaticPage okunamazsa yedek rota listesi', async () => {
    values = { canonicalBase: 'https://vip90.bet' };
    staticRoutes = async () => { throw new Error('db'); };
    const xml = await (await fetch(`${base}/sitemap.xml`)).text();
    for (const p of FALLBACK_PUBLIC_ROUTES) assert.ok(xml.includes(`https://vip90.bet${p}<`), p);
  });
});

describe('GET /api/seo (herkese açık)', () => {
  test('yalnız başlık alanlarını döner, kimlik/doğrulama kodu sızmaz', async () => {
    values = { siteTitle: 'S', titleTemplate: '{page} - {site}', ga4Id: 'G-ABCD1234', googleVerification: 'abcdefghij12' };
    const j = await (await fetch(`${base}/api/seo`)).json();
    assert.deepEqual(Object.keys(j.values).sort(), ['indexing', 'siteTitle', 'titleTemplate']);
    assert.equal(j.values.titleTemplate, '{page} - {site}');
  });
});
