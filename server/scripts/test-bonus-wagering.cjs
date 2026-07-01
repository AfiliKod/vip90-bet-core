// Bonus Wagering System entegrasyon testi
//
// Çalıştır: cd server && node scripts/test-bonus-wagering.cjs

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://localhost:27017/betzone_test_bonus_wagering';

// ─── Test helpers ────────────────────────────────────────────────────────
let testsPassed = 0;
let testsFailed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
    testsPassed++;
  } else {
    console.log(`  ✗ ${msg}`);
    testsFailed++;
  }
}

async function setup() {
  await mongoose.connect(MONGODB_URI);
  const User = require('../src/models/User.js').default;
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const CasinoRound = require('../src/models/CasinoRound.js').default;
  const Transaction = require('../src/models/Transaction.js').default;
  await User.deleteMany({});
  await BonusWagering.deleteMany({});
  await CasinoRound.deleteMany({});
  await Transaction.deleteMany({});
}

async function teardown() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

async function createTestUser({ balance = 1000, bonusBalance = 0 } = {}) {
  const User = require('../src/models/User.js').default;
  return await User.create({
    username: `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    email: `t_${Date.now()}@test.com`,
    password: 'password123',
    balance,
    bonusBalance,
  });
}

async function createActiveWagering(userId, opts = {}) {
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  return await BonusWagering.create({
    userId,
    promotionId: opts.promotionId || null,
    source: opts.source || 'promotion',
    description: opts.description || 'Test Bonus',
    bonusAmount: opts.bonusAmount || 100,
    wageringRequired: opts.wageringRequired || (opts.bonusAmount || 100) * 35,
    wageringProgress: opts.wageringProgress || 0,
    multiplier: opts.multiplier || 35,
    gameWeights: opts.gameWeights || undefined,
    deadline: opts.deadline || null,
    status: 'active',
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────
async function testRecordWageringSports() {
  console.log('\n[TEST 1] Sports bet: 100% wagering credit');
  const User = require('../src/models/User.js').default;
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const { recordWagering } = require('../src/services/wagering.js');

  const user = await createTestUser();
  const w = await createActiveWagering(user._id, { bonusAmount: 100, wageringRequired: 3500 });

  const completed = await recordWagering(user._id, 'sports', 100);

  const updated = await BonusWagering.findById(w._id);
  assert(updated.wageringProgress === 100, 'Wagering progress = 100 (1.0x credit)');
  assert(updated.status === 'active', 'Still active (3500 - 100 < 3500)');
  assert(completed.length === 0, 'No completion');
}

async function testRecordWageringCasinoSlot() {
  console.log('\n[TEST 2] Casino slot: 50% wagering credit');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const { recordWagering } = require('../src/services/wagering.js');

  const user = await createTestUser();
  const w = await createActiveWagering(user._id, { bonusAmount: 100, wageringRequired: 3500 });

  await recordWagering(user._id, 'casino_slot', 100);

  const updated = await BonusWagering.findById(w._id);
  assert(updated.wageringProgress === 50, 'Wagering progress = 50 (0.5x credit)');
}

async function testRecordWageringCasinoLive() {
  console.log('\n[TEST 3] Casino live: 70% wagering credit');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const { recordWagering } = require('../src/services/wagering.js');

  const user = await createTestUser();
  const w = await createActiveWagering(user._id, { bonusAmount: 100, wageringRequired: 3500 });

  await recordWagering(user._id, 'casino_live', 100);

  const updated = await BonusWagering.findById(w._id);
  assert(updated.wageringProgress === 70, 'Wagering progress = 70 (0.7x credit)');
}

async function testCompletion() {
  console.log('\n[TEST 4] Wagering completion at threshold');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const { recordWagering } = require('../src/services/wagering.js');

  const user = await createTestUser();
  const w = await createActiveWagering(user._id, { bonusAmount: 100, wageringRequired: 350, wageringProgress: 300 });

  // 100 more at 100% credit = exactly 400, but capped at 350 → completed
  const completed = await recordWagering(user._id, 'sports', 100);

  const updated = await BonusWagering.findById(w._id);
  assert(updated.wageringProgress === 350, 'Wagering progress capped at 350');
  assert(updated.status === 'completed', 'Status auto-set to completed');
  assert(updated.completedAt !== null, 'completedAt timestamp set');
  assert(completed.length === 1, '1 wagering returned as completed');
}

async function testMultipleActiveWagerings() {
  console.log('\n[TEST 5] Multiple active bonuses all get credit');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const { recordWagering } = require('../src/services/wagering.js');

  const user = await createTestUser();
  const w1 = await createActiveWagering(user._id, { bonusAmount: 100, wageringRequired: 3500, description: 'Bonus 1' });
  const w2 = await createActiveWagering(user._id, { bonusAmount: 200, wageringRequired: 7000, description: 'Bonus 2' });

  await recordWagering(user._id, 'sports', 100);

  const updated1 = await BonusWagering.findById(w1._id);
  const updated2 = await BonusWagering.findById(w2._id);
  assert(updated1.wageringProgress === 100, 'Bonus 1 progress = 100 (100 * 1.0)');
  assert(updated2.wageringProgress === 100, 'Bonus 2 progress = 100 (100 * 1.0)');
}

async function testCustomGameWeights() {
  console.log('\n[TEST 6] Custom game weights per bonus');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const { recordWagering } = require('../src/services/wagering.js');

  const user = await createTestUser();
  const w = await createActiveWagering(user._id, {
    bonusAmount: 100,
    wageringRequired: 3500,
    gameWeights: { sports: 1.5, casino_slot: 0.3 },
  });

  await recordWagering(user._id, 'sports', 100);
  await recordWagering(user._id, 'casino_slot', 100);

  const updated = await BonusWagering.findById(w._id);
  // sports: 100 * 1.5 = 150, casino_slot: 100 * 0.3 = 30 → 180 total
  assert(updated.wageringProgress === 180, 'Custom weights applied (1.5x sports, 0.3x slot)');
}

async function testExpiredWagering() {
  console.log('\n[TEST 7] Expired wagering marked on next bet');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const { recordWagering } = require('../src/services/wagering.js');

  const user = await createTestUser();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
  const w = await createActiveWagering(user._id, { bonusAmount: 100, wageringRequired: 3500, deadline: past });

  await recordWagering(user._id, 'sports', 100);

  const updated = await BonusWagering.findById(w._id);
  assert(updated.status === 'expired', 'Expired wagering marked');
  assert(updated.wageringProgress === 0, 'No credit added to expired wagering');
}

async function testConvertBonus() {
  console.log('\n[TEST 8] Bonus conversion: completed → cash');
  const User = require('../src/models/User.js').default;
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const Transaction = require('../src/models/Transaction.js').default;
  const { convertBonus } = require('../src/services/wagering.js');

  const user = await createTestUser({ balance: 500 });
  const w = await createActiveWagering(user._id, { bonusAmount: 100 });
  w.status = 'completed';
  await w.save();

  const result = await convertBonus(w._id.toString(), user._id.toString());

  assert(result !== null, 'convertBonus returned result');
  assert(result.convertedAmount === 100, 'convertedAmount = 100');

  const updatedUser = await User.findById(user._id);
  assert(updatedUser.balance === 600, 'user.balance = 500 + 100 = 600');

  const updatedWagering = await BonusWagering.findById(w._id);
  assert(updatedWagering.status === 'converted', 'Wagering marked converted');
  assert(updatedWagering.convertedAt !== null, 'convertedAt timestamp set');

  const tx = await Transaction.findOne({ userId: user._id, type: 'bonus_conversion' });
  assert(tx !== null, 'Transaction (bonus_conversion) created');
  assert(tx.amount === 100, 'Transaction amount = 100');
}

async function testConvertAlreadyConverted() {
  console.log('\n[TEST 9] Re-convert: already converted → null');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const { convertBonus } = require('../src/services/wagering.js');

  const user = await createTestUser();
  const w = await createActiveWagering(user._id, { bonusAmount: 100 });
  w.status = 'converted';
  await w.save();

  const result = await convertBonus(w._id.toString(), user._id.toString());
  assert(result === null, 'Returns null for already converted');
}

async function testConvertNotCompleted() {
  console.log('\n[TEST 10] Convert incomplete wagering → null');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const { convertBonus } = require('../src/services/wagering.js');

  const user = await createTestUser();
  const w = await createActiveWagering(user._id, { bonusAmount: 100, wageringRequired: 3500 });

  const result = await convertBonus(w._id.toString(), user._id.toString());
  assert(result === null, 'Returns null for incomplete wagering');
}

async function testForfeitActiveWagerings() {
  console.log('\n[TEST 11] Forfeit active wagerings on withdraw');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const { forfeitActiveWagerings } = require('../src/services/wagering.js');

  const user = await createTestUser();
  const w1 = await createActiveWagering(user._id, { bonusAmount: 100, wageringRequired: 3500, wageringProgress: 350 });
  const w2 = await createActiveWagering(user._id, { bonusAmount: 200, wageringRequired: 7000, wageringProgress: 7000 });

  const result = await forfeitActiveWagerings(user._id);

  assert(result.items.length === 2, '2 wagerings forfeited');
  // w1: remaining 3150/3500 = 90% × 100 = 90 forfeit
  // w2: remaining 0/7000 = 0% × 200 = 0 forfeit
  assert(Math.abs(result.totalForfeitedAmount - 90) < 0.01, `Total forfeited = 90 (got ${result.totalForfeitedAmount})`);

  const updated1 = await BonusWagering.findById(w1._id);
  const updated2 = await BonusWagering.findById(w2._id);
  assert(updated1.status === 'forfeited', 'W1 forfeited');
  assert(updated2.status === 'forfeited', 'W2 forfeited');
}

async function testMultipleSportsBets() {
  console.log('\n[TEST 12] Multiple sports bets accumulate');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const { recordWagering } = require('../src/services/wagering.js');

  const user = await createTestUser();
  const w = await createActiveWagering(user._id, { bonusAmount: 100, wageringRequired: 3500 });

  await recordWagering(user._id, 'sports', 500);
  await recordWagering(user._id, 'sports', 1500);
  await recordWagering(user._id, 'sports', 2000);

  const updated = await BonusWagering.findById(w._id);
  assert(updated.wageringProgress === 3500, 'Progress = 3500 (capped at required)');
  assert(updated.status === 'completed', 'Status = completed');
}

// ─── Run ────────────────────────────────────────────────────────────────
async function run() {
  console.log('🔧 Bonus Wagering System entegrasyon testi');
  console.log('═'.repeat(60));

  await setup();
  console.log('✓ Test DB hazır');

  await testRecordWageringSports();
  await testRecordWageringCasinoSlot();
  await testRecordWageringCasinoLive();
  await testCompletion();
  await testMultipleActiveWagerings();
  await testCustomGameWeights();
  await testExpiredWagering();
  await testConvertBonus();
  await testConvertAlreadyConverted();
  await testConvertNotCompleted();
  await testForfeitActiveWagerings();
  await testMultipleSportsBets();

  console.log('\n' + '═'.repeat(60));
  console.log(`Sonuç: ${testsPassed} passed, ${testsFailed} failed`);

  await teardown();
  process.exit(testsFailed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test crashed:', err);
  teardown().finally(() => process.exit(1));
});