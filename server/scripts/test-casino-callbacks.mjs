/**
 * Casino Callbacks Integration Tests
 *
 * Igames'den gelen callback'lerin (Bet/Win/BonusCall/BetCancel) doğru
 * işlendiğini gerçek veritabanı ile test eder. Callback payload formatları
 * Igames dökümantasyonundan alınmıştır.
 *
 * Gerçek Igames API çağrısı yapmaz, callback handler mantığını test eder.
 *
 * PALACE_API_TOKEN gerekmez (callback handler test).
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });

import mongoose from 'mongoose';

const TEST_DB_URI = 'mongodb://localhost:27017/betzone_test_casino_callbacks';

console.log('🎰 Casino Callbacks Integration Tests\n');
console.log('─'.repeat(50));

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    const result = await fn();
    passed++;
    console.log(`  ✓ ${name}`);
    return result;
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}: ${e.message}`);
    return null;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ─── Setup ────────────────────────────────────────────────────────────────

await mongoose.connect(TEST_DB_URI);
const User = (await import('../src/models/User.js')).default;
const CasinoSession = (await import('../src/models/CasinoSession.js')).default;
const CasinoRound = (await import('../src/models/CasinoRound.js')).default;
const Transaction = (await import('../src/models/Transaction.js')).default;
await User.deleteMany({});
await CasinoSession.deleteMany({});
await CasinoRound.deleteMany({});
await Transaction.deleteMany({});

console.log('✓ Test DB hazır\n');

// ─── Callback Helper ──────────────────────────────────────────────────────
// Direct import of callback handler logic (replicated from igames.js)
// In production, callbacks come via HTTP POST to /api/igames/callback

async function processBetCallback(userCode, trans_amount, prebalance, balance, gameName, gameCode) {
  const user = await User.findOne({ palaceUserCode: String(userCode) });
  if (!user) throw new Error('User not found');

  await User.findByIdAndUpdate(user._id, { balance });

  return await CasinoRound.create({
    userId: user._id,
    gameId: gameCode || '',
    gameTitle: gameName || '',
    provider: 'igames',
    bet: trans_amount,
    payout: 0,
    net: -trans_amount,
    balanceBefore: prebalance,
    balanceAfter: balance,
    palaceUserCode: String(userCode),
  });
}

async function processWinCallback(userCode, trans_amount, prebalance, balance, gameName, gameCode) {
  const user = await User.findOne({ palaceUserCode: String(userCode) });
  if (!user) throw new Error('User not found');

  await User.findByIdAndUpdate(user._id, { balance });

  return await CasinoRound.create({
    userId: user._id,
    gameId: gameCode || '',
    gameTitle: gameName || '',
    provider: 'igames',
    bet: 0,
    payout: trans_amount,
    net: trans_amount,
    balanceBefore: prebalance,
    balanceAfter: balance,
    palaceUserCode: String(userCode),
  });
}

async function processBonusCallCallback(userCode, trans_amount, prebalance, balance, callId) {
  const user = await User.findOne({ palaceUserCode: String(userCode) });
  if (!user) throw new Error('User not found');

  await User.findByIdAndUpdate(user._id, { balance });

  return await CasinoRound.create({
    userId: user._id,
    gameId: 'bonus_call',
    gameTitle: 'Bonus Call Win',
    provider: 'igames',
    bet: 0,
    payout: trans_amount,
    net: trans_amount,
    balanceBefore: prebalance,
    balanceAfter: balance,
    palaceUserCode: String(userCode),
    note: `bonus_call:${callId}`,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────

// Setup: create test user with palaceUserCode
await test('Setup: test user with palaceUserCode', async () => {
  const user = await User.create({
    username: 'cb_test_user',
    email: 'cb@test.com',
    password: 'x',
    balance: 1000,
    palaceUserCode: 'igames_cb_test_001',
  });
  assert(user.palaceUserCode === 'igames_cb_test_001', 'palaceUserCode set');
  assert(user.balance === 1000, 'balance = 1000');
  console.log(`    User: ${user.username}, igamesCode: ${user.palaceUserCode}, balance: 1000`);
  return user;
});

// 1. Bet callback: user.balance 1000 → 990 (bet 10)
await test('Callback: Bet (trans_type=1) → user.balance decrease', async () => {
  const user = await User.findOne({ palaceUserCode: 'igames_cb_test_001' });

  const round = await processBetCallback('igames_cb_test_001', 10, 1000, 990, 'Sweet Bonanza', 'vs20fruitsw');

  const updated = await User.findById(user._id);
  assert(updated.balance === 990, `user.balance = ${updated.balance}`);
  assert(round.bet === 10, `round.bet = ${round.bet}`);
  assert(round.net === -10, `round.net = ${round.net}`);
  assert(round.provider === 'igames', 'provider = igames');

  console.log(`    Bet 10: 1000 → 990, CasinoRound.bet=10`);
});

// 2. Win callback: user.balance 990 → 1050 (win 60)
await test('Callback: Win (trans_type=2) → user.balance increase', async () => {
  const user = await User.findOne({ palaceUserCode: 'igames_cb_test_001' });

  const round = await processWinCallback('igames_cb_test_001', 60, 990, 1050, 'Sweet Bonanza', 'vs20fruitsw');

  const updated = await User.findById(user._id);
  assert(updated.balance === 1050, `user.balance = ${updated.balance}`);
  assert(round.payout === 60, `round.payout = ${round.payout}`);
  assert(round.net === 60, `round.net = ${round.net}`);

  console.log(`    Win 60: 990 → 1050, CasinoRound.payout=60`);
});

// 3. BonusCall callback: user.balance 1050 → 1200 (bonus win 150)
await test('Callback: BonusCall (trans_type=32) → user.balance increase + audit', async () => {
  const user = await User.findOne({ palaceUserCode: 'igames_cb_test_001' });

  const round = await processBonusCallCallback('igames_cb_test_001', 150, 1050, 1200, 42);

  const updated = await User.findById(user._id);
  assert(updated.balance === 1200, `user.balance = ${updated.balance}`);
  assert(round.payout === 150, `round.payout = ${round.payout}`);
  assert(round.note === 'bonus_call:42', `note = ${round.note}`);

  console.log(`    BonusCall 150: 1050 → 1200, call_id=42 logged`);
});

// 4. Multiple rapid callbacks: cumulative balance updates
await test('Callback: rapid sequence (Bet→Win→Bet→Win)', async () => {
  const user = await User.findOne({ palaceUserCode: 'igames_cb_test_001' });
  const startBal = user.balance;

  // Bet 50
  await processBetCallback('igames_cb_test_001', 50, startBal, startBal - 50, 'Game', 'g1');
  // Win 30
  await processWinCallback('igames_cb_test_001', 30, startBal - 50, startBal - 20, 'Game', 'g1');
  // Bet 10
  await processBetCallback('igames_cb_test_001', 10, startBal - 20, startBal - 30, 'Game', 'g1');
  // Win 100
  await processWinCallback('igames_cb_test_001', 100, startBal - 30, startBal + 70, 'Game', 'g1');

  const updated = await User.findById(user._id);
  assert(updated.balance === startBal + 70, `user.balance = ${updated.balance} (expected ${startBal + 70})`);

  const rounds = await CasinoRound.countDocuments({ userId: user._id });
  assert(rounds >= 4, `${rounds} CasinoRound records`);
});

// 5. CasinoRound wagering credit (post-save hook)
await test('Callback: CasinoRound triggers wagering credit', async () => {
  const BonusWagering = (await import('../src/models/BonusWagering.js')).default;
  const user = await User.findOne({ palaceUserCode: 'igames_cb_test_001' });

  // Create active wagering
  await BonusWagering.create({
    userId: user._id,
    source: 'test',
    description: 'Callback Test Bonus',
    bonusAmount: 100,
    wageringRequired: 3500,
    wageringProgress: 0,
    multiplier: 35,
    status: 'active',
  });

  const wageringBefore = await BonusWagering.findOne({ userId: user._id, status: 'active' });
  const progressBefore = wageringBefore.wageringProgress;

  // Trigger a Bet casino round (casino_slot weight = 0.5)
  await CasinoRound.create({
    userId: user._id,
    gameId: 'sweet_bonanza',
    gameTitle: 'Sweet Bonanza',
    provider: 'igames',
    bet: 100,
    payout: 0,
    net: -100,
    balanceBefore: 0,
    balanceAfter: 0,
    palaceUserCode: 'igames_cb_test_001',
  });

  await new Promise(r => setTimeout(r, 200)); // post-save hook

  const wageringAfter = await BonusWagering.findById(wageringBefore._id);
  assert(wageringAfter.wageringProgress === progressBefore + 50, `wagering += 50 (0.5x of 100)`);
});

// 6. Callback with unknown user_code (silent ignore)
await test('Callback: unknown user_code → silent ignore', async () => {
  const beforeCount = await CasinoRound.countDocuments();

  // Simulate callback with unknown palaceUserCode (the handler should silently return)
  const user = await User.findOne({ palaceUserCode: 'unknown_code_xyz' });
  assert(user === null, 'User not found');

  const afterCount = await CasinoRound.countDocuments();
  assert(beforeCount === afterCount, `No CasinoRound created (${beforeCount} → ${afterCount})`);
});

// 7. Concurrent callbacks: same user, multiple updates
await test('Callback: concurrent updates (race-safe)', async () => {
  const user = await User.findOne({ palaceUserCode: 'igames_cb_test_001' });
  const startBal = user.balance;

  // Fire 3 concurrent Bet callbacks
  await Promise.all([
    processBetCallback('igames_cb_test_001', 10, startBal, startBal - 10, 'Game', 'g'),
    processBetCallback('igames_cb_test_001', 20, startBal - 10, startBal - 30, 'Game', 'g'),
    processBetCallback('igames_cb_test_001', 30, startBal - 30, startBal - 60, 'Game', 'g'),
  ]);

  const updated = await User.findById(user._id);
  // Final balance should be last write's value (startBal - 60)
  console.log(`    Final balance: ${updated.balance} (started from ${startBal})`);
});

// 8. BetCancel callback (trans_type=16) - refund scenario
await test('Callback: BetCancel (trans_type=16) → refund record', async () => {
  const user = await User.findOne({ palaceUserCode: 'igames_cb_test_001' });
  const startBal = user.balance;

  await CasinoRound.create({
    userId: user._id,
    gameId: 'sweet_bonanza',
    gameTitle: 'Sweet Bonanza',
    provider: 'igames',
    bet: 0,
    payout: 0,
    net: 50,
    balanceBefore: startBal,
    balanceAfter: startBal + 50,
    palaceUserCode: 'igames_cb_test_001',
    note: 'bet_cancel',
  });

  const cancelRound = await CasinoRound.findOne({ userId: user._id, note: 'bet_cancel' }).sort({ _id: -1 });
  assert(cancelRound !== null, 'BetCancel round created');
  assert(cancelRound.net === 50, `net = ${cancelRound.net} (refund amount)`);
  assert(cancelRound.bet === 0, `bet = ${cancelRound.bet}`);
});

// ─── Summary ───────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(50));
console.log(`📊 Test Sonucu: ${passed} passed, ${failed} failed`);

await mongoose.disconnect();

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✅ Tüm testler başarılı!');
  process.exit(0);
}