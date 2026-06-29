/**
 * Birden fazla provider'ın WebSocket + HTTP trafiğini analiz eder.
 * Her provider için: hangi domain'lere bağlanıyor, WS var mı, spin/balance call'ları var mı.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const PROVIDERS = [
  { name: 'evoplay',  urlFile: '/tmp/evoplay_url.txt' },
  { name: 'bgaming',  urlFile: '/tmp/bgaming_url.txt' },
  { name: 'falcon',   urlFile: '/tmp/falcon_url.txt' },
];

const WALLET_KW = ['balance','debit','credit','wallet','bet','win','spin','fund','cash','getbalance',
                   'player','session','auth','token','game','round','transaction'];

async function analyzeProvider({ name, urlFile }) {
  const url = readFileSync(urlFile, 'utf8').trim();
  console.log(`\n${'═'.repeat(65)}`);
  console.log(`PROVIDER: ${name.toUpperCase()}`);
  console.log(`URL: ${url.slice(0, 100)}`);
  console.log('═'.repeat(65));

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();

  const wsConnections = [];
  const wsEvents = [];
  const httpReqs = [];

  page.on('websocket', ws => {
    wsConnections.push(ws.url());
    ws.on('framesent',    e => { if (e.payload) wsEvents.push({ dir: '→', src: ws.url(), payload: String(e.payload).slice(0, 400) }); });
    ws.on('framereceived',e => { if (e.payload) wsEvents.push({ dir: '←', src: ws.url(), payload: String(e.payload).slice(0, 400) }); });
  });

  page.on('request', req => {
    const u = req.url();
    if (['.png','.jpg','.webp','.woff','.svg','.gif','.ico'].some(e => u.includes(e))) return;
    if (['google-analytics','googletagmanager','hotjar','doubleclick'].some(s => u.includes(s))) return;
    const isW = WALLET_KW.some(k => u.toLowerCase().includes(k));
    httpReqs.push({ method: req.method(), url: u, isWallet: isW, body: req.postData()?.slice(0, 300) });
  });

  page.on('response', async resp => {
    const u = resp.url();
    const isW = WALLET_KW.some(k => u.toLowerCase().includes(k));
    if (isW) {
      const body = await resp.text().catch(() => '');
      const r = httpReqs.findLast(x => x.url === u);
      if (r) r.resp = body.slice(0, 400);
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(12000);
  await browser.close();

  // WebSocket connections
  const uniqueWsDomains = [...new Set(wsConnections.map(u => { try { return new URL(u).hostname; } catch { return u; } }))];
  console.log(`\nWebSocket bağlantıları (${wsConnections.length}):`)
  wsConnections.forEach(u => console.log('  WS:', u.slice(0, 120)));

  // HTTP domains
  const httpDomains = [...new Set(httpReqs.map(r => { try { return new URL(r.url).hostname; } catch { return '?'; } }))];
  console.log(`\nHTTP domain'ler (${httpDomains.length}):`, httpDomains.filter(d => !['googleapis.com','gstatic.com'].includes(d)).join(', '));

  // Wallet HTTP calls
  const walletHttp = httpReqs.filter(r => r.isWallet);
  if (walletHttp.length) {
    console.log(`\n💰 HTTP Wallet calls (${walletHttp.length}):`);
    walletHttp.forEach((r, i) => {
      console.log(`  [${i+1}] ${r.method} ${r.url.slice(0, 130)}`);
      if (r.body) console.log(`       Body: ${r.body}`);
      if (r.resp) console.log(`       Resp: ${r.resp}`);
    });
  }

  // WS events (ilk 15)
  if (wsEvents.length) {
    console.log(`\n🔌 WebSocket mesajları (toplam ${wsEvents.length}, ilk 15):`);
    wsEvents.slice(0, 15).forEach((e, i) => {
      console.log(`  [${i}] ${e.dir} ${e.payload.slice(0, 200)}`);
    });
  }

  // Özet
  console.log(`\n📊 ÖZET:`);
  console.log(`  HTTP requests: ${httpReqs.length}`);
  console.log(`  WS connections: ${wsConnections.length}`);
  console.log(`  WS events: ${wsEvents.length}`);
  console.log(`  Wallet HTTP: ${walletHttp.length}`);

  if (wsConnections.length > 0) {
    console.log(`  ✅ WS VAR — proxy yöntemi uygulanabilir`);
  } else {
    console.log(`  ⚠ WS YOK — sadece HTTP`);
  }
}

// Sırayla analiz et (paralel browser çok RAM yer)
for (const provider of PROVIDERS) {
  await analyzeProvider(provider).catch(e => console.error(`${provider.name} hata:`, e.message));
}
