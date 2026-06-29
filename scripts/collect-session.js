#!/usr/bin/env node
/**
 * Kaynak siteye manuel login yaptıktan sonra session bilgilerini toplar.
 * Kullanım: node scripts/collect-session.js <url>
 * Örn:      node scripts/collect-session.js https://kaynak-site.com
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGET_URL = process.argv[2];
if (!TARGET_URL) {
  console.error('Kullanım: node scripts/collect-session.js <url>');
  process.exit(1);
}

const OUTPUT_FILE = resolve(__dirname, 'session.json');

function waitForEnter(msg) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(msg, () => { rl.close(); res(); });
  });
}

(async () => {
  console.log('[collect-session] Browser açılıyor...');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--start-maximized'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: null, // --start-maximized ile uyumlu
    ignoreHTTPSErrors: true,
  });

  // Tüm request header'larını yakala (ilk oyun listesi isteğini hedefle)
  const capturedHeaders = {};
  context.on('request', (req) => {
    const url = req.url();
    // Sadece hedef domain isteklerini kaydet, static dosyaları atla
    if (!url.startsWith(new URL(TARGET_URL).origin)) return;
    if (/\.(js|css|png|jpg|jpeg|gif|svg|woff|ico)(\?|$)/.test(url)) return;

    const headers = req.headers();
    // Mevcut yakalananları header adına göre birleştir (son değer kazanır)
    Object.assign(capturedHeaders, headers);
  });

  const page = await context.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('\n[collect-session] Browser açık. Siteye giriş yap.');
  await waitForEnter('Login tamamlandığında ENTER\'a bas...\n');

  // Cookie topla
  const cookies = await context.cookies();

  // localStorage & sessionStorage topla
  const storage = await page.evaluate(() => ({
    localStorage: { ...localStorage },
    sessionStorage: { ...sessionStorage },
  }));

  // İlgi çekici header'ları filtrele
  const relevantHeaders = Object.fromEntries(
    Object.entries(capturedHeaders).filter(([k]) =>
      ['authorization', 'x-auth-token', 'x-session', 'x-token', 'x-api-key',
       'cookie', 'x-csrf-token', 'x-xsrf-token', 'bearer'].some((kw) =>
        k.toLowerCase().includes(kw)
      )
    )
  );

  // Cookie string'i de üret (HTTP isteğinde doğrudan kullanmak için)
  const cookieString = cookies
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const session = {
    collectedAt: new Date().toISOString(),
    url: TARGET_URL,
    cookieString,
    cookies,
    relevantHeaders,
    localStorage: storage.localStorage,
    sessionStorage: storage.sessionStorage,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(session, null, 2), 'utf-8');

  console.log('\n[collect-session] Toplanan bilgiler:');
  console.log('  Cookie sayısı :', cookies.length);
  console.log('  Auth header   :', Object.keys(relevantHeaders).join(', ') || '(yok)');
  console.log('  localStorage  :', Object.keys(storage.localStorage).join(', ') || '(boş)');
  console.log('  sessionStorage:', Object.keys(storage.sessionStorage).join(', ') || '(boş)');
  console.log(`\nKaydedildi: ${OUTPUT_FILE}`);

  await browser.close();
})();
