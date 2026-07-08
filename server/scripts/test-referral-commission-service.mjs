import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';

const TEST_DB_URI = 'mongodb://localhost:27017/betzone_test_referral_commission_service';

console.log('🔥 payReferralCommission() Testleri\n');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

await mongoose.connect(TEST_DB_URI);
const User = (await import('../src/models/User.js')).default;
const Transaction = (await import('../src/models/Transaction.js')).default;
const { payReferralCommission } = await import('../src/services/referralCommission.js');

async function resetDb() {
  await User.deleteMany({ username: /^test_rcs_/ });
  await Transaction.deleteMany({});
}

await resetDb();

await test('referredBy yoksa no-op, hiçbir şey değişmez', async () => {
  const user = await User.create({ username: 'test_rcs_u1', email: 'rcs1@test.com', password: 'x', balance: 50 });
  const result = await payReferralCommission(user._id, 100);
  assert(result === null, 'null dönmeliydi');
});

await test('houseProfit <= 0 ise no-op', async () => {
  await resetDb();
  const referrer = await User.create({ username: 'test_rcs_ref1', email: 'rcsref1@test.com', password: 'x', balance: 0 });
  const user = await User.create({ username: 'test_rcs_u2', email: 'rcs2@test.com', password: 'x', balance: 50, referredBy: referrer._id });
  const result = await payReferralCommission(user._id, 0);
  assert(result === null, 'houseProfit=0 için null dönmeliydi');
  const result2 = await payReferralCommission(user._id, -10);
  assert(result2 === null, 'negatif houseProfit için null dönmeliydi');
  const updatedReferrer = await User.findById(referrer._id);
  assert(updatedReferrer.balance === 0, 'referrer bakiyesi değişmemeliydi');
});

await test('pozitif houseProfit: referrer bakiyesine %10 eklenir + Transaction oluşur', async () => {
  await resetDb();
  const referrer = await User.create({ username: 'test_rcs_ref2', email: 'rcsref2@test.com', password: 'x', balance: 20 });
  const user = await User.create({ username: 'test_rcs_u3', email: 'rcs3@test.com', password: 'x', balance: 50, referredBy: referrer._id });

  const commission = await payReferralCommission(user._id, 100);
  assert(commission === 10, `commission 10 olmalıydı, ${commission} bulundu`);

  const updatedReferrer = await User.findById(referrer._id);
  assert(updatedReferrer.balance === 30, `referrer bakiyesi 30 olmalıydı, ${updatedReferrer.balance} bulundu`);
  assert(updatedReferrer.totalReferralEarnings === 10, `totalReferralEarnings 10 olmalıydı, ${updatedReferrer.totalReferralEarnings} bulundu`);

  const tx = await Transaction.findOne({ userId: referrer._id, type: 'referral_commission' });
  assert(tx !== null, 'Transaction oluşturulmalıydı');
  assert(tx.amount === 10, 'Transaction amount yanlış');
  assert(tx.balanceBefore === 20, 'Transaction balanceBefore yanlış');
  assert(tx.balanceAfter === 30, 'Transaction balanceAfter yanlış');
});

await test('ikinci bir çağrı kümülatif olarak eklenir (totalReferralEarnings biriken bir sayaç)', async () => {
  await resetDb();
  const referrer = await User.create({ username: 'test_rcs_ref3', email: 'rcsref3@test.com', password: 'x', balance: 0 });
  const user = await User.create({ username: 'test_rcs_u4', email: 'rcs4@test.com', password: 'x', balance: 50, referredBy: referrer._id });

  await payReferralCommission(user._id, 100); // +10
  await payReferralCommission(user._id, 50);  // +5

  const updatedReferrer = await User.findById(referrer._id);
  assert(updatedReferrer.balance === 15, `referrer bakiyesi 15 olmalıydı, ${updatedReferrer.balance} bulundu`);
  assert(updatedReferrer.totalReferralEarnings === 15, `totalReferralEarnings 15 olmalıydı, ${updatedReferrer.totalReferralEarnings} bulundu`);

  const txCount = await Transaction.countDocuments({ userId: referrer._id, type: 'referral_commission' });
  assert(txCount === 2, `2 ayrı Transaction bekleniyordu, ${txCount} bulundu`);
});

await resetDb();
await mongoose.disconnect();

console.log(`\n${passed} geçti, ${failed} kaldı`);
process.exit(failed > 0 ? 1 : 0);
