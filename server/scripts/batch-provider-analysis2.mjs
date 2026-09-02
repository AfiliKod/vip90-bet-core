/**
 * 2. tur provider analizi — ka-gaming, yggdrasil, fazi, amusnet, egt, endorphina, ruby-play, cq9, pgsoft
 */
import { chromium } from 'playwright';
import { getOddsSourceGameUrl } from '../src/services/oddsSourceService.js';

const TARGETS = [
  { provider: 'ka-gaming',   gameId: '019c896e-9fcd-77a9-9089-1e2ad2c4fb2a' },
  { provider: 'yggdrasil',   gameId: '3c7758f0-34ff-4fe9-81a3-deb8cffc6a9d' },
  { provider: 'fazi',        gameId: '019ad985-ae97-72c6-bd9b-06c2170fc12e' },
  { provider: 'amusnet',     gameId: '0195cdb1-4d49-720e-92a6-ad02aa809df0' },
  { provider: 'egt',         gameId: '019e252d-d10d-7421-9d10-b21e6c8346bd' },
  { provider: 'endorphina',  gameId: 'e202e400-783c-40ee-8cbe-6f7079fb0995' },
  { provider: 'ruby-play',   gameId: '0191c1ee-bcd6-7b95-ad0c-b3fe50b76129' },
  { provider: 'cq9',         gameId: '019b274d-c73f-718b-afb7-fffdb2374be2' },
  { provider: 'pgsoft',      gameId: '0198ad54-5c59-7fc8-b4b9-abb645a3bd57' },
];

const WALLET_KW = ['balance','debit','credit','wallet','bet','win','spin','fund',
                   'getbalance','player','session','auth','game','round','transaction'];
const SKIP_EXT = ['.png','.jpg','.jpeg','.webp','.woff','.woff2','.svg','.gif','.ico','.mp3','.mp4','.ogg'];
const SKIP_HOST = ['google-analytics.com','googletagmanager.com','hotjar.com','doubleclick.net','facebook.net'];

async function getUrl(provider, gameId) {
  try {
    return await getOddsSourceGameUrl(gameId, provider, true);
  } catch {
    return null;
  }
}

async function analyzeProvider({ provider, gameId }) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`PROVIDER: ${provider.toUpperCase()}`);

  const launchUrl = await getUrl(provider, gameId);
  if (!launchUrl) {
    console.log('  ✗ Launch URL alınamadı');
    return { provider, status: 'NO_URL' };
  }
  console.log(`  URL: ${launchUrl.slice(0, 120)}`);

  // url= / server= parametresi kontrolü
  let urlParam = null;
  try {
    const u = new URL(launchUrl);
    for (const key of ['url','server','serverUrl','gameUrl','wsUrl','socketUrl']) {
      const v = u.searchParams.get(key);
      if (v) { urlParam = `${key}=${v}`; break; }
    }
    if (urlParam) console.log(`  ★ PARAM BULUNDU: ${urlParam.slice(0, 100)}`);
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
    const isW = WALLET_KW.some(k => u.toLowerCase().includes(k));
    if (isW) {
      const body = await resp.text().catch(() => '');
      const r = httpReqs.findLast(x => x.url === u);
      if (r) r.resp = body.slice(0, 400);
    }
  });

  try {
    await page.goto(launchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(12000);
  } catch (e) {
    console.log(`  ⚠ Yükleme: ${e.message.slice(0, 60)}`);
  }
  await browser.close();

  const walletHttp = httpReqs.filter(r => r.isWallet);

  console.log(`\n  📊 Özet: HTTP=${httpReqs.length} | WS=${wsConnections.length} | WS frames=${wsEvents.length} | Wallet HTTP=${walletHttp.length}`);

  if (wsEvents.length > 0) {
    console.log(`\n  🔌 WS mesajları:`);
    wsEvents.slice(0, 6).forEach((e, i) => {
      console.log(`    [${i}] ${e.dir} ${e.payload.slice(0, 220)}`);
    });
  }

  if (walletHttp.length > 0) {
    console.log(`\n  💰 Wallet HTTP (ilk 4):`);
    walletHttp.slice(0, 4).forEach((r, i) => {
      console.log(`    [${i}] ${r.method} ${r.url.slice(0, 120)}`);
      if (r.body) console.log(`        Body: ${r.body.slice(0, 150)}`);
      if (r.resp) console.log(`        Resp: ${r.resp.slice(0, 150)}`);
    });
  }

  // Tapking bağlantısı var mı?
  const allText = [launchUrl, ...httpReqs.map(r => r.url + (r.body||''))].join(' ').toLowerCase();
  const hasTapking = allText.includes('tapking') || allText.includes('swintt') || allText.includes('softgate');

  let verdict;
  let notes = '';
  if (urlParam) {
    verdict = '🟢 EN İYİ — url= parametresi var';
    notes = urlParam.slice(0, 80);
  } else if (wsConnections.length > 0) {
    const firstSent = wsEvents.find(e => e.dir === '→');
    const isHex = firstSent && /^[0-9a-fA-F]{40,}$/.test(firstSent.payload.trim());
    const isJson = firstSent && (firstSent.payload.includes('{') || firstSent.payload.startsWith('4'));
    if (isHex) {
      verdict = '🔴 WS — şifreli binary (hex)';
    } else if (isJson) {
      verdict = '🟡 MÜMKÜN — WS var, JSON/Socket.IO';
      notes = firstSent.payload.slice(0, 100);
    } else {
      verdict = '🟡 MÜMKÜN — WS var, format belirsiz';
      notes = firstSent?.payload?.slice(0, 100) || '';
    }
  } else if (walletHttp.length > 0) {
    verdict = hasTapking ? '🔵 HTTP REST — TapKing altyapısı' : '🔵 HTTP REST — bağımsız';
    notes = walletHttp[0]?.url?.slice(0, 80) || '';
  } else {
    verdict = '⚪ Yüklenmedi veya statik';
  }

  if (hasTapking) notes += ' [TapKing]';

  console.log(`\n  KARAR: ${verdict}`);
  if (notes) console.log(`  NOT: ${notes}`);

  return { provider, launchUrl, urlParam, wsCount: wsConnections.length, wsFrames: wsEvents.length,
           walletHttp: walletHttp.length, hasTapking, verdict, notes,
           wsInit: wsEvents.slice(0,3).map(e=>`${e.dir} ${e.payload.slice(0,80)}`) };
}

const results = [];
for (const target of TARGETS) {
  const r = await analyzeProvider(target).catch(e => {
    console.error(`  HATA: ${e.message}`);
    return { provider: target.provider, status: 'ERROR', error: e.message };
  });
  results.push(r);
}

console.log('\n\n' + '═'.repeat(70));
console.log('GENEL ÖZET');
console.log('═'.repeat(70));
results.forEach(r => {
  const urlP = r.urlParam ? '✅url=' : '   ';
  const ws   = r.wsCount > 0 ? `WS(${r.wsFrames}fr)` : 'HTTP ';
  const tk   = r.hasTapking ? '[TK]' : '    ';
  console.log(`${urlP} ${ws.padEnd(10)} ${tk} ${(r.provider||'?').padEnd(18)} ${r.verdict || r.status}`);
});
