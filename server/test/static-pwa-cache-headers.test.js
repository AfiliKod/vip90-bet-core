/**
 * PWA service-worker dosyalarının cache header'ları (app.js § production
 * static serving) — 2026-09-17'de prod'da bulunan bir bug'ın regresyon testi.
 *
 * Kök neden: client/dist kökündeki TÜM dosyalar (assets/ altındakiler dahil)
 * aynı express.static middleware'i üzerinden `maxAge: '1y', immutable: true`
 * ile serve ediliyordu. /assets/*.js|css için bu doğru (Vite içerik-hash
 * ekliyor), ama sw.js/registerSW.js/workbox-*.js/manifest.webmanifest için
 * YANLIŞ — bunlar her deploy'da AYNI URL'de farklı içerikle geliyor. Sonuç:
 * Cloudflare sw.js'i "immutable" görüp haftalarca HIT'lemeye devam etti,
 * PWA'nın kendi 'autoUpdate' mekanizması hiç tetiklenemedi (sert yenileme/
 * sekme kapatma bile çözmüyordu, çünkü tarayıcı sw.js'in DEĞİŞMEDİĞİNİ
 * düşünüyordu — gerçekte hiç yeni sw.js görmüyordu).
 *
 * Bu test, gerçek app.js'i (isProd/client build şartlarını taklit etmek
 * yerine) değil, aynı middleware yapılandırmasını bağımsız bir Express
 * örneğinde kuruyor — production build'i gerektirmeden setHeaders mantığını
 * doğrudan doğrular.
 *
 * Çalıştırmak için: node --test test/static-pwa-cache-headers.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// app.js'teki blokla BİREBİR aynı yapılandırma — orada değişirse bu test de
// güncellenmeli.
function mountClientStatic(app, clientDist) {
  app.use(express.static(clientDist, {
    maxAge: '1y',
    immutable: true,
    index: false,
    setHeaders: (res, filePath) => {
      if (/[/\\](sw\.js|registerSW\.js|workbox-[^/\\]+\.js|manifest\.webmanifest)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
}

describe('Production static serving — PWA dosyaları immutable cache almamalı', () => {
  let clientDist;
  let server;
  let baseUrl;

  before(async () => {
    clientDist = mkdtempSync(join(tmpdir(), 'client-dist-test-'));
    writeFileSync(join(clientDist, 'sw.js'), '// service worker');
    writeFileSync(join(clientDist, 'registerSW.js'), '// register sw');
    writeFileSync(join(clientDist, 'workbox-abcd1234.js'), '// workbox runtime');
    writeFileSync(join(clientDist, 'manifest.webmanifest'), '{}');
    writeFileSync(join(clientDist, 'index.html'), '<html></html>');
    const assetsDir = join(clientDist, 'assets');
    mkdirSync(assetsDir);
    writeFileSync(join(assetsDir, 'index-abc123.js'), '// hashed bundle');

    const app = express();
    mountClientStatic(app, clientDist);
    server = app.listen(0);
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(() => {
    server.close();
    rmSync(clientDist, { recursive: true, force: true });
  });

  it('sw.js: no-cache alır (immutable/1y DEĞİL)', async () => {
    const res = await fetch(`${baseUrl}/sw.js`);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
  });

  it('registerSW.js: no-cache alır', async () => {
    const res = await fetch(`${baseUrl}/registerSW.js`);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
  });

  it('workbox-*.js: no-cache alır (hash suffixli olsa da)', async () => {
    const res = await fetch(`${baseUrl}/workbox-abcd1234.js`);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
  });

  it('manifest.webmanifest: no-cache alır', async () => {
    const res = await fetch(`${baseUrl}/manifest.webmanifest`);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
  });

  it('içerik-hash\'li /assets/*.js dosyaları hâlâ 1 yıllık immutable cache alır (regresyon değil)', async () => {
    const res = await fetch(`${baseUrl}/assets/index-abc123.js`);
    const cc = res.headers.get('cache-control');
    assert.match(cc, /immutable/);
    assert.match(cc, /max-age=31536000/);
  });
});
