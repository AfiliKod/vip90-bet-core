import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';

const TEST_DB_URI = 'mongodb://localhost:27017/betzone_test_withdrawal_lock_gate';

console.log('🔥 Çekim Kapısı (Kilitli Bakiye) Testleri\n');
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
const BankDepositRequest = (await import('../src/models/BankDepositRequest.js')).default;
const txCtrl = await import('../src/controllers/transactions.js');
const bankCtrl = await import('../src/controllers/bank.js');

async function resetDb() {
  await User.deleteMany({ username: /^test_wlg_/ });
  await BonusWagering.deleteMany({});
  await Transaction.deleteMany({});
  await BankDepositRequest.deleteMany({});
}

function fakeReqRes(userId, validated) {
  const req = { user: { id: userId }, validated };
  let jsonResult = null, statusCode = null;
  const res = {
    status: (code) => { statusCode = code; return res; },
    json: (obj) => { jsonResult = obj; },
  };
  const next = (err) => { if (err) throw err; };
  return { req, res, next, getResult: () => jsonResult, getStatus: () => statusCode };
}

const VALID_IBAN = 'TR330006100519786457841326';

await resetDb();

await test('transactions.withdraw: aktif bonus yokken normal çekim çalışır (regresyon)', async () => {
  const user = await User.create({ username: 'test_wlg_u1', email: 'wlg1@test.com', password: 'x', balance: 200 });

  const { req, res, next, getResult } = fakeReqRes(user._id.toString(), { amount: 50, iban: VALID_IBAN, fullName: 'Test User', confirmForfeit: false });
  await txCtrl.withdraw(req, res, next);

  const result = getResult();
  assert(result.newBalance === 150, `newBalance 150 olmalıydı, ${result?.newBalance} bulundu`);

  const updated = await User.findById(user._id);
  assert(updated.balance === 150, `balance 150 olmalıydı, ${updated.balance} bulundu`);
});

await test('transactions.withdraw: withdrawable aşan tutar + aktif bonus + confirmForfeit yok → 409 ACTIVE_BONUS_LOCK', async () => {
  await resetDb();
  const user = await User.create({ username: 'test_wlg_u2', email: 'wlg2@test.com', password: 'x', balance: 150 });
  await BonusWagering.create({
    userId: user._id, source: 'promotion', description: 'Test',
    bonusAmount: 100, wageringRequired: 3500, wageringProgress: 0,
    multiplier: 35, status: 'active',
  });
  // withdrawable = 150 - 100 = 50

  const { req, res, next } = fakeReqRes(user._id.toString(), { amount: 80, iban: VALID_IBAN, fullName: 'Test User', confirmForfeit: false });
  let error;
  await txCtrl.withdraw(req, res, (e) => { error = e; });

  assert(error !== undefined, 'Hata dönmeliydi');
  assert(error.code === 'ACTIVE_BONUS_LOCK', `Error code ACTIVE_BONUS_LOCK olmalıydı, ${error.code} bulundu`);

  const updated = await User.findById(user._id);
  assert(updated.balance === 150, `balance değişmemeliydi (150), ${updated.balance} bulundu`);

  const wagering = await BonusWagering.findOne({ userId: user._id });
  assert(wagering.status === 'active', 'wagering hâlâ active olmalıydı (forfeit edilmedi)');
});

await test('transactions.withdraw: confirmForfeit:true → bonus feda edilir, balance düşer, sonra çekim yapılır', async () => {
  await resetDb();
  const user = await User.create({ username: 'test_wlg_u3', email: 'wlg3@test.com', password: 'x', balance: 150 });
  await BonusWagering.create({
    userId: user._id, source: 'promotion', description: 'Test',
    bonusAmount: 100, wageringRequired: 3500, wageringProgress: 1750,
    multiplier: 35, status: 'active',
  });
  // locked = 100 (tüm bonusAmount, ilerlemeden bağımsız — "hep-ya-hiç" kilit modeli)
  // withdrawable (forfeit öncesi) = 150-100 = 50
  // wageringProgress:1750 (%50) → forfeitRatio=0.5 → forfeitAmount=50
  // forfeit sonrası balance = 150-50=100
  // amount=80 > withdrawable(50) → forfeit tetiklenir; forfeit sonrası balance(100) >= 80 → çekim başarılı
  // newBalance = 100-80 = 20
  // NOT: wageringProgress:0 (tam forfeit, ratio=1.0) kullanılırsa forfeit sonrası balance HER ZAMAN
  // forfeit-öncesi withdrawable'a eşit olur (150-100=50) — yani %100 forfeit hiçbir ek çekilebilir
  // para KAZANDIRMAZ (kilitli parayı feda etmek yalnızca bonus-öncesi bakiyeye döndürür). Bu yüzden
  // forfeit'in gerçekten fayda sağladığı bir senaryo için KISMİ ilerleme (ratio<1.0) şart.

  const { req, res, next, getResult } = fakeReqRes(user._id.toString(), { amount: 80, iban: VALID_IBAN, fullName: 'Test User', confirmForfeit: true });
  await txCtrl.withdraw(req, res, next);

  const result = getResult();
  assert(result.newBalance === 20, `newBalance 20 olmalıydı (150-50 forfeit-80 çekim), ${result?.newBalance} bulundu`);

  const wagering = await BonusWagering.findOne({ userId: user._id });
  assert(wagering.status === 'forfeited', 'wagering forfeited olmalıydı');

  const forfeitTx = await Transaction.findOne({ userId: user._id, type: 'bonus_forfeit' });
  assert(forfeitTx !== null, 'bonus_forfeit Transaction oluşturulmalıydı');
  assert(Math.abs(forfeitTx.amount - (-50)) < 0.01, `forfeitTx.amount -50 olmalıydı, ${forfeitTx.amount} bulundu`);

  const withdrawTx = await Transaction.findOne({ userId: user._id, type: 'withdraw' });
  assert(withdrawTx !== null, 'withdraw Transaction oluşturulmalıydı');
  assert(withdrawTx.amount === -80, 'withdraw Transaction amount -80 olmalıydı');
});

await test('bank.createWithdraw: withdrawable aşan tutar + aktif bonus + confirmForfeit yok → 409 ACTIVE_BONUS_LOCK, talep oluşmaz', async () => {
  await resetDb();
  const user = await User.create({ username: 'test_wlg_u4', email: 'wlg4@test.com', password: 'x', balance: 150 });
  await BonusWagering.create({
    userId: user._id, source: 'promotion', description: 'Test',
    bonusAmount: 100, wageringRequired: 3500, wageringProgress: 0,
    multiplier: 35, status: 'active',
  });

  const { req, res, next } = fakeReqRes(user._id.toString(), { amount: 80, iban: VALID_IBAN, fullName: 'Test User', confirmForfeit: false });
  let error;
  await bankCtrl.createWithdraw(req, res, (e) => { error = e; });

  assert(error !== undefined, 'Hata dönmeliydi');
  assert(error.code === 'ACTIVE_BONUS_LOCK', `Error code ACTIVE_BONUS_LOCK olmalıydı, ${error.code} bulundu`);

  const count = await BankDepositRequest.countDocuments({ userId: user._id });
  assert(count === 0, 'Talep oluşturulmamalıydı');
});

await test('bank.createWithdraw: confirmForfeit:true → bonus feda edilir, talep withdrawable içinde kabul edilir', async () => {
  await resetDb();
  const user = await User.create({ username: 'test_wlg_u5', email: 'wlg5@test.com', password: 'x', balance: 150 });
  await BonusWagering.create({
    userId: user._id, source: 'promotion', description: 'Test',
    bonusAmount: 100, wageringRequired: 3500, wageringProgress: 1750,
    multiplier: 35, status: 'active',
  });
  // withdrawable (forfeit öncesi) = 50; wageringProgress %50 → forfeitAmount=50 → forfeit sonrası balance=100
  // amount=80 > withdrawable(50) → forfeit tetiklenir; bank.createWithdraw balance'ı debit ETMEZ
  // (sadece talep oluşturur), bu yüzden final balance forfeit sonrası değerde kalır: 100

  const { req, res, next, getStatus } = fakeReqRes(user._id.toString(), { amount: 80, iban: VALID_IBAN, fullName: 'Test User', confirmForfeit: true });
  await bankCtrl.createWithdraw(req, res, next);

  assert(getStatus() === 201, 'HTTP 201 dönmeliydi');

  const wagering = await BonusWagering.findOne({ userId: user._id });
  assert(wagering.status === 'forfeited', 'wagering forfeited olmalıydı');

  const updated = await User.findById(user._id);
  assert(updated.balance === 100, `balance 100 olmalıydı (150-50 forfeit, talep balance'ı debit etmez), ${updated.balance} bulundu`);

  const count = await BankDepositRequest.countDocuments({ userId: user._id, type: 'withdraw' });
  assert(count === 1, 'Talep oluşturulmalıydı');
});

await resetDb();
await mongoose.disconnect();

console.log(`\n${passed} geçti, ${failed} kaldı`);
if (failed > 0) process.exit(1);
