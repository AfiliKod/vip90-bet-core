/**
 * PWA manifest'i artık build'de üretilmez: `/manifest.webmanifest` sunucudan
 * gelir (tek modda ayarlar, çok modda istek host'unun operatörü). Build sabit
 * bir manifest üretir ve service worker onu precache'lerse kurulan uygulama
 * kiracının manifest'ini hiç görmez. Bu testler yapılandırmayı, index.html
 * bağlantısını ve (varsa) gerçek `dist/sw.js` precache listesini denetler.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { assertPwaBuild, extractPrecacheUrls } from './pwa-build-check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(HERE, '../../vite.config.js');
const INDEX = join(HERE, '../../index.html');
const DIST = join(HERE, '../../dist');

const SW_OK = 'precacheAndRoute([{url:"index.html",revision:"a"},{url:"icons/icon-192x192.png",revision:"b"}]);';

function makeDist({ sw = SW_OK, icons = ['icon-192x192.png'], extraManifest = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pwa-build-check-'));
  writeFileSync(join(dir, 'sw.js'), sw);
  if (icons.length) {
    mkdirSync(join(dir, 'icons'));
    for (const icon of icons) writeFileSync(join(dir, 'icons', icon), '');
  }
  if (extraManifest) writeFileSync(join(dir, 'manifest.webmanifest'), '{}');
  return dir;
}

describe('PWA manifest yapılandırması', () => {
  test('vite.config.js build sırasında manifest üretmiyor', () => {
    const src = readFileSync(CONFIG, 'utf8');
    assert.match(src, /manifest:\s*false/);
    assert.equal(/short_name\s*:/.test(src), false, 'sabit manifest alanları kalmamalı');
    assert.equal(/theme_color\s*:/.test(src), false, 'sabit manifest alanları kalmamalı');
  });

  test('index.html sunucunun manifest rotasına bağlanıyor', () => {
    const html = readFileSync(INDEX, 'utf8');
    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/);
  });

  test('precache desenleri ikonları kapsıyor, webmanifest üretmiyor', () => {
    const src = readFileSync(CONFIG, 'utf8');
    const globPatterns = src.match(/globPatterns:\s*\[([^\]]+)\]/)[1];
    assert.match(globPatterns, /png/);
    assert.match(globPatterns, /html/);
    assert.equal(globPatterns.includes('webmanifest'), false);
  });
});

describe('extractPrecacheUrls', () => {
  test('tek ve çift tırnaklı url girişlerini okur', () => {
    assert.deepEqual(
      extractPrecacheUrls('precacheAndRoute([{url:"a.js",revision:"1"},{url:\'b.css\',revision:\'2\'}])'),
      ['a.js', 'b.css'],
    );
  });

  test('precache bloğu yoksa boş dizi', () => {
    assert.deepEqual(extractPrecacheUrls('self.addEventListener("install", () => {});'), []);
  });
});

describe('assertPwaBuild', () => {
  test('geçerli build geçer', () => {
    const dir = makeDist();
    try {
      const out = assertPwaBuild({ distDir: dir });
      assert.deepEqual(out.urls, ['index.html', 'icons/icon-192x192.png']);
      assert.equal(out.icons, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('webmanifest precache edilirse hata verir', () => {
    const dir = makeDist({
      sw: 'precacheAndRoute([{url:"index.html",revision:"a"},{url:"manifest.webmanifest",revision:"b"}]);',
    });
    try {
      assert.throws(() => assertPwaBuild({ distDir: dir }), /manifest precache'te olmamalı/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('build sabit manifest dosyası üretirse hata verir', () => {
    const dir = makeDist({ extraManifest: true });
    try {
      assert.throws(() => assertPwaBuild({ distDir: dir }), /manifest: false olmalı/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('ikon precache edilmezse hata verir', () => {
    const dir = makeDist({ icons: ['icon-512x512.png'] });
    try {
      assert.throws(() => assertPwaBuild({ distDir: dir }), /ikonlar precache'te eksik/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('service worker yoksa hata verir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pwa-build-check-'));
    try {
      assert.throws(() => assertPwaBuild({ distDir: dir }), /service worker yok/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('gerçek build varsa precache listesi temiz', t => {
    if (!existsSync(join(DIST, 'sw.js'))) {
      t.skip('client/dist yok — build sonrası pwa-build-check çalışır');
      return;
    }
    assert.doesNotThrow(() => assertPwaBuild());
  });
});
