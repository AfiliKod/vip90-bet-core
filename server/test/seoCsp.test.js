import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildCspDirectives, createSecurityHeaders } from '../src/seo/http.js';
import { createSeoStore } from '../src/seo/store.js';
import { SEO_DEFAULTS } from '../src/seo/schema.js';

const seo = o => ({ ...SEO_DEFAULTS, ...o });
const allHosts = d => Object.values(d).flat().filter(x => /^https:/.test(x));
const BASE_HOSTS = ['https://challenges.cloudflare.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://*', 'https:'];

describe('buildCspDirectives', () => {
  test('kimlik yokken analytics alan adı yok', () => {
    const hosts = allHosts(buildCspDirectives(seo()));
    assert.ok(!hosts.some(h => /googletagmanager|google-analytics|facebook/.test(h)));
    assert.deepEqual(buildCspDirectives(null), buildCspDirectives(seo()));
    for (const h of hosts) assert.ok(BASE_HOSTS.includes(h) || h === 'https:', h);
  });

  test('GA4: googletagmanager + google-analytics (script/connect/img)', () => {
    const d = buildCspDirectives(seo({ ga4Id: 'G-ABCD1234' }));
    assert.ok(d.scriptSrc.includes('https://www.googletagmanager.com'));
    assert.ok(d.connectSrc.includes('https://www.google-analytics.com'));
    assert.ok(d.connectSrc.includes('https://*.google-analytics.com'));
    assert.ok(d.imgSrc.includes('https://*.google-analytics.com'));
    assert.ok(!allHosts(d).some(h => /facebook/.test(h)));
  });

  test('GTM: yalnız googletagmanager', () => {
    const d = buildCspDirectives(seo({ gtmId: 'GTM-ABCD12' }));
    assert.ok(d.scriptSrc.includes('https://www.googletagmanager.com'));
    assert.ok(!allHosts(d).some(h => /google-analytics|facebook/.test(h)));
  });

  test('Meta Pixel: connect.facebook.net + www.facebook.com', () => {
    const d = buildCspDirectives(seo({ pixelId: '123456789' }));
    assert.ok(d.scriptSrc.includes('https://connect.facebook.net'));
    assert.ok(d.connectSrc.includes('https://www.facebook.com'));
    assert.ok(!allHosts(d).some(h => /googletagmanager|google-analytics/.test(h)));
  });

  test('geçersiz kimlik alan adı eklemez', () => {
    const d = buildCspDirectives(seo({ ga4Id: 'bogus', gtmId: 'x', pixelId: 'abc' }));
    assert.ok(!allHosts(d).some(h => /googletagmanager|google-analytics|facebook/.test(h)));
  });

  test('çıktı tekrarsız', () => {
    const d = buildCspDirectives(seo({ ga4Id: 'G-ABCD1234', gtmId: 'GTM-ABCD12' }));
    assert.equal(new Set(d.scriptSrc).size, d.scriptSrc.length);
  });
});

describe('createSecurityHeaders (prod)', () => {
  async function boot(values) {
    const store = createSeoStore({ load: async () => values, save: async () => {}, ttlMs: 0 });
    const app = express();
    app.use(createSecurityHeaders({ isProd: true, store }));
    app.get('*', (req, res) => res.send('ok'));
    const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
    return { server, base: `http://127.0.0.1:${server.address().port}` };
  }

  test('kimlik yokken header\'da ek alan adı yok; girilince var; /api ek almaz', async () => {
    let b = await boot(null);
    let csp = (await fetch(`${b.base}/`)).headers.get('content-security-policy');
    b.server.close();
    assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/challenges\.cloudflare\.com;/);
    assert.doesNotMatch(csp, /googletagmanager|google-analytics|facebook/);

    b = await boot({ ga4Id: 'G-ABCD1234', pixelId: '123456789' });
    csp = (await fetch(`${b.base}/`)).headers.get('content-security-policy');
    assert.match(csp, /googletagmanager\.com/);
    assert.match(csp, /\*\.google-analytics\.com/);
    assert.match(csp, /connect\.facebook\.net/);
    const apiCsp = (await fetch(`${b.base}/api/x`)).headers.get('content-security-policy');
    b.server.close();
    assert.doesNotMatch(apiCsp, /googletagmanager|facebook/);
  });

  test('dev\'de CSP kapalı', async () => {
    const app = express();
    app.use(createSecurityHeaders({ isProd: false }));
    app.get('/', (req, res) => res.send('ok'));
    const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
    server.close();
    assert.equal(res.headers.get('content-security-policy'), null);
  });
});
