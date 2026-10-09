/**
 * Service worker navigate fallback'inin rota tablosunu kullanması:
 * SW **yalnız gerçek uygulama rotalarını** index.html'e düşürür, geri kalan
 * her şey ağa gider. Böylece SPA'nın gerçek 404'ü
 * (`server/src/seo/http.js` + `client/dist/routes.json`) SW kurulu tarayıcıda
 * da 404 kalır — 2026-10-08'de yalnız sunucu yollarını reddeden denylist
 * bilinmeyen uygulama yollarını 200'e çeviriyordu (Playwright ile doğrulandı).
 *
 * Allowlist `App.jsx`'ten build sırasında türetilir
 * (`scripts/pwa-route-allowlist.mjs`), elle tutulan bir liste yoktur.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildNavigateAllowlist, routePatternToRegExp, appNavigateAllowlist } from '../pwa-route-allowlist.mjs';

const CONFIG = join(dirname(fileURLToPath(import.meta.url)), '../../vite.config.js');
const allowlist = appNavigateAllowlist();
const [allow] = allowlist;
const servedBySW = path => allow.test(path);

/** Workbox eşleştirmeyi `pathname + search` üzerinde yapar. */
describe('SW navigate allowlist (gerçek App.jsx tablosu)', () => {
  test('allowlist boş değil ve joker içermiyor', () => {
    assert.equal(allowlist.length, 1);
    assert.ok(allow instanceof RegExp);
    assert.ok(allow.source.length > 200, `şüpheli derecede kısa regex: ${allow.source.length}`);
    assert.equal(allow.source.includes('*'), false, 'joker kastedilen bir eşleşme üretir');
  });

  test('uygulama rotaları SW’den servis edilir', () => {
    for (const p of ['/', '/?x=1', '/bahis', '/bahis/', '/bahis?x=1', '/canli', '/casino',
      '/events/123', '/igames/abc?x=1', '/games/crash', '/admin', '/admin/',
      '/admin/users', '/admin/platform?tab=seo', '/legal/terms', '/about', '/login',
      '/auth/callback', '/forgot-password', '/verify-email']) {
      assert.equal(servedBySW(p), true, p);
    }
  });

  test('sunucu yolları ağa gider (SW araya girmez)', () => {
    for (const p of ['/api/health', '/api/auth/google', '/api/auth/google/callback',
      '/install', '/uploads/kyc/a.png', '/robots.txt', '/sitemap.xml',
      '/assets/index-abc123.js', '/favicon.ico', '/sw.js', '/manifest.webmanifest']) {
      assert.equal(servedBySW(p), false, p);
    }
  });

  test('rota tablosunda olmayan yollar ağa gider → sunucunun 404’ü geçerli', () => {
    for (const p of ['/olmayansayfa', '/admin/yok-boyle', '/events/1/2', '/bahis/ek',
      '/legal/yok', '/bahisx', '/ADMIN']) {
      assert.equal(servedBySW(p), false, p);
    }
  });

  test('vite.config.js allowlist’i build’de kullanıyor (denylist seçeneği kalmadı)', () => {
    const src = readFileSync(CONFIG, 'utf8');
    assert.match(src, /navigateFallbackAllowlist:\s*appNavigateAllowlist\(\)/);
    assert.equal(/navigateFallbackDenylist\s*:/.test(src), false);
  });
});

describe('buildNavigateAllowlist / routePatternToRegExp', () => {
  test('tek desen: :param tek segment, sonra yalnız trailing slash/query', () => {
    const re = routePatternToRegExp('/events/:id');
    assert.ok(re.test('/events/123'));
    assert.ok(re.test('/events/123?x=1'));
    assert.ok(re.test('/events/123/'));
    assert.equal(re.test('/events/1/2'), false);
    assert.equal(re.test('/events/'), false);
  });

  test('özel karakterler joker değildir', () => {
    assert.ok(routePatternToRegExp('/legal/bonus-terms').test('/legal/bonus-terms'));
    assert.equal(routePatternToRegExp('/legal/bonus-terms').test('/legal/bonusXterms'), false);
  });

  test('kök rota: /, /?x ve //', () => {
    const [re] = buildNavigateAllowlist(['/']);
    assert.ok(re.test('/'));
    assert.ok(re.test('/?x=1'));
    assert.ok(re.test('//'));
    assert.equal(re.test('/bahis'), false);
  });

  test('boş rota listesi build’i düşürür (sessizce boş allowlist olmaz)', () => {
    assert.throws(() => buildNavigateAllowlist([]), /rota listesi boş/);
    assert.throws(() => buildNavigateAllowlist(null), /rota listesi boş/);
  });
});