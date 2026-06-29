import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const url = readFileSync('/tmp/tapking_url.txt', 'utf8').trim();
console.log('URL:', url.slice(0, 80), '...');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  viewport: { width: 1280, height: 720 },
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();

// WebSocket olaylarını yakala
const wsEvents = [];
page.on('websocket', ws => {
  console.log('WS BAĞLANDI:', ws.url());
  ws.on('framesent', e => {
    if (e.payload) wsEvents.push({ dir: '→', payload: e.payload });
  });
  ws.on('framereceived', e => {
    if (e.payload) wsEvents.push({ dir: '←', payload: e.payload });
  });
  ws.on('close', () => console.log('WS KAPANDI:', ws.url()));
});

// HTTP request'leri de yakala
const httpReqs = [];
page.on('request', req => {
  if (!req.url().includes('.png') && !req.url().includes('.jpg') && !req.url().includes('analytics')) {
    httpReqs.push({ method: req.method(), url: req.url(), body: req.postData() });
  }
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
await page.waitForTimeout(10000);

await browser.close();

console.log('\n=== HTTP REQUESTS (' + httpReqs.length + ') ===');
httpReqs.forEach((r, i) => {
  const host = (() => { try { return new URL(r.url).hostname; } catch { return '?'; } })();
  if (!['samxi941c-y.dq2c54iy.click', 'www.google-analytics.com', 'www.googletagmanager.com', 'unpkg.com'].includes(host)) {
    console.log(`[${i}] ${r.method} ${r.url.slice(0, 120)}`);
    if (r.body) console.log('    BODY:', r.body.slice(0, 300));
  }
});

console.log('\n=== WEBSOCKET EVENTS (' + wsEvents.length + ') ===');
wsEvents.slice(0, 30).forEach((e, i) => {
  const p = typeof e.payload === 'string' ? e.payload.slice(0, 300) : JSON.stringify(e.payload).slice(0, 300);
  console.log(`[${i}] ${e.dir} ${p}`);
});
