/**
 * Popular Games Aggregate Tests
 *
 * getPopularGames() fonksiyonunun CasinoRound üzerinden doğru popülerlik
 * sıralaması ürettiğini gerçek DB'ye karşı test eder — bet/win double-count,
 * 7 günlük cutoff, provider filtresi, cache davranışı.
 *
 * Gerçek Palace API çağrısı yapmaz.
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';

const TEST_DB_URI = 'mongodb://localhost:27017/betzone_test_popular_games';

console.log('🔥 Popular Games Aggregate Tests\n');
console.log('─'.repeat(50));

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

await mongoose.connect(TEST_DB_URI);
const User = (await import('../src/models/User.js')).default;
const CasinoRound = (await import('../src/models/CasinoRound.js')).default;
const { getPopularGames } = await import('../src/services/casinoStatsService.js');

await User.deleteMany({});
await CasinoRound.deleteMany({});

console.log('✓ Test DB hazır\n');

const user = await User.create({ username: 'pg_test_user', email: 'pg@test.com', password: 'x', balance: 1000 });

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function createRound({ gameId, bet = 10, payout = 0, note = '', createdAt, provider = 'palace' }) {
  const round = await CasinoRound.create({
    userId: user._id,
    gameId,
    gameTitle: gameId,
    provider,
    bet,
    payout,
    net: payout - bet,
    balanceBefore: 1000,
    balanceAfter: 1000 - bet + payout,
    note,
  });
  if (createdAt) {
    await CasinoRound.updateOne({ _id: round._id }, { $set: { createdAt } }, { overwriteImmutable: true });
  }
  return round;
}

// 1. Basit sıralama: en çok bet edilen oyun ilk sırada (limit=10 — kendine ait cache key)
await test('getPopularGames: playCount sırasına göre sıralar', async () => {
  await createRound({ gameId: 'game_a', createdAt: daysAgo(1) });
  await createRound({ gameId: 'game_a', createdAt: daysAgo(1) });
  await createRound({ gameId: 'game_a', createdAt: daysAgo(1) });
  await createRound({ gameId: 'game_b', createdAt: daysAgo(1) });

  const result = await getPopularGames(10);
  assert(result[0].game_code === 'game_a', `ilk sırada game_a bekleniyor, gelen: ${result[0]?.game_code}`);
  assert(result[0].playCount === 3, `game_a playCount=3 bekleniyor, gelen: ${result[0].playCount}`);
  assert(result[1].game_code === 'game_b', 'ikinci sırada game_b bekleniyor');
  assert(result[1].playCount === 1, 'game_b playCount=1 bekleniyor');
});

// 2. Win kaydı (bet=0) sayılmamalı — double-count regresyon testi (limit=11 — farklı cache key)
await test('getPopularGames: Win kaydı (bet=0) sayılmaz, sadece Bet (bet>0)', async () => {
  await CasinoRound.deleteMany({});
  await createRound({ gameId: 'game_c', bet: 10, payout: 0, createdAt: daysAgo(1) }); // Bet
  await createRound({ gameId: 'game_c', bet: 0, payout: 25, createdAt: daysAgo(1) }); // Win (aynı spin)

  const result = await getPopularGames(11);
  const gameC = result.find(r => r.game_code === 'game_c');
  assert(gameC.playCount === 1, `game_c playCount=1 bekleniyor (Win sayılmamalı), gelen: ${gameC.playCount}`);
});

// 3. BetCancel/BonusCall (bet=0) da sayılmamalı (limit=12)
await test('getPopularGames: BetCancel/BonusCall (bet=0) sayılmaz', async () => {
  await CasinoRound.deleteMany({});
  await createRound({ gameId: 'game_d', bet: 10, payout: 0, createdAt: daysAgo(1) });
  await createRound({ gameId: 'game_d', bet: 0, payout: 10, note: 'bet_cancel', createdAt: daysAgo(1) });
  await createRound({ gameId: 'game_d', bet: 0, payout: 50, note: 'bonus_call', createdAt: daysAgo(1) });

  const result = await getPopularGames(12);
  const gameD = result.find(r => r.game_code === 'game_d');
  assert(gameD.playCount === 1, `game_d playCount=1 bekleniyor, gelen: ${gameD.playCount}`);
});

// 4. 7 günden eski kayıtlar cutoff dışında kalır (limit=13)
await test('getPopularGames: 7 günden eski kayıtlar cutoff dışında kalır', async () => {
  await CasinoRound.deleteMany({});
  await createRound({ gameId: 'old_game', bet: 10, createdAt: daysAgo(10) });
  await createRound({ gameId: 'fresh_game', bet: 10, createdAt: daysAgo(2) });

  const result = await getPopularGames(13);
  assert(!result.some(r => r.game_code === 'old_game'), 'old_game 7 gün cutoff dışında kalmalı');
  assert(result.some(r => r.game_code === 'fresh_game'), 'fresh_game listede olmalı');
});

// 5. provider != palace olan kayıtlar hariç tutulur (limit=14)
await test('getPopularGames: provider != palace olan kayıtlar hariç tutulur', async () => {
  await CasinoRound.deleteMany({});
  await createRound({ gameId: 'inhouse_crash', bet: 10, provider: 'inhouse', createdAt: daysAgo(1) });
  await createRound({ gameId: 'palace_game', bet: 10, provider: 'palace', createdAt: daysAgo(1) });

  const result = await getPopularGames(14);
  assert(!result.some(r => r.game_code === 'inhouse_crash'), 'inhouse oyunları listede olmamalı');
  assert(result.some(r => r.game_code === 'palace_game'), 'palace_game listede olmalı');
});

// 6. limit parametresi sonuç sayısını sınırlar (limit=3)
await test('getPopularGames: limit parametresi sonuç sayısını sınırlar', async () => {
  await CasinoRound.deleteMany({});
  for (let i = 0; i < 5; i++) {
    await createRound({ gameId: `game_${i}`, bet: 10, createdAt: daysAgo(1) });
  }

  const result = await getPopularGames(3);
  assert(result.length === 3, `3 sonuç bekleniyor, gelen: ${result.length}`);
});

// 7. Cache: TTL içinde yeni kayıt eklense bile eski sonuç döner (limit=20 — sadece bu test kullanıyor)
await test('getPopularGames: cache TTL içinde yeni kayıt görünmez', async () => {
  await CasinoRound.deleteMany({});
  await createRound({ gameId: 'cached_game', bet: 10, createdAt: daysAgo(1) });

  const first = await getPopularGames(20);
  assert(first.some(r => r.game_code === 'cached_game'), 'ilk çağrıda cached_game olmalı');

  await createRound({ gameId: 'new_after_cache', bet: 10, createdAt: daysAgo(1) });
  const second = await getPopularGames(20);
  assert(!second.some(r => r.game_code === 'new_after_cache'), 'cache TTL içinde yeni kayıt görünmemeli (cache çalışıyor)');
  assert(second.length === first.length, 'cache sonucu değişmemeli');
});

console.log('\n' + '─'.repeat(50));
console.log(`📊 Test Sonucu: ${passed} passed, ${failed} failed`);

await mongoose.disconnect();

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✅ Tüm testler başarılı!');
  process.exit(0);
}
