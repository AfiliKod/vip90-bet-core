import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';

const TEST_DB_URI = 'mongodb://localhost:27017/betzone_test_email_verification_gate';

console.log('🔥 Email Doğrulama Gate Testleri\n');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

await mongoose.connect(TEST_DB_URI);
const User = (await import('../src/models/User.js')).default;
const authCtrl = await import('../src/controllers/auth.js');

async function resetDb() {
  await User.deleteMany({ username: /^test_evg_/ });
}

function fakeRes() {
  let jsonResult = null;
  const res = {
    cookie: () => {},
    json: (obj) => { jsonResult = obj; },
    status: () => res, // register() res.status(201).json(...) zincirini kullanıyor
  };
  return { res, getResult: () => jsonResult };
}

await resetDb();

await test('login: cutoff sonrası kayıtlı + doğrulanmamış kullanıcı 403 EMAIL_NOT_VERIFIED alır', async () => {
  const user = await User.create({
    username: 'test_evg_new', email: 'evg_new@test.com', password: 'password123',
    emailVerified: false,
  });
  // Use raw collection update to bypass Mongoose timestamps immutability
  await User.collection.updateOne({ _id: user._id }, { $set: { createdAt: new Date('2026-07-14T12:00:00Z') } });
  const req = { validated: { username: 'test_evg_new', password: 'password123' }, ip: '127.0.0.1', headers: {} };
  const { res, getResult } = fakeRes();
  let caughtErr = null;
  await authCtrl.login(req, res, (e) => { caughtErr = e; });
  assert(caughtErr, 'next(err) çağrılmalıydı');
  assert(caughtErr.status === 403, `status 403 olmalıydı, ${caughtErr.status} bulundu`);
  assert(caughtErr.code === 'EMAIL_NOT_VERIFIED', `code EMAIL_NOT_VERIFIED olmalıydı, ${caughtErr.code} bulundu`);
  assert(caughtErr.details?.email === 'evg_new@test.com', 'details.email doğru olmalıydı');
  assert(getResult() === null, 'başarılı login yanıtı üretilmemeliydi');
});

await test('login: cutoff öncesi kayıtlı + doğrulanmamış kullanıcı (grandfathered) giriş yapabilir', async () => {
  const user = await User.create({
    username: 'test_evg_old', email: 'evg_old@test.com', password: 'password123',
    emailVerified: false,
  });
  // Use raw collection update to bypass Mongoose timestamps immutability
  await User.collection.updateOne({ _id: user._id }, { $set: { createdAt: new Date('2020-01-01') } });
  const req = { validated: { username: 'test_evg_old', password: 'password123' }, ip: '127.0.0.1', headers: {} };
  const { res, getResult } = fakeRes();
  await authCtrl.login(req, res, (e) => { throw e; });
  const result = getResult();
  assert(result?.accessToken, 'grandfathered kullanıcı için accessToken dönmeliydi');
});

await test('login: doğrulanmış kullanıcı createdAt\'ten bağımsız giriş yapabilir', async () => {
  await User.create({
    username: 'test_evg_verified', email: 'evg_verified@test.com', password: 'password123',
    emailVerified: true,
  });
  const req = { validated: { username: 'test_evg_verified', password: 'password123' }, ip: '127.0.0.1', headers: {} };
  const { res, getResult } = fakeRes();
  await authCtrl.login(req, res, (e) => { throw e; });
  assert(getResult()?.accessToken, 'doğrulanmış kullanıcı için accessToken dönmeliydi');
});

await test('register: yeni kayıt accessToken döndürmez, oturum açık başlamaz', async () => {
  const req = {
    validated: {
      username: 'test_evg_register', email: 'evg_register@test.com', password: 'Password123',
      acceptedTerms: true, acceptedKvkk: true, consentVersion: '1.0.0',
    },
    headers: {},
  };
  const { res, getResult } = fakeRes();
  await authCtrl.register(req, res, (e) => { throw e; });
  const result = getResult();
  assert(result.accessToken === undefined, 'register yanıtında accessToken OLMAMALI');
  assert(result.user?.emailVerified === false, 'yeni kullanıcı emailVerified:false olmalı');
  const created = await User.findOne({ username: 'test_evg_register' });
  assert(created, 'kullanıcı DB\'de oluşturulmuş olmalı');
  assert(created.emailVerificationToken, 'doğrulama token\'ı üretilmiş olmalı');
});

await test('resendVerification: var olan doğrulanmamış kullanıcı için yeni token üretir', async () => {
  const user = await User.create({
    username: 'test_evg_resend', email: 'evg_resend@test.com', password: 'password123',
    emailVerified: false, emailVerificationToken: 'old-token', emailVerificationExpires: new Date(Date.now() - 1000),
  });
  const req = { validated: { email: 'evg_resend@test.com' }, headers: {} };
  const { res, getResult } = fakeRes();
  await authCtrl.resendVerification(req, res, (e) => { throw e; });
  assert(getResult()?.message, 'generic mesaj dönmeliydi');
  const updated = await User.findById(user._id);
  assert(updated.emailVerificationToken !== 'old-token', 'yeni token üretilmeliydi');
  assert(updated.emailVerificationExpires > new Date(), 'yeni son kullanma tarihi ileride olmalıydı');
});

await test('resendVerification: var olmayan email için de aynı generic mesajı döner (enumeration önleme)', async () => {
  const req = { validated: { email: 'nonexistent_evg@test.com' }, headers: {} };
  const { res, getResult } = fakeRes();
  await authCtrl.resendVerification(req, res, (e) => { throw e; });
  assert(getResult()?.message, 'generic mesaj dönmeliydi (kullanıcı yokluğu sızdırılmamalı)');
});

await resetDb();
await mongoose.disconnect();

console.log(`\n${passed} geçti, ${failed} başarısız`);
process.exit(failed > 0 ? 1 : 0);
