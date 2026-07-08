import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';

const TEST_DB_URI = 'mongodb://localhost:27017/betzone_test_casino_referral';

console.log('🔥 CasinoRound Referans Komisyonu Testleri\n');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

await mongoose.connect(TEST_DB_URI);
const User = (await import('../src/models/User.js')).default;
const CasinoRound = (await import('../src/models/CasinoRound.js')).default;

async function resetDb() {
  await User.deleteMany({ username: /^test_cr_/ });
  await CasinoRound.deleteMany({});
}

await resetDb();

await test('INHOUSE round: kullanıcı kaybederse (net<0, platform kâr eder) referans edene komisyon ödenir', async () => {
  const referrer = await User.create({ username: 'test_cr_ref1', email: 'cr_ref1@test.com', password: 'x', balance: 0 });
  const user = await User.create({ username: 'test_cr_u1', email: 'cr_u1@test.com', password: 'x', balance: 50, referredBy: referrer._id });

  await CasinoRound.create({
    userId: user._id, gameId: 'g1', provider: 'inhouse',
    bet: 100, payout: 0, net: -100, // kullanıcı kaybetti, platform 100 kâr etti
    balanceBefore: 50, balanceAfter: -50,
  });

  await sleep(200); // post-save hook async, best-effort — kısa bir bekleme
  const updatedReferrer = await User.findById(referrer._id);
  assert(updatedReferrer.balance === 10, `referrer bakiyesi 10 olmalıydı (100*0.10), ${updatedReferrer.balance} bulundu`);
});

await test('INHOUSE round: kullanıcı kazanırsa (net>0, platform zarar eder) ödeme YAPILMAZ', async () => {
  await resetDb();
  const referrer = await User.create({ username: 'test_cr_ref2', email: 'cr_ref2@test.com', password: 'x', balance: 0 });
  const user = await User.create({ username: 'test_cr_u2', email: 'cr_u2@test.com', password: 'x', balance: 50, referredBy: referrer._id });

  await CasinoRound.create({
    userId: user._id, gameId: 'g1', provider: 'inhouse',
    bet: 100, payout: 200, net: 100, // kullanıcı kazandı, platform zarar etti
    balanceBefore: 50, balanceAfter: 150,
  });

  await sleep(200);
  const updatedReferrer = await User.findById(referrer._id);
  assert(updatedReferrer.balance === 0, `referrer bakiyesi 0 kalmalıydı, ${updatedReferrer.balance} bulundu`);
});

await test('PALACE round: post-save hook HİÇ komisyon tetiklemez (Palace session-close\'da ödenir)', async () => {
  await resetDb();
  const referrer = await User.create({ username: 'test_cr_ref3', email: 'cr_ref3@test.com', password: 'x', balance: 0 });
  const user = await User.create({ username: 'test_cr_u3', email: 'cr_u3@test.com', password: 'x', balance: 50, referredBy: referrer._id });

  // Palace bahis kaydı — tek başına net<0 görünür ama sonucu (kazanç kaydı) henüz gelmemiş olabilir.
  // Hook Palace için komisyon ödememeli; ödeme session-close'da toplam net üzerinden yapılır.
  await CasinoRound.create({
    userId: user._id, gameId: 'g1', provider: 'palace',
    bet: 100, payout: 0, net: -100,
    balanceBefore: 50, balanceAfter: -50,
  });

  await sleep(200);
  const updatedReferrer = await User.findById(referrer._id);
  assert(updatedReferrer.balance === 0, `Palace round'da hook komisyon ödememeliydi, referrer bakiyesi 0 kalmalıydı, ${updatedReferrer.balance} bulundu`);
});

await resetDb();
await mongoose.disconnect();

console.log(`\n${passed} geçti, ${failed} kaldı`);
process.exit(failed > 0 ? 1 : 0);
