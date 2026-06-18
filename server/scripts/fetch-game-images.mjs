/**
 * Oyun görsellerini DuckDuckGo Images'tan toplu çeker (API key gerektirmez).
 *
 * Kullanım:
 *   node fetch-game-images.mjs                          # sadece boş görseller
 *   node fetch-game-images.mjs --all                    # tümünü yenile
 *   node fetch-game-images.mjs --provider "Hacksaw Gaming"
 *   node fetch-game-images.mjs --limit 100              # ilk 100 oyun
 *   node fetch-game-images.mjs --dry-run                # sadece logla, yazma
 *
 * checkpoint: /tmp/game_images_cache.json  (resume desteği)
 * çıktı:      /tmp/game_images_result.json (gameId → imageUrl)
 * uygulama:   node apply-game-images.mjs
 *
 * BGaming oyunlar için hub.bgaming.com REST API kullanılır (DDG'den çok daha hızlı).
 * PP, Hacksaw, Wazdan vb. için DDG'de "{title} {provider domain}" sorgusu yapılır.
 * Test: "Gates of Olympus pragmaticplay.com" → pragmaticplay.com/wp-content/... döndürür.
 */

import https from 'https';
import http from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import vm from 'vm';

// ── Console timing ───────────────────────────────────────────────────────────
['log','warn','error'].forEach(m => {
  const o = console[m].bind(console);
  console[m] = (...a) => o(`[${new Date().toISOString().slice(11,23)}]`, ...a);
});

// ── Argümanlar ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(name); return i !== -1 ? args[i+1] : def; };
const LIMIT    = parseInt(getArg('--limit', '9999'));
const PROVIDER = getArg('--provider', null);
const ALL_MODE = args.includes('--all');
const DRY_RUN  = args.includes('--dry-run');

const CACHE_FILE  = '/tmp/game_images_cache.json';
const RESULT_FILE = '/tmp/game_images_result.json';
const GAMES_FILE  = new URL('../../client/src/data/casinoGames.js', import.meta.url).pathname;

// ── Oyun listesi ─────────────────────────────────────────────────────────────
const src = readFileSync(GAMES_FILE, 'utf8');
const ctx = {};
vm.runInNewContext(
  src.replace(/export const /g, 'var ').replace(/export function /g, 'function '),
  ctx
);
const games = ctx.CASINO_GAMES;

// ── Checkpoint ───────────────────────────────────────────────────────────────
const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
console.log(`Checkpoint: ${Object.keys(cache).length} oyun daha önce işlendi`);

const BROKEN = (url) => !url || url.includes('118rakipsite.com') || url.includes('rakipsite');

const targets = games.filter(g => {
  if (cache[g.id] && !ALL_MODE) return false;
  if (PROVIDER && g.provider !== PROVIDER) return false;
  if (!ALL_MODE && !BROKEN(g.image)) return false;
  return true;
}).slice(0, LIMIT);

console.log(`Hedef: ${targets.length} oyun | Mod: ${ALL_MODE ? 'tümünü yenile' : 'sadece kırıklar'}`);
if (!targets.length) { console.log('Yapılacak iş yok.'); process.exit(0); }

// ── HTTP helper ───────────────────────────────────────────────────────────────
function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/json,*/*',
        ...headers,
      },
      timeout: 12000,
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location)
        return get(res.headers.location, headers).then(resolve).catch(reject);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Provider domain haritası (scoring için) ───────────────────────────────────
const PROVIDER_DOMAINS = {
  'Pragmatic Play':  'pragmaticplay.com',
  'BGaming':         'bgaming',
  'Hacksaw Gaming':  'hacksawgaming.com',
  'Wazdan':          'wazdan.com',
  'Relax Gaming':    'relaxgaming.com',
  'Endorphina':      'endorphina.com',
  'Fugaso':          'fugaso.com',
};

// ── DDG Images ───────────────────────────────────────────────────────────────
async function ddgSearch(game) {
  const domain = PROVIDER_DOMAINS[game.provider] || '';
  const query = domain
    ? `"${game.title}" ${domain} slot`
    : `"${game.title}" ${game.provider} slot thumbnail`;

  // Step 1: vqd token
  const { body: html } = await get(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`
  );
  const vqdMatch = html.match(/vqd=['"]([^'"]+)['"]/);
  if (!vqdMatch) return null;

  await sleep(150);

  // Step 2: image results JSON
  const { body } = await get(
    `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&vqd=${vqdMatch[1]}&f=,,,,,&p=1`,
    { Referer: 'https://duckduckgo.com/' }
  );
  const results = JSON.parse(body).results || [];

  // Score & pick best
  const scored = results
    .filter(r => r.image?.startsWith('https') && r.width >= 100 && r.height >= 80)
    .map(r => {
      let score = 0;
      const img = r.image;
      if (domain && img.includes(domain)) score += 300;      // provider kendi CDN'i
      if (r.width >= 400 && r.height >= 200) score += 20;
      if (r.width >= 800) score += 10;
      const ratio = r.width / (r.height || 1);
      if (ratio >= 1.3 && ratio <= 2.2) score += 15;         // 16:9 / 4:3 tercih
      return { score, url: img };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.url || null;
}

// ── BGaming REST API (toplu, çok daha hızlı) ─────────────────────────────────
async function buildBGamingMap() {
  const map = {};
  for (let page = 1; page <= 5; page++) {
    try {
      const { status, body } = await get(
        `https://hub.bgaming.com/wp-json/wp/v2/game?per_page=100&page=${page}&acf_format=standard&_fields=slug,acf.image`
      );
      if (status !== 200) break;
      const data = JSON.parse(body);
      if (!data.length) break;
      for (const g of data) {
        const img = g.acf?.image;
        const url = typeof img === 'object' ? img?.url : (typeof img === 'string' ? img : null);
        if (url && g.slug) map[g.slug] = url;
      }
      console.log(`BGaming API sayfa ${page}: ${data.length} oyun`);
      await sleep(300);
    } catch (e) { console.warn(`BGaming sayfa ${page}: ${e.message}`); break; }
  }
  return map;
}

// ── PascalCase → kebab-case ───────────────────────────────────────────────────
const toKebab = str => str.replace(/([A-Z])/g, m => '-' + m.toLowerCase()).replace(/^-/, '');

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('\nBGaming REST API önceden yükleniyor...');
const bgMap = await buildBGamingMap();
console.log(`BGaming haritası: ${Object.keys(bgMap).length} oyun\n`);

let updated = 0, failed = 0;

for (let i = 0; i < targets.length; i++) {
  const game = targets[i];
  let imageUrl = null;

  try {
    if (game.provider === 'BGaming') {
      // BGaming: REST API (DDG'den önce)
      const slug = toKebab(game.launchCode);
      imageUrl = bgMap[slug] || bgMap[game.launchCode.toLowerCase()] || null;
    }

    if (!imageUrl) {
      imageUrl = await ddgSearch(game);
      await sleep(400 + Math.random() * 200); // rate limit
    }
  } catch (e) {
    console.warn(`[${i+1}/${targets.length}] DDG hata (${game.title}): ${e.message?.slice(0,50)}`);
    await sleep(1500);
  }

  cache[game.id] = imageUrl || '';
  const icon = imageUrl ? '✓' : '✗';
  if (imageUrl) updated++; else failed++;

  if (i < 10 || i % 50 === 0 || !imageUrl) {
    console.log(`[${i+1}/${targets.length}] ${icon} ${game.provider} — ${game.title.slice(0,35).padEnd(35)} ${imageUrl ? imageUrl.slice(0,60) : 'bulunamadı'}`);
  }

  // Her 25 oyunda checkpoint kaydet
  if ((i + 1) % 25 === 0) {
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`  ↳ Checkpoint (${i+1}/${targets.length}, ${updated} bulundu)`);
  }
}

// ── Sonuçları kaydet ─────────────────────────────────────────────────────────
if (!DRY_RUN) {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  const result = Object.fromEntries(Object.entries(cache).filter(([, v]) => v?.startsWith('http')));
  writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));
  console.log(`\nSonuçlar → ${RESULT_FILE}`);
}

console.log(`\n=== ÖZET ===`);
console.log(`✓ Bulundu: ${updated} | ✗ Bulunamadı: ${failed} | Toplam: ${targets.length}`);
console.log(DRY_RUN ? 'DRY RUN — dosya yazılmadı.' : 'Uygulamak için: node apply-game-images.mjs');
