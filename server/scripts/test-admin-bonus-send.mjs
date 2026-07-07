import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';

const TEST_DB_URI = 'mongodb://localhost:27017/betzone_test_admin_bonus_send';

console.log('🔥 Admin Bonus Send Testleri\n');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

await mongoose.connect(TEST_DB_URI);
const User = (await import('../src/models/User.js')).default;
const BonusWagering = (await import('../src/models/BonusWagering.js')).default;
const Transaction = (await import('../src/models/Transaction.js')).default;
const { updateBalanceSchema } = await import('../src/validators/admin.js');
const adminCtrl = await import('../src/controllers/admin.js');

async function resetDb() {
  await User.deleteMany({ username: /^test_abs_/ });
  await BonusWagering.deleteMany({});
  await Transaction.deleteMany({});
}

function fakeReqRes(userId, adminId, body) {
  const req = { params: { id: userId }, validated: body, user: { id: adminId } };
  let jsonResult = null;
  const res = { json: (obj) => { jsonResult = obj; } };
  const next = (err) => { if (err) throw err; };
  return { req, res, next, getResult: () => jsonResult };
}

await resetDb();

await test('type:bonus → bonusBalance artar, balance DEĞİŞMEZ, BonusWagering oluşur', async () => {
  const admin = await User.create({ username: 'test_abs_admin', email: 'abs_admin@test.com', password: 'x', role: 'admin' });
  const user = await User.create({ username: 'test_abs_user1', email: 'abs_u1@test.com', password: 'x', balance: 50, bonusBalance: 0 });

  const parsed = updateBalanceSchema.parse({ amount: 100, type: 'bonus', note: 'test bonus' });
  const { req, res, next, getResult } = fakeReqRes(user._id.toString(), admin._id.toString(), parsed);
  await adminCtrl.updateBalance(req, res, next);

  const updatedUser = await User.findById(user._id);
  assert(updatedUser.balance === 50, `balance değişmemeliydi (50 bekleniyordu, ${updatedUser.balance} bulundu)`);
  assert(updatedUser.bonusBalance === 100, `bonusBalance 100 olmalıydı, ${updatedUser.bonusBalance} bulundu`);

  const wagering = await BonusWagering.findOne({ userId: user._id });
  assert(wagering !== null, 'BonusWagering oluşturulmalıydı');
  assert(wagering.bonusAmount === 100, 'bonusAmount yanlış');
  assert(wagering.wageringRequired === 3500, `wageringRequired 3500 (100*35) olmalıydı, ${wagering.wageringRequired} bulundu`);
  assert(wagering.multiplier === 35, 'multiplier yanlış');
  assert(wagering.status === 'active', 'status active olmalıydı');
  assert(wagering.source === 'admin_adjustment', 'source admin_adjustment olmalıydı');
  assert(wagering.deadline !== null, 'deadline set edilmeliydi');

  const tx = await Transaction.findOne({ userId: user._id, type: 'bonus' });
  assert(tx !== null, 'Transaction (type:bonus) oluşturulmalıydı');
  assert(tx.amount === 100, 'Transaction amount yanlış');

  const result = getResult();
  assert(result.user !== undefined, 'response user içermeliydi');
});

await test('type:credit hâlâ eskisi gibi çalışır (regresyon)', async () => {
  await resetDb();
  const admin = await User.create({ username: 'test_abs_admin2', email: 'abs_admin2@test.com', password: 'x', role: 'admin' });
  const user = await User.create({ username: 'test_abs_user2', email: 'abs_u2@test.com', password: 'x', balance: 50, bonusBalance: 0 });

  const parsed = updateBalanceSchema.parse({ amount: 30, type: 'credit', note: '' });
  const { req, res, next } = fakeReqRes(user._id.toString(), admin._id.toString(), parsed);
  await adminCtrl.updateBalance(req, res, next);

  const updatedUser = await User.findById(user._id);
  assert(updatedUser.balance === 80, `balance 80 olmalıydı, ${updatedUser.balance} bulundu`);
  assert(updatedUser.bonusBalance === 0, 'bonusBalance değişmemeliydi (credit bonusa dokunmamalı)');

  const wageringCount = await BonusWagering.countDocuments({ userId: user._id });
  assert(wageringCount === 0, 'credit işleminde BonusWagering oluşmamalıydı');
});

await resetDb();
await mongoose.disconnect();

console.log(`\n${passed} geçti, ${failed} kaldı`);
if (failed > 0) process.exit(1);
