import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const TEST_DB_URI = 'mongodb://localhost:27017/betzone_test_auth_locked_balance';

console.log('🔥 Auth Locked Balance Enrichment Testleri\n');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

await mongoose.connect(TEST_DB_URI);
const User = (await import('../src/models/User.js')).default;
const BonusWagering = (await import('../src/models/BonusWagering.js')).default;
const authCtrl = await import('../src/controllers/auth.js');

async function resetDb() {
  await User.deleteMany({ username: /^test_alb_/ });
  await BonusWagering.deleteMany({});
}

function fakeRes() {
  let jsonResult = null;
  const res = {
    cookie: () => {},
    json: (obj) => { jsonResult = obj; },
  };
  return { res, getResult: () => jsonResult };
}

await resetDb();

await test('login: yanıt user.locked ve user.withdrawable içerir', async () => {
  const user = await User.create({ username: 'test_alb_u1', email: 'alb1@test.com', password: 'password123', balance: 150, emailVerified: true });
  await BonusWagering.create({
    userId: user._id, source: 'promotion', description: 'Test',
    bonusAmount: 100, wageringRequired: 3500, wageringProgress: 0,
    multiplier: 35, status: 'active',
  });

  const req = {
    validated: { username: 'test_alb_u1', password: 'password123' },
    ip: '127.0.0.1',
    headers: {},
  };
  const { res, getResult } = fakeRes();
  await authCtrl.login(req, res, (e) => { throw e; });

  const result = getResult();
  assert(result.user.locked === 100, `locked 100 olmalıydı, ${result.user.locked} bulundu`);
  assert(result.user.withdrawable === 50, `withdrawable 50 olmalıydı, ${result.user.withdrawable} bulundu`);
});

await test('login: aktif bonus yoksa locked=0, withdrawable=balance', async () => {
  await resetDb();
  const user = await User.create({ username: 'test_alb_u2', email: 'alb2@test.com', password: 'password123', balance: 75, emailVerified: true });

  const req = {
    validated: { username: 'test_alb_u2', password: 'password123' },
    ip: '127.0.0.1',
    headers: {},
  };
  const { res, getResult } = fakeRes();
  await authCtrl.login(req, res, (e) => { throw e; });

  const result = getResult();
  assert(result.user.locked === 0, `locked 0 olmalıydı, ${result.user.locked} bulundu`);
  assert(result.user.withdrawable === 75, `withdrawable 75 olmalıydı, ${result.user.withdrawable} bulundu`);
});

await resetDb();
await mongoose.disconnect();

console.log(`\n${passed} geçti, ${failed} kaldı`);
if (failed > 0) process.exit(1);
