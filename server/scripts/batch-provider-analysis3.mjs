import { chromium } from 'playwright';
import { getOddsSourceGameUrl } from '../src/services/oddsSourceService.js';

const TARGETS = [
  { provider: 'bf-games',  gameId: '018d31f3-ce34-7326-9a1e-1b7f328ce6ca' },
  { provider: 'redrake',   gameId: 'millionchristmas2024' },
  { provider: 'gameart',   gameId: '019c896e-9fca-77ab-8a5a-f59722f3766d' },
  { provider: 'booming',   gameId: 'rlx.bo.bo.61787a29befa370016538076' },
  { provider: 'kalamba',   gameId: 'rlx.ka.ka.finneganstreasure7s' },
  { provider: 'playson',   gameId: '0191e637-9baa-7882-a63e-fae912f96757' },
  { provider: 'platipus',  gameId: 'blackjacksurrender' },
  { provider: 'gamzix',    gameId: '019cd2cd-bb8b-7c14-ac98-fccee8ad54ec' },
  { provider: 'reevo',     gameId: 'rl_rl-mackereels' },
];

const WALLET_KW = ['balance','debit','credit','wallet','bet','win','spin','fund',
                   'getbalance','player','session','auth','game','round','transaction'];
const SKIP_EXT = ['.png','.jpg','.jpeg','.webp','.woff','.woff2','.svg','.gif','.ico','.mp3','.mp4','.ogg'];
const SKIP_HOST = ['google-analytics.com','googletagmanager.com','hotjar.com','doubleclick.net'];

async function analyzeProvider({ provider, gameId }) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`PROVIDER: ${provider.toUpperCase()}`);

  let launchUrl;
  try {
    launchUrl = await getOddsSourceGameUrl(gameId, provider, true);
  } catch {
    console.log('  ✗ URL alınamadı');
    return { provider, status: 'NO_URL' };
  }
  console.log(`  URL: ${launchUrl.slice(0, 120)}`);

  let urlParam = null;
  try {
    const u = new URL(launchUrl);
    for (const key of ['url','server','serverUrl','gameUrl','wsUrl','socketUrl']) {
      const v = u.searchParams.get(key);
      if (v) { urlParam = `${key}=${v}`; break; }
    }
    if (urlParam) console.log(`  ★ PARAM: ${urlParam.slice(0, 100)}`);
  } catch {}

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
    console.log(`  WS: ${ws.url().slice(0, 100)}`);
    ws.on('framesent',     e => { if (e.payload) wsEvents.push({ dir: '→', payload: String(e.payload).slice(0, 500) }); });
    ws.on('framereceived', e => { if (e.payload) wsEvents.push({ dir: '←', payload: String(e.payload).slice(0, 500) }); });
  });

  page.on('request', req => {
    const u = req.url();
    if (SKIP_EXT.some(e => u.split('?')[0].endsWith(e))) return;
    if (SKIP_HOST.some(h => u.includes(h))) return;
    const isW = WALLET_KW.some(k => u.toLowerCase().includes(k));
    httpReqs.push({ method: req.method(), url: u, isWallet: isW, body: req.postData()?.slice(0, 300) });
  });

  page.on('response', async resp => {
    const u = resp.url();
    if (WALLET_KW.some(k => u.toLowerCase().includes(k))) {
      const body = await resp.text().catch(() => '');
      const r = httpReqs.findLast(x => x.url === u);
      if (r) r.resp = body.slice(0, 400);
    }
  });

  try {
    await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(12000);
  } catch (e) {
    console.log(`  ⚠ ${e.message.slice(0, 60)}`);
  }
  await browser.close();

  const walletHttp = httpReqs.filter(r => r.isWallet);
  const allText = [launchUrl, ...httpReqs.map(r => r.url + (r.body||''))].join(' ').toLowerCase();
  const hasTapking = allText.includes('tapking') || allText.includes('swintt') || allText.includes('softgate');

  console.log(`\n  📊 HTTP=${httpReqs.length} | WS=${wsConnections.length} | frames=${wsEvents.length} | wallet=${walletHttp.length}${hasTapking ? ' | [TapKing]' : ''}`);

  if (wsEvents.length > 0) {
    console.log(`  🔌 WS mesajları:`);
    wsEvents.slice(0, 5).forEach((e, i) => {
      console.log(`    [${i}] ${e.dir} ${e.payload.slice(0, 220)}`);
    });
  }

  if (walletHttp.length > 0) {
    console.log(`  💰 Wallet HTTP:`);
    walletHttp.slice(0, 3).forEach((r, i) => {
      console.log(`    [${i}] ${r.method} ${r.url.slice(0, 120)}`);
      if (r.body) console.log(`        Body: ${r.body.slice(0, 120)}`);
      if (r.resp) console.log(`        Resp: ${r.resp.slice(0, 120)}`);
    });
  }

  let verdict;
  let notes = '';
  if (urlParam) {
    verdict = '🟢 EN İYİ — url= parametresi';
    notes = urlParam.slice(0, 80);
  } else if (wsConnections.length > 0) {
    const first = wsEvents.find(e => e.dir === '→');
    const isHex = first && /^[0-9a-fA-F]{60,}$/.test(first.payload.trim());
    if (isHex) verdict = '🔴 WS şifreli binary';
    else verdict = '🟡 WS var — ' + (first?.payload?.slice(0,60) || 'frame yok');
  } else if (walletHttp.length > 0) {
    verdict = hasTapking ? '🔵 HTTP REST [TapKing]' : '🔵 HTTP REST';
    notes = walletHttp[0]?.url?.slice(0, 80) || '';
  } else {
    verdict = '⚪ Yüklenmedi';
  }

  console.log(`  KARAR: ${verdict}`);
  if (notes) console.log(`  NOT: ${notes}`);

  return { provider, urlParam, wsCount: wsConnections.length, wsFrames: wsEvents.length,
           walletHttp: walletHttp.length, hasTapking, verdict };
}

const results = [];
for (const t of TARGETS) {
  const r = await analyzeProvider(t).catch(e => ({ provider: t.provider, status: 'ERROR' }));
  results.push(r);
}

console.log('\n\n' + '═'.repeat(70));
console.log('ÖZET');
console.log('═'.repeat(70));
results.forEach(r => {
  const p = r.urlParam ? '✅' : '  ';
  const ws = r.wsCount > 0 ? `WS(${r.wsFrames})` : 'HTTP ';
  const tk = r.hasTapking ? '[TK]' : '    ';
  console.log(`${p} ${ws.padEnd(8)} ${tk} ${(r.provider||'?').padEnd(16)} ${r.verdict || r.status}`);
});
