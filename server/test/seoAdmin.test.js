import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createSeoAdminRouter } from '../src/routes/seoAdmin.js';
import { createSeoStore } from '../src/seo/store.js';
import { seoSettingsSchema, extractVerificationCode } from '../src/seo/schema.js';
import { errorHandler } from '../src/middleware/error.js';

let rows, perms, server, base;

before(async () => {
  const store = createSeoStore({
    load: async () => rows, save: async (v) => { rows = v; }, ttlMs: 0,
  });
  // Gerçek requirePermission DB'ye gider; aynı sözleşmeyi (403) taklit eden stub.
  const requirePermission = key => (req, res, next) =>
    (perms.has(key) ? next() : res.status(403).json({ error: { code: 'FORBIDDEN', message: `Yetki yok: ${key}` } }));
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { id: 'a1', role: 'admin' }; next(); });
  app.use('/api/admin/settings/seo', createSeoAdminRouter({ store, requirePermission }));
  app.use(errorHandler);
  server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}/api/admin/settings/seo`;
});
after(() => server.close());

const put = body => fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('admin SEO uçları', () => {
  test('yetkisiz: GET ve PUT 403', async () => {
    rows = null; perms = new Set();
    assert.equal((await fetch(base)).status, 403);
    assert.equal((await put({ siteTitle: 'x' })).status, 403);
    perms = new Set(['admin:settings:read']);
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await put({ siteTitle: 'x' })).status, 403);
    assert.equal(rows, null);
  });

  test('geçersiz biçimler 400', async () => {
    perms = new Set(['admin:settings:read', 'admin:settings:write']);
    const bad = [
      { ga4Id: 'UA-1234' }, { ga4Id: "G-AB');alert(1)" }, { gtmId: 'GTM-' }, { gtmId: 'G-ABCD1234' },
      { pixelId: 'abc' }, { pixelId: '12' }, { canonicalBase: 'javascript:alert(1)' }, { canonicalBase: 'not a url' },
      { indexing: 'maybe' }, { twitterCard: 'player' }, { ogImage: 'javascript:alert(1)' }, { ogImage: '//evil.com/a.png' },
      { siteTitle: 'x'.repeat(121) }, { description: 'x'.repeat(321) }, { titleTemplate: 'sabit başlık' },
      { googleVerification: 'kısa' }, { twitterHandle: 'çok uzun kullanıcı adı!!!' }, { unknownField: 'x' },
    ];
    for (const b of bad) assert.equal((await put(b)).status, 400, JSON.stringify(b));
    assert.equal(rows, null);
  });

  test('geçerli kayıt: normalizasyon + kısmi güncelleme + GET', async () => {
    perms = new Set(['admin:settings:read', 'admin:settings:write']);
    let res = await put({
      siteTitle: ' VIP90 ', ga4Id: 'g-abcd1234', gtmId: 'gtm-abc123', pixelId: '123456789',
      canonicalBase: 'https://vip90.bet/some/path?x=1', twitterHandle: '@vip90', indexing: 'noindex',
      googleVerification: '<meta name="google-site-verification" content="abcdEFGH12345" />',
    });
    assert.equal(res.status, 200);
    const { settings } = await res.json();
    assert.equal(settings.siteTitle, 'VIP90');
    assert.equal(settings.ga4Id, 'G-ABCD1234');
    assert.equal(settings.gtmId, 'GTM-ABC123');
    assert.equal(settings.canonicalBase, 'https://vip90.bet');
    assert.equal(settings.twitterHandle, 'vip90');
    assert.equal(settings.googleVerification, 'abcdEFGH12345');
    // kısmi: yalnız bir alan değişir
    res = await put({ ga4Id: '' });
    const s2 = (await res.json()).settings;
    assert.equal(s2.ga4Id, '');
    assert.equal(s2.gtmId, 'GTM-ABC123');
    const got = (await (await fetch(base)).json()).settings;
    assert.equal(got.indexing, 'noindex');
  });

  test('kayıt sonrası önbellek geçersiz kılınır (TTL uzun olsa da)', async () => {
    let db = null;
    const store = createSeoStore({ load: async () => db, save: async v => { db = v; }, ttlMs: 60_000 });
    assert.equal(await store.isConfigured(), false);
    await store.update({ siteTitle: 'Yeni' });
    assert.equal(await store.isConfigured(), true);
    assert.equal((await store.get()).siteTitle, 'Yeni');
  });
});

describe('şema yardımcıları', () => {
  test('extractVerificationCode', () => {
    assert.equal(extractVerificationCode('abc123'), 'abc123');
    assert.equal(extractVerificationCode(`<meta name='msvalidate.01' content='ABCDEF123456' />`), 'ABCDEF123456');
    assert.equal(extractVerificationCode('<meta name="yandex-verification" content="1234abcd5678" />'), '1234abcd5678');
    assert.equal(extractVerificationCode('<meta name="x">'), '');
  });

  test('boş string alanı temizler (geçerli)', () => {
    const r = seoSettingsSchema.safeParse({ ga4Id: '', gtmId: '', pixelId: '', canonicalBase: '', ogImage: '', googleVerification: '' });
    assert.equal(r.success, true);
  });
});
