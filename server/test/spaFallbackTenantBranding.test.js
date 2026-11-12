import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSpaFallback } from '../src/seo/http.js';
import { runWithTenant, getCurrentTenantId } from '../src/tenancy/context.js';

const INDEX_HTML = '<!doctype html><html><head><title>Default</title></head><body><div id="root"></div></body></html>';

function writeTempIndex() {
  const path = join(tmpdir(), `test-index-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(path, INDEX_HTML);
  return path;
}

/** Yalnız-send edilen yanıtlar: bare sendFile = kiracı markası hiç uygulanmamış demek. */
function fakeResponse() {
  let sentHtml = '';
  const res = {
    set: () => res,
    type: () => res,
    send: (content) => { sentHtml = content; },
    sendFile: () => { assert.fail('Should inject into HTML instead of bare sendFile'); },
  };
  return { res, html: () => sentHtml };
}

test('SPA fallback renders per-tenant title into index.html when SEO store is unconfigured', async () => {
  const tempIndex = join(tmpdir(), `test-index-${Date.now()}.html`);
  writeFileSync(tempIndex, '<!doctype html><html><head><title>Default</title></head><body><div id="root"></div></body></html>');

  const T1 = new mongoose.Types.ObjectId();
  const fallback = createSpaFallback({
    indexPath: tempIndex,
    store: {
      isConfigured: async () => false,
      get: async () => ({}),
    },
    getSiteName: async () => 'Custom Tenant Brand',
  });

  const req = { path: '/', get: () => 'tenant.example.com', headers: {} };
  let sentHtml = '';
  const res = {
    set: () => res,
    type: () => res,
    send: (content) => { sentHtml = content; },
    sendFile: () => { assert.fail('Should inject into HTML instead of bare sendFile'); },
  };

  try {
    await runWithTenant(T1, () => fallback(req, res, () => {}));
    assert.ok(sentHtml.includes('<title>Custom Tenant Brand</title>'));
    assert.ok(sentHtml.includes('property="og:site_name" content="Custom Tenant Brand"'));
  } finally {
    unlinkSync(tempIndex);
  }
});

test('SEO kaydı yokken başlık kiracı markasından gelir; iki kiracı aynı HTMLi paylaşmaz', async () => {
  const tempIndex = writeTempIndex();
  const T1 = new mongoose.Types.ObjectId();
  const T2 = new mongoose.Types.ObjectId();
  const names = { [String(T1)]: 'Alpha Bet', [String(T2)]: 'Beta Gaming' };
  const fallback = createSpaFallback({
    indexPath: tempIndex,
    store: { isConfigured: async () => false, get: async () => ({}) },
    getSiteName: async () => names[String(getCurrentTenantId())] || '',
  });

  const renderFor = (tenantId, host) => new Promise((resolve, reject) => {
    const page = fakeResponse();
    runWithTenant(tenantId, () =>
      fallback({ path: '/', get: () => host, headers: {} }, page.res, () => {}),
    ).then(() => resolve(page.html()), reject);
  });

  try {
    const [alpha, beta] = await Promise.all([
      renderFor(T1, 'alpha.example.com'),
      renderFor(T2, 'beta.example.com'),
    ]);
    assert.match(alpha, /<title>Alpha Bet<\/title>/);
    assert.match(alpha, /property="og:site_name" content="Alpha Bet"/);
    assert.doesNotMatch(alpha, /Beta Gaming/);
    assert.match(beta, /<title>Beta Gaming<\/title>/);
    assert.doesNotMatch(beta, /Alpha Bet/);
  } finally {
    unlinkSync(tempIndex);
  }
});

test('marka ayarı hiç yoksa başlık tarafsız kalır: çekirdek ürün adı üretmez', async () => {
  const tempIndex = writeTempIndex();
  const fallback = createSpaFallback({
    indexPath: tempIndex,
    store: { isConfigured: async () => false, get: async () => ({}) },
    getSiteName: async () => '',
  });
  const page = fakeResponse();

  try {
    await runWithTenant(new mongoose.Types.ObjectId(), () =>
      fallback({ path: '/', get: () => 'tenant.example.com', headers: {} }, page.res, () => {}));
    const html = page.html();
    assert.doesNotMatch(html, /vip90/i);
    assert.match(html, /<title>tenant\.example\.com<\/title>/);
    assert.match(html, /property="og:site_name" content="tenant\.example\.com"/);
  } finally {
    unlinkSync(tempIndex);
  }
});

test('SEO kaydı varsa ayarlı başlık kiracı markasına baskındır', async () => {
  const tempIndex = writeTempIndex();
  const fallback = createSpaFallback({
    indexPath: tempIndex,
    store: {
      isConfigured: async () => true,
      get: async () => ({ siteTitle: 'Tenant SEO Title', description: 'd' }),
    },
    getSiteName: async () => 'Custom Tenant Brand',
  });
  const page = fakeResponse();

  try {
    await runWithTenant(new mongoose.Types.ObjectId(), () =>
      fallback({ path: '/', get: () => 'tenant.example.com', headers: {} }, page.res, () => {}));
    const html = page.html();
    assert.match(html, /<title>Tenant SEO Title<\/title>/);
    assert.match(html, /property="og:title" content="Tenant SEO Title"/);
    assert.match(html, /property="og:site_name" content="Tenant SEO Title"/);
    assert.equal((html.match(/<title>/g) || []).length, 1);
  } finally {
    unlinkSync(tempIndex);
  }
});
