import Setting from '../models/Setting.js';
import { addRecentWinner } from './liveGameStream.js';
import { getGames } from './palaceCasinoService.js';
import { isModuleUsable } from './licensing/index.js';

/**
 * "Son Kazananlar" simülasyonu — kullanıcı isteği üzerine P3'ün gerçek
 * DB-kayıtlı/bakiyeli bot mimarisinden (services/bot.js) BİLİNÇLİ olarak
 * ayrı: burada hiçbir User kaydı, gerçek bahis ya da bakiye değişimi
 * OLMUYOR. Yalnızca `addRecentWinner()` çağrılıyor — yani gerçek kazananlarla
 * (routes/inhouse.js → notifyIfWin) TAMAMEN AYNI, zaten var olan mekanizma
 * üzerinden `winners:new` socket event'i yayınlanıyor. Client tarafında
 * (RecentWinnersTicker/WinnersPanel) hiçbir değişiklik gerekmiyor.
 *
 * "Oyuncu sayısı aralığı" (poolMin–poolMax): her N dakikada bir yeniden
 * zarlanan bir isim havuzu büyüklüğü — kullanıcıların "giriş/çıkış yapması"
 * illüzyonu için havuz periyodik olarak yeniden üretiliyor, sabit kalmıyor.
 * Kazanç aralığı ve tetiklenme sıklığı da (intervalMin–intervalMax) sabit
 * değil, her seferinde rastgele — "değişen aralıklarla" isteğine karşılık.
 *
 * Kazanç alanları: Çekirdek (in-house, her zaman açık) + isteğe bağlı
 * Casino oyunları / Bahisler — ikisi de yalnızca ilgili modül
 * (casino-content / betting, bkz. modules/registry.js) sitede AÇIKKEN
 * seçilebilir/etkilidir (kapalı bir modülün "kazananı" gösterilmez).
 */

const CONFIG_KEY = 'fakeWinners.config';

export const DEFAULT_CONFIG = {
  enabled: true,
  poolMin: 200,
  poolMax: 300,
  intervalMinMs: 8_000,
  intervalMaxMs: 45_000,
  amountMin: 500,
  amountMax: 150_000,
  poolRefreshMs: 5 * 60_000, // havuz bu sıklıkla yeniden zarlanır (giriş/çıkış illüzyonu)
  includeCasinoWins: false,  // yalnızca casino-content modülü açıkken etkili
  includeBettingWins: false, // yalnızca betting modülü açıkken etkili
};

const TR_FIRST_NAMES = [
  'Emre', 'Ayşe', 'Mert', 'Burak', 'Zeynep', 'Ahmet', 'Elif', 'Mehmet', 'Fatma', 'Can',
  'Deniz', 'Cem', 'Ece', 'Kerem', 'Selin', 'Onur', 'Berk', 'Yasemin', 'Kaan', 'Gizem',
  'Serkan', 'Hande', 'Barış', 'Nazlı', 'Emir', 'Aslı', 'Tolga', 'Merve', 'Furkan', 'İrem',
  'Volkan', 'Buse', 'Alperen', 'Sena', 'Oğuz', 'Ceren', 'Yusuf', 'Gamze', 'Baran', 'Melis',
];
const TR_INITIALS = 'ABCDEFGHIJKLMNOPRSTUVYZ'.split('');

const INHOUSE_GAME_TITLES = {
  crash: 'Crash', mines: 'Mines', plinko: 'Plinko', dice: 'Dice', limbo: 'Limbo',
  wheel: 'Wheel', roulette: 'Roulette', blackjack: 'Blackjack', baccarat: 'Baccarat',
  keno: 'Keno', hilo: 'HiLo', dragontiger: 'Dragon Tiger', videopoker: 'Video Poker',
};
const INHOUSE_GAME_IDS = Object.keys(INHOUSE_GAME_TITLES);

// HomePage.jsx'teki PALACE_PROVIDER_IDS ile TUTARLI — yalnızca lisanslı/
// gerçek katalogla bağlı sağlayıcılar (bkz. o dosyadaki T5 varlık denetimi
// notu). Fake casino kazananları da bu allowlist dışına çıkmaz.
const PALACE_PROVIDER_IDS = [1, 15];
const CASINO_POOL_TTL_MS = 30 * 60_000;
let casinoGamesCache = [];
let casinoGamesCacheAt = 0;

// Gerçek canlı fikstür verisine dokunmuyor — TR_FIRST_NAMES ile aynı desende
// küçük, jenerik bir bahis pazarı örneklem havuzu (kozmetik simülasyon).
const BETTING_MARKET_TITLES = [
  'Maç Sonucu · Galatasaray - Fenerbahçe',
  'Alt/Üst 2.5 · Beşiktaş - Trabzonspor',
  'Çifte Şans · Başakşehir - Sivasspor',
  'İlk Yarı/Maç Sonucu · Konyaspor - Antalyaspor',
  'Maç Sonucu · Real Madrid - Barcelona',
  'Toplam Gol · Bayern Münih - Dortmund',
  'Karşılıklı Gol · Liverpool - Man City',
  'Maç Sonucu · PSG - Marsilya',
  'Alt/Üst 3.5 · Juventus - Milan',
  'Handikaplı Sonuç · Arsenal - Chelsea',
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomName(usedNames) {
  let name;
  let attempts = 0;
  do {
    const first = TR_FIRST_NAMES[randomInt(0, TR_FIRST_NAMES.length - 1)];
    const initial = TR_INITIALS[randomInt(0, TR_INITIALS.length - 1)];
    name = `${first} ${initial}.`;
    attempts += 1;
  } while (usedNames.has(name) && attempts < 20);
  return name;
}

let pool = [];
let config = { ...DEFAULT_CONFIG };
let fireTimer = null;
let refreshTimer = null;

export async function loadConfig() {
  try {
    const row = await Setting.findOne({ key: CONFIG_KEY }).lean();
    config = row?.value ? { ...DEFAULT_CONFIG, ...JSON.parse(row.value) } : { ...DEFAULT_CONFIG };
  } catch {
    config = { ...DEFAULT_CONFIG }; // DB okunamazsa varsayılanla ayakta kal
  }
  return config;
}

export async function saveConfig(updates, adminId) {
  config = { ...config, ...updates };
  await Setting.findOneAndUpdate(
    { key: CONFIG_KEY },
    { key: CONFIG_KEY, value: JSON.stringify(config), updatedBy: adminId },
    { upsert: true },
  );
  regeneratePool(); // yeni min/max hemen etkili olsun
  return config;
}

export function getConfig() {
  return config;
}

export function getPoolSize() {
  return pool.length;
}

export function regeneratePool() {
  const size = randomInt(config.poolMin, config.poolMax);
  const used = new Set();
  const next = [];
  for (let i = 0; i < size; i++) {
    const name = randomName(used);
    used.add(name);
    next.push(name);
  }
  pool = next;
}

/** Oyunun tipik bahis ölçeğine göre kabaca inandırıcı bir kazanç üretir. */
function randomAmount() {
  // Düz uniform yerine hafif logaritmik dağılım — çoğu kazanç orta bantta,
  // ara sıra "büyük vuruş" görünsün (reference'taki ₺45k–₺125k gibi).
  const t = Math.random() ** 2; // 0'a yakın daha olası
  const amount = config.amountMin + t * (config.amountMax - config.amountMin);
  return Math.round(amount / 5) * 5; // ₺5'e yuvarla, "525,00" gibi doğal bir sayı
}

function fakeUserId() {
  return `fake-${Date.now()}-${randomInt(1000, 9999)}`;
}

function fireInhouseWin() {
  const username = pool[randomInt(0, pool.length - 1)];
  const gameId = INHOUSE_GAME_IDS[randomInt(0, INHOUSE_GAME_IDS.length - 1)];
  addRecentWinner({
    userId: fakeUserId(),
    username,
    gameId: `inhouse-${gameId}`,
    gameTitle: INHOUSE_GAME_TITLES[gameId],
    amount: randomAmount(),
    currency: 'TRY',
  });
}

/** 30dk TTL'li basit bellek-içi cache — Palace erişilemezse mevcut (belki boş) cache ile devam eder. */
async function getCasinoGamesPool() {
  if (casinoGamesCache.length && Date.now() - casinoGamesCacheAt < CASINO_POOL_TTL_MS) return casinoGamesCache;
  try {
    const lists = await Promise.all(PALACE_PROVIDER_IDS.map(async id => {
      const result = await getGames(id, 'tr');
      return Array.isArray(result?.data?.data) ? result.data.data : [];
    }));
    const flat = lists.flat().filter(g => g.launch_enable !== false);
    if (flat.length) {
      casinoGamesCache = flat;
      casinoGamesCacheAt = Date.now();
    }
  } catch {
    // Palace erişilemezse mevcut cache (boş olabilir) korunur, fireCasinoWin fallback yapar.
  }
  return casinoGamesCache;
}

async function fireCasinoWin() {
  const games = await getCasinoGamesPool();
  if (games.length === 0) return fireInhouseWin(); // Palace erişilemezse çekirdeğe düş
  const username = pool[randomInt(0, pool.length - 1)];
  const game = games[randomInt(0, games.length - 1)];
  addRecentWinner({
    userId: fakeUserId(),
    username,
    gameId: `palace-${game.game_code}`,
    gameTitle: game.game_name,
    image: game.game_image_narrow || game.game_image || null,
    amount: randomAmount(),
    currency: 'TRY',
  });
}

function fireBettingWin() {
  const username = pool[randomInt(0, pool.length - 1)];
  const market = BETTING_MARKET_TITLES[randomInt(0, BETTING_MARKET_TITLES.length - 1)];
  addRecentWinner({
    userId: fakeUserId(),
    username,
    gameId: 'sports-bet',
    gameTitle: market,
    amount: randomAmount(),
    currency: 'TRY',
  });
}

export async function fireFakeWin() {
  if (!config.enabled || pool.length === 0) return;

  const areas = ['core'];
  if (config.includeCasinoWins && await isModuleUsable('casino-content')) areas.push('casino');
  if (config.includeBettingWins && await isModuleUsable('betting')) areas.push('betting');
  const area = areas[randomInt(0, areas.length - 1)];

  if (area === 'casino') return fireCasinoWin();
  if (area === 'betting') return fireBettingWin();
  return fireInhouseWin();
}

function scheduleNextFire() {
  const delay = randomInt(config.intervalMinMs, config.intervalMaxMs);
  fireTimer = setTimeout(() => {
    fireFakeWin().catch(e => console.error('[fakeWinners] hata:', e.message));
    scheduleNextFire();
  }, delay);
}

/** server.js açılışında bir kez çağrılır. */
export async function startFakeWinnersScheduler() {
  await loadConfig();
  regeneratePool();
  scheduleNextFire();
  refreshTimer = setInterval(regeneratePool, config.poolRefreshMs);
}

export function stopFakeWinnersScheduler() {
  clearTimeout(fireTimer);
  clearInterval(refreshTimer);
}
