import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';

const TEST_DB_URI = 'mongodb://localhost:27017/betzone_test_user_casino_summary';

console.log('🔥 Kullanıcı Casino Özeti Testleri\n');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

await mongoose.connect(TEST_DB_URI);
const User = (await import('../src/models/User.js')).default;
const CasinoRound = (await import('../src/models/CasinoRound.js')).default;
const BonusWagering = (await import('../src/models/BonusWagering.js')).default;
const adminCtrl = await import('../src/controllers/admin.js');

async function resetDb() {
  await User.deleteMany({ username: /^test_ucs_/ });
  await CasinoRound.deleteMany({});
  await BonusWagering.deleteMany({});
}

function fakeReqRes(userId, query = {}) {
  const req = { params: { id: userId }, query };
  let jsonResult = null;
  const res = { json: (obj) => { jsonResult = obj; } };
  const next = (err) => { if (err) throw err; };
  return { req, res, next, getResult: () => jsonResult };
}

await resetDb();

await test('oyun bazlı kırılım doğru gruplanır', async () => {
  const user = await User.create({ username: 'test_ucs_u1', email: 'ucs1@test.com', password: 'x' });
  await CasinoRound.create([
    { userId: user._id, gameId: 'g1', gameTitle: 'Game One', provider: 'palace', bet: 10, payout: 5, net: 5, balanceBefore: 100, balanceAfter: 95 },
    { userId: user._id, gameId: 'g1', gameTitle: 'Game One', provider: 'palace', bet: 20, payout: 25, net: -5, balanceBefore: 95, balanceAfter: 100 },
    { userId: user._id, gameId: 'g2', gameTitle: 'Game Two', provider: 'inhouse', bet: 15, payout: 0, net: 15, balanceBefore: 100, balanceAfter: 85 },
  ]);

  const { req, res, next, getResult } = fakeReqRes(user._id.toString());
  await adminCtrl.getUserCasinoRounds(req, res, next);
  const result = getResult();

  assert(result.summary !== undefined, 'summary alanı olmalıydı');
  const byGame = result.summary.byGame;
  assert(byGame.length === 2, `2 farklı oyun bekleniyordu, ${byGame.length} bulundu`);
  const g1 = byGame.find(g => g._id === 'g1');
  assert(g1.rounds === 2, 'g1 rounds yanlış');
  assert(g1.totalBet === 30, `g1 totalBet 30 bekleniyordu, ${g1.totalBet} bulundu`);
  const g2 = byGame.find(g => g._id === 'g2');
  assert(g2.rounds === 1, 'g2 rounds yanlış');
});

await test('aktif bonus penceresine düşen round bonusAttributedBet\'e, düşmeyen realBet\'e sayılır', async () => {
  await resetDb();
  const user = await User.create({ username: 'test_ucs_u2', email: 'ucs2@test.com', password: 'x' });

  const bonusStart = new Date('2026-01-10T00:00:00Z');
  const bonusEnd   = new Date('2026-01-20T00:00:00Z');
  await BonusWagering.create({
    userId: user._id, bonusAmount: 100, wageringRequired: 3500, status: 'completed',
    createdAt: bonusStart, completedAt: bonusEnd,
  });

  await CasinoRound.create([
    // bonus penceresi İÇİNDE (bonusStart..bonusEnd arası)
    { userId: user._id, gameId: 'g1', provider: 'palace', bet: 50, payout: 0, net: 50, balanceBefore: 100, balanceAfter: 50, createdAt: new Date('2026-01-15T00:00:00Z') },
    // bonus penceresi DIŞINDA (bonusEnd'den sonra)
    { userId: user._id, gameId: 'g1', provider: 'palace', bet: 30, payout: 0, net: 30, balanceBefore: 50, balanceAfter: 20, createdAt: new Date('2026-02-01T00:00:00Z') },
  ]);

  const { req, res, next, getResult } = fakeReqRes(user._id.toString());
  await adminCtrl.getUserCasinoRounds(req, res, next);
  const result = getResult();

  assert(result.summary.bonusAttributedBet === 50, `bonusAttributedBet 50 bekleniyordu, ${result.summary.bonusAttributedBet} bulundu`);
  assert(result.summary.realBet === 30, `realBet 30 bekleniyordu, ${result.summary.realBet} bulundu`);
});

await test('aktif (hâlâ tamamlanmamış) bonus penceresi Infinity\'e kadar sayılır', async () => {
  await resetDb();
  const user = await User.create({ username: 'test_ucs_u3', email: 'ucs3@test.com', password: 'x' });

  await BonusWagering.create({
    userId: user._id, bonusAmount: 100, wageringRequired: 3500, status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });

  await CasinoRound.create([
    { userId: user._id, gameId: 'g1', provider: 'palace', bet: 40, payout: 0, net: 40, balanceBefore: 100, balanceAfter: 60, createdAt: new Date('2026-06-01T00:00:00Z') },
  ]);

  const { req, res, next, getResult } = fakeReqRes(user._id.toString());
  await adminCtrl.getUserCasinoRounds(req, res, next);
  const result = getResult();

  assert(result.summary.bonusAttributedBet === 40, `hâlâ aktif bonus penceresine düşmeliydi, ${result.summary.bonusAttributedBet} bulundu`);
  assert(result.summary.realBet === 0, 'realBet 0 olmalıydı');
});

await resetDb();
await mongoose.disconnect();

console.log(`\n${passed} geçti, ${failed} kaldı`);
if (failed > 0) process.exit(1);
