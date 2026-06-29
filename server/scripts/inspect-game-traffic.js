/**
 * Oyun network trafiğini analiz eder — wallet call'ların frontend'den mi
 * yoksa server-to-server mı gittiğini belirler.
 *
 * Kullanım: node scripts/inspect-game-traffic.js <gameId> [provider]
 * Örnek:    node scripts/inspect-game-traffic.js 019e1602-1ba7-7ce7-be92-fb12fcd09e5f "Pragmatic Play"
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getoddsSourceGameUrl } from '../src/services/oddsSourceService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const WALLET_KEYWORDS = ['balance', 'debit', 'credit', 'wallet', 'getbalance',
  'rollback', 'refund', 'bet', 'win', 'spin', 'transaction', 'auth', 'session'];

const gameId   = process.argv[2];
const provider = process.argv[3] || '';

if (!gameId) {
  console.error('Kullanım: node inspect-game-traffic.js <gameId> [provider]');
  process.exit(1);
}

console.log(`\n🔍 Oyun trafiği analizi başlıyor: ${gameId} (${provider || 'provider?'})\n`);

async function main() {
  // Launch URL al
  console.log('  → oddsSource\'ten launch URL alınıyor...');
  let launchUrl;
  try {
    launchUrl = await getoddsSourceGameUrl(gameId, provider, false);
  } catch (e) {
    // Fallback: demo
    console.warn(`  ⚠ Real URL alınamadı (${e.message}), demo deneniyor...`);
    launchUrl = await getoddsSourceGameUrl(gameId, provider, true);
  }
  console.log(`  ✓ Launch URL: ${launchUrl.slice(0, 80)}...\n`);

  // Yeni browser — game'i aç ve trafiği izle
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });

  const page = await ctx.newPage();

  const requests = [];

  // Tüm request'leri yakala
  page.on('request', req => {
    const url  = req.url();
    const method = req.method();
    const urlLower = url.toLowerCase();
    const isWallet = WALLET_KEYWORDS.some(kw => urlLower.includes(kw));

    requests.push({
      url,
      method,
      isWallet,
      headers: req.headers(),
      postData: req.postData(),
      timestamp: Date.now(),
    });
  });

  page.on('response', async resp => {
    const url = resp.url().toLowerCase();
    const isWallet = WALLET_KEYWORDS.some(kw => url.includes(kw));
    if (isWallet) {
      try {
        const body = await resp.text().catch(() => '');
        const matching = requests.find(r => r.url === resp.url() && !r.responseBody);
        if (matching) matching.responseBody = body.slice(0, 500);
      } catch {}
    }
  });

  console.log('  → Oyun yükleniyor (30 sn bekleniyor)...');
  await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(15000); // Oyunun init sequence'ini tamamlaması için

  await browser.close();

  // Sonuçları grupla
  const walletReqs = requests.filter(r => r.isWallet);
  const allDomains = [...new Set(requests.map(r => {
    try { return new URL(r.url).hostname; } catch { return r.url; }
  }))];

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('SONUÇ');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`\nToplam request: ${requests.length}`);
  console.log(`Wallet-related request: ${walletReqs.length}`);
  console.log(`\nİletişim kurulan domain'ler (${allDomains.length}):`);
  allDomains.forEach(d => console.log(`  • ${d}`));

  if (walletReqs.length === 0) {
    console.log('\n⚠ Wallet call tespit edilmedi (oyun tam yüklenmedi veya session gerekiyor olabilir)');
  } else {
    console.log('\n💰 WALLET CALL\'LAR (Frontend\'den yapılanlar):');
    walletReqs.forEach((r, i) => {
      const domain = (() => { try { return new URL(r.url).hostname; } catch { return '?'; } })();
      console.log(`\n  [${i+1}] ${r.method} ${r.url.slice(0, 120)}`);
      console.log(`      Domain: ${domain}`);
      if (r.postData) console.log(`      Body:   ${r.postData.slice(0, 200)}`);
      if (r.responseBody) console.log(`      Yanıt:  ${r.responseBody.slice(0, 200)}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('DEĞERLENDİRME');
  console.log('═══════════════════════════════════════════════════════');

  if (walletReqs.length > 0) {
    const walletDomains = [...new Set(walletReqs.map(r => {
      try { return new URL(r.url).hostname; } catch { return ''; }
    }))];
    console.log(`\nWallet call'lar şu domain'lere gidiyor: ${walletDomains.join(', ')}`);
    console.log('\n→ Bu domain\'ler değiştirilebilir bir URL içeriyorsa (launch URL parametresi),');
    console.log('  proxy yaklaşımı ÇALIŞIR.');
    console.log('→ Eğer sabit provider backend URL\'iyse (PP gibi), proxy işe YARAMAZ.');
  }
}

main().catch(e => {
  console.error('Hata:', e.message);
  process.exit(1);
});
