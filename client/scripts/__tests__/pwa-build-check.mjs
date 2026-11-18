/**
 * Build çıktısındaki PWA service worker'ını denetler.
 *
 * `/manifest.webmanifest`'i SUNUCU üretir (İP-8: tek modda ayarlardaki site
 * adı, çok modda istek host'unun operatörü). Build sırasında üretilen sabit
 * manifest ve onun precache kaydı kiracının kendi manifest'ini gölgeliyordu;
 * bu betik regresyonu build'i kırarak engeller. `npm run build` (client)
 * son adım olarak çalıştırır; birim testleri de aynı fonksiyonları kullanır.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_DIST = join(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Workbox'un precache listesindeki url'leri ayıklar. */
export function extractPrecacheUrls(swSource) {
  return [...swSource.matchAll(/url:\s*["']([^"']+)["']/g)].map(m => m[1]);
}

/** Build çıktısını denetler; sorun varsa hata fırlatır, yoksa özet döner. */
export function assertPwaBuild({ distDir = DEFAULT_DIST } = {}) {
  const swPath = join(distDir, 'sw.js');
  if (!existsSync(swPath)) {
    throw new Error(`service worker yok: ${swPath}`);
  }
  const swSource = readFileSync(swPath, 'utf8');
  const urls = extractPrecacheUrls(swSource);
  if (!urls.length) {
    throw new Error('precache listesi boş ya da okunamadı');
  }

  const manifestUrls = urls.filter(u => u.endsWith('.webmanifest'));
  if (manifestUrls.length) {
    throw new Error(
      `manifest precache'te olmamalı (sunucu rota üretir): ${manifestUrls.join(', ')}`,
    );
  }
  if (existsSync(join(distDir, 'manifest.webmanifest'))) {
    throw new Error('build sabit bir manifest.webmanifest üretmiş; manifest: false olmalı');
  }
  if (!urls.includes('index.html')) {
    throw new Error('index.html precache listesinde yok');
  }

  const iconsDir = join(distDir, 'icons');
  const iconFiles = existsSync(iconsDir)
    ? readdirSync(iconsDir).filter(f => f.endsWith('.png'))
    : [];
  if (!iconFiles.length) {
    throw new Error(`icons dizininde png yok: ${iconsDir}`);
  }
  const missingIcons = iconFiles.filter(f => !urls.some(u => u.replace(/^\//, '').endsWith(`icons/${f}`)));
  if (missingIcons.length) {
    throw new Error(`ikonlar precache'te eksik: ${missingIcons.join(', ')}`);
  }

  return { urls, icons: iconFiles.length };
}

function main() {
  try {
    const { urls, icons } = assertPwaBuild();
    console.log(`[pwa-build-check] OK — ${urls.length} precache kaydı, ${icons} ikon; webmanifest precache'te yok`);
  } catch (err) {
    console.error(`[pwa-build-check] ${err.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
