// Promotion Claim + BonusWagering integration test
// Claim flow, my-wagerings, convert endpoint, edge cases
//
// Çalıştır: cd server && node scripts/test-promotion-claim.cjs

const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://localhost:27017/betzone_test_promotion_claim';

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
  const Promotion = require('../src/models/Promotion.js').default;
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const CasinoRound = require('../src/models/CasinoRound.js').default;
  const Transaction = require('../src/models/Transaction.js').default;
  await User.deleteMany({});
  await Promotion.deleteMany({});
  await BonusWagering.deleteMany({});
  await CasinoRound.deleteMany({});
  await Transaction.deleteMany({});
}

async function teardown() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

async function createTestUser({ balance = 0, bonusBalance = 0 } = {}) {
  const User = require('../src/models/User.js').default;
  return await User.create({
    username: `promo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    email: `promo_${Date.now()}@test.com`,
    password: 'password123',
    balance,
    bonusBalance,
  });
}

async function createPromotion(opts = {}) {
  const Promotion = require('../src/models/Promotion.js').default;
  return await Promotion.create({
    title: opts.title || 'Test Bonus',
    type: opts.type || 'welcome',
    amount: opts.amount || 100,
    wageringMultiplier: opts.wageringMultiplier || 35,
    deadlineDays: opts.deadlineDays || 30,
    isActive: opts.isActive !== undefined ? opts.isActive : true,
    gameWeights: opts.gameWeights || undefined,
    claimedBy: [],
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────

// 1. claim adds bonusBalance + creates BonusWagering
async function testClaimCreatesBonusAndWagering() {
  console.log('\n[TEST 1] claim: adds bonusBalance + creates BonusWagering');
  const User = require('../src/models/User.js').default;
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const Transaction = require('../src/models/Transaction.js').default;
  const ctrl = require('../src/controllers/promotions.js');

  const user = await createTestUser();
  const promo = await createPromotion({ amount: 200, wageringMultiplier: 30 });

  const req = { params: { id: promo._id.toString() }, user: { id: user._id.toString() } };
  let result;
  const res = { json: (data) => { result = data; } };
  await ctrl.claim(req, res, () => {});

  assert(result.bonusBalance === 200, `bonusBalance = ${result.bonusBalance}`);
  assert(result.wageringRequired === 6000, `wageringRequired = ${result.wageringRequired} (200 * 30)`);

  const updatedUser = await User.findById(user._id);
  assert(updatedUser.bonusBalance === 200, 'user.bonusBalance = 200');

  const wagering = await BonusWagering.findOne({ userId: user._id });
  assert(wagering !== null, 'BonusWagering created');
  assert(wagering.bonusAmount === 200, 'wagering.bonusAmount = 200');
  assert(wagering.wageringRequired === 6000, 'wagering.wageringRequired = 6000');
  assert(wagering.status === 'active', 'wagering.status = active');
  assert(wagering.source === 'promotion', 'wagering.source = promotion');

  const tx = await Transaction.findOne({ userId: user._id, type: 'bonus' });
  assert(tx !== null, 'Transaction (bonus) created');
  assert(tx.amount === 200, 'Transaction amount = 200');
}

// 2. claim rejects if already claimed
async function testClaimRejectsDuplicate() {
  console.log('\n[TEST 2] claim: rejects duplicate (already claimed)');
  const User = require('../src/models/User.js').default;
  const ctrl = require('../src/controllers/promotions.js');

  const user = await createTestUser();
  const promo = await createPromotion();
  promo.claimedBy.push(user._id);
  await promo.save();

  const req = { params: { id: promo._id.toString() }, user: { id: user._id.toString() } };
  let error;
  const res = {};
  await ctrl.claim(req, res, (err) => { error = err; });

  assert(error !== undefined, 'Error thrown');
  assert(error.code === 'ALREADY_CLAIMED', `Error code = ${error.code}`);
}

// 3. claim rejects if promo inactive
async function testClaimRejectsInactive() {
  console.log('\n[TEST 3] claim: rejects inactive promo');
  const ctrl = require('../src/controllers/promotions.js');

  const user = await createTestUser();
  const promo = await createPromotion({ isActive: false });

  const req = { params: { id: promo._id.toString() }, user: { id: user._id.toString() } };
  let error;
  const res = {};
  await ctrl.claim(req, res, (err) => { error = err; });

  assert(error !== undefined, 'Error thrown');
  assert(error.code === 'NOT_FOUND', `Error code = ${error.code}`);
}

// 4. claim with deadline sets wagering deadline
async function testClaimWithDeadline() {
  console.log('\n[TEST 4] claim: wagering deadline set');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const ctrl = require('../src/controllers/promotions.js');

  const user = await createTestUser();
  const promo = await createPromotion({ amount: 50, deadlineDays: 7 });

  const req = { params: { id: promo._id.toString() }, user: { id: user._id.toString() } };
  let result;
  const res = { json: (data) => { result = data; } };
  await ctrl.claim(req, res, () => {});

  const wagering = await BonusWagering.findOne({ userId: user._id });
  assert(wagering.deadline !== null, 'Deadline is set');

  // Deadline ~7 days from now
  const daysDiff = (wagering.deadline - new Date()) / (1000 * 60 * 60 * 24);
  assert(Math.abs(daysDiff - 7) < 0.1, `Deadline ≈ 7 days (actual: ${daysDiff.toFixed(2)})`);
}

// 5. claim with custom game weights
async function testClaimWithCustomWeights() {
  console.log('\n[TEST 5] claim: custom game weights preserved');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const ctrl = require('../src/controllers/promotions.js');

  const user = await createTestUser();
  const customWeights = { sports: 2.0, casino_slot: 0.1, casino_live: 0.5 };
  const promo = await createPromotion({ gameWeights: customWeights });

  const req = { params: { id: promo._id.toString() }, user: { id: user._id.toString() } };
  let result;
  const res = { json: (data) => { result = data; } };
  await ctrl.claim(req, res, () => {});

  const wagering = await BonusWagering.findOne({ userId: user._id });
  assert(wagering.gameWeights.sports === 2.0, `sports weight = ${wagering.gameWeights.sports}`);
  assert(wagering.gameWeights.casino_slot === 0.1, `casino_slot weight = ${wagering.gameWeights.casino_slot}`);
  assert(wagering.gameWeights.casino_live === 0.5, `casino_live weight = ${wagering.gameWeights.casino_live}`);
}

// 6. my-wagerings returns user's wagerings
async function testMyWagerings() {
  console.log('\n[TEST 6] my-wagerings: returns user wagerings');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const ctrl = require('../src/controllers/promotions.js');

  const user1 = await createTestUser();
  const user2 = await createTestUser();

  await BonusWagering.create({
    userId: user1._id,
    source: 'test',
    description: 'User 1 Bonus',
    bonusAmount: 100,
    wageringRequired: 3500,
    wageringProgress: 500,
    status: 'active',
  });
  await BonusWagering.create({
    userId: user2._id,
    source: 'test',
    description: 'User 2 Bonus',
    bonusAmount: 200,
    wageringRequired: 7000,
    wageringProgress: 7000,
    status: 'completed',
  });

  const req = { user: { id: user1._id.toString() } };
  let result;
  const res = { json: (data) => { result = data; } };
  await ctrl.myWagerings(req, res, () => {});

  assert(result.wagerings.length === 1, `Found ${result.wagerings.length} wagerings for user1`);
  assert(result.wagerings[0].description === 'User 1 Bonus', 'user1 wagering returned');
}

// 7. convert endpoint converts completed wagering
async function testConvertEndpoint() {
  console.log('\n[TEST 7] convert endpoint: completed → cash');
  const User = require('../src/models/User.js').default;
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const Transaction = require('../src/models/Transaction.js').default;
  const ctrl = require('../src/controllers/promotions.js');

  const user = await createTestUser({ balance: 500 });
  const wagering = await BonusWagering.create({
    userId: user._id,
    source: 'test',
    description: 'Convertible Bonus',
    bonusAmount: 100,
    wageringRequired: 3500,
    wageringProgress: 3500,
    status: 'completed',
  });

  const req = {
    params: { id: 'test-promo-id', wid: wagering._id.toString() },
    user: { id: user._id.toString() },
  };
  let result;
  const res = { json: (data) => { result = data; } };
  await ctrl.convert(req, res, () => {});

  assert(result.convertedAmount === 100, `convertedAmount = ${result.convertedAmount}`);
  assert(result.newBalance === 600, `newBalance = ${result.newBalance}`);

  const updated = await BonusWagering.findById(wagering._id);
  assert(updated.status === 'converted', 'wagering.status = converted');

  const tx = await Transaction.findOne({ userId: user._id, type: 'bonus_conversion' });
  assert(tx !== null, 'bonus_conversion Transaction created');
  assert(tx.amount === 100, 'Transaction amount = 100');
}

// 8. convert rejects non-completed wagering
async function testConvertRejectsIncomplete() {
  console.log('\n[TEST 8] convert endpoint: rejects incomplete wagering');
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const ctrl = require('../src/controllers/promotions.js');

  const user = await createTestUser();
  const wagering = await BonusWagering.create({
    userId: user._id,
    source: 'test',
    description: 'Incomplete',
    bonusAmount: 100,
    wageringRequired: 3500,
    wageringProgress: 1000,
    status: 'active',
  });

  const req = {
    params: { id: 'test', wid: wagering._id.toString() },
    user: { id: user._id.toString() },
  };
  let error;
  const res = {};
  await ctrl.convert(req, res, (err) => { error = err; });

  assert(error !== undefined, 'Error thrown');
  assert(error.code === 'INVALID_STATE', `Error code = ${error.code}`);
}

// 9. Multiple claim attempts on different promos stack
async function testMultiplePromosStack() {
  console.log('\n[TEST 9] multiple promos: bonusBalance accumulates, separate wagerings');
  const User = require('../src/models/User.js').default;
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const ctrl = require('../src/controllers/promotions.js');

  const user = await createTestUser();
  const promo1 = await createPromotion({ amount: 100 });
  const promo2 = await createPromotion({ amount: 50 });

  for (const promo of [promo1, promo2]) {
    const req = { params: { id: promo._id.toString() }, user: { id: user._id.toString() } };
    const res = { json: () => {} };
    await ctrl.claim(req, res, () => {});
  }

  const updated = await User.findById(user._id);
  assert(updated.bonusBalance === 150, `bonusBalance = ${updated.bonusBalance}`);

  const wagerings = await BonusWagering.find({ userId: user._id });
  assert(wagerings.length === 2, `Created ${wagerings.length} wagerings`);
}

// 10. Race condition: two concurrent claims (only one succeeds)
async function testConcurrentClaims() {
  console.log('\n[TEST 10] concurrent claims: only one succeeds');
  const User = require('../src/models/User.js').default;
  const Promotion = require('../src/models/Promotion.js').default;
  const BonusWagering = require('../src/models/BonusWagering.js').default;
  const ctrl = require('../src/controllers/promotions.js');

  const user = await createTestUser();
  const promo = await createPromotion({ amount: 100 });

  const [r1, r2] = await Promise.all([
    new Promise(resolve => {
      const req = { params: { id: promo._id.toString() }, user: { id: user._id.toString() } };
      const res = { json: resolve };
      ctrl.claim(req, res, () => resolve(null));
    }),
    new Promise(resolve => {
      const req = { params: { id: promo._id.toString() }, user: { id: user._id.toString() } };
      const res = { json: resolve };
      ctrl.claim(req, res, () => resolve(null));
    }),
  ]);

  // One should succeed (json called), one should fail (next called with error)
  const successes = [r1, r2].filter(r => r !== null);
  assert(successes.length === 1, `Only 1 success (got ${successes.length})`);

  const updated = await User.findById(user._id);
  assert(updated.bonusBalance === 100, `bonusBalance = ${updated.bonusBalance} (single claim)`);

  const wagerings = await BonusWagering.find({ userId: user._id });
  assert(wagerings.length === 1, `Created ${wagerings.length} wagerings`);
}

// ─── Run ────────────────────────────────────────────────────────────────
async function run() {
  console.log('🔧 Promotion Claim + BonusWagering test suite');
  console.log('═'.repeat(60));

  await setup();
  console.log('✓ Test DB hazır');

  await testClaimCreatesBonusAndWagering();
  await testClaimRejectsDuplicate();
  await testClaimRejectsInactive();
  await testClaimWithDeadline();
  await testClaimWithCustomWeights();
  await testMyWagerings();
  await testConvertEndpoint();
  await testConvertRejectsIncomplete();
  await testMultiplePromosStack();
  await testConcurrentClaims();

  console.log('\n' + '═'.repeat(60));
  console.log(`Sonuç: ${testsPassed} passed, ${testsFailed} failed`);

  await teardown();
  process.exit(testsFailed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test crashed:', err);
  teardown().finally(() => process.exit(1));
});