/**
 * Service worker'ın SPA geri dönüşü (navigateFallback) sunucunun yanıtladığı
 * yolları yutmamalı: /api/auth/google gibi bağlantılar React'in 404 sayfasını
 * açıyordu (2026-10-08).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../vite.config.js'), 'utf8');
const m = src.match(/navigateFallbackDenylist:\s*(\[[^\n]*\])/);
const denylist = m ? new Function(`return ${m[1]}`)() : [];
const denied = path => denylist.some(re => re.test(path));

test('sunucu yolları SPA geri dönüşünden hariç', () => {
  for (const p of ['/api/auth/google', '/api/auth/google/callback', '/install', '/uploads/kyc/a.png', '/sitemap.xml', '/robots.txt']) {
    assert.equal(denied(p), true, p);
  }
});

test('uygulama sayfaları SPA geri dönüşünde kalır', () => {
  for (const p of ['/', '/login', '/casino', '/profile', '/admin/users', '/installments']) {
    assert.equal(denied(p), false, p);
  }
});
