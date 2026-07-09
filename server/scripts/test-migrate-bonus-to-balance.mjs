import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';

const TEST_DB_URI = 'mongodb://localhost:27017/betzone_test_migrate_bonus_to_balance';

console.log('🔥 Migration: bonusBalance → balance (Model B) Testleri\n');
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

await mongoose.connect(TEST_DB_URI);
const User = (await import('../src/models/User.js')).default;
const BonusWagering = (await import('../src/models/BonusWagering.js')).default;
const { migrateBonusToBalance } = await import('./migrate-bonus-to-balance.mjs');

async function resetDb() {
  await User.deleteMany({ username: /^test_mbb_/ });
  await BonusWagering.deleteMany({});
}

await resetDb();

await test('dry-run: hiçbir şey değiştirmez, ama etkilenecek kullanıcıyı raporlar', async () => {
  const user = await User.create({ username: 'test_mbb_u1', email: 'mbb1@test.com', password: 'x', balance: 20, bonusBalance: 100 });
  await BonusWagering.create({
    userId: user._id, source: 'promotion', description: 'Eski bonus',
    bonusAmount: 100, wageringRequired: 3500, wageringProgress: 0,
    multiplier: 35, status: 'active',
  });

  const result = await migrateBonusToBalance({ dryRun: true });
  assert(result.migratedCount === 1, `migratedCount 1 olmalıydı, ${result.migratedCount} bulundu`);
  assert(result.totalMoved === 100, `totalMoved 100 olmalıydı, ${result.totalMoved} bulundu`);

  const unchanged = await User.findById(user._id);
  assert(unchanged.balance === 20, 'dry-run balance değiştirmemeliydi');
});

await test('commit: balance += bonusBalance, bonusBalance mirror korunur', async () => {
  await resetDb();
  const user = await User.create({ username: 'test_mbb_u2', email: 'mbb2@test.com', password: 'x', balance: 20, bonusBalance: 100 });
  await BonusWagering.create({
    userId: user._id, source: 'promotion', description: 'Eski bonus',
    bonusAmount: 100, wageringRequired: 3500, wageringProgress: 0,
    multiplier: 35, status: 'active',
  });

  const result = await migrateBonusToBalance({ dryRun: false });
  assert(result.migratedCount === 1, `migratedCount 1 olmalıydı, ${result.migratedCount} bulundu`);

  const updated = await User.findById(user._id);
  assert(updated.balance === 120, `balance 120 olmalıydı (20+100), ${updated.balance} bulundu`);
  assert(updated.bonusBalance === 100, 'bonusBalance mirror korunmalıydı (locked = 100)');
});

await test('bonusBalance=0 olan kullanıcı atlanır', async () => {
  await resetDb();
  const user = await User.create({ username: 'test_mbb_u3', email: 'mbb3@test.com', password: 'x', balance: 50, bonusBalance: 0 });

  const result = await migrateBonusToBalance({ dryRun: false });
  assert(result.migratedCount === 0, `migratedCount 0 olmalıydı, ${result.migratedCount} bulundu`);

  const unchanged = await User.findById(user._id);
  assert(unchanged.balance === 50, 'balance değişmemeliydi');
});

await test('idempotent: iki kez commit çalıştırmak balance\'ı tekrar artırmaz', async () => {
  await resetDb();
  const user = await User.create({ username: 'test_mbb_u4', email: 'mbb4@test.com', password: 'x', balance: 20, bonusBalance: 100 });
  await BonusWagering.create({
    userId: user._id, source: 'promotion', description: 'Eski bonus',
    bonusAmount: 100, wageringRequired: 3500, wageringProgress: 0,
    multiplier: 35, status: 'active',
  });

  await migrateBonusToBalance({ dryRun: false });
  const secondRun = await migrateBonusToBalance({ dryRun: false });
  assert(secondRun.migratedCount === 0, `ikinci çalıştırmada migratedCount 0 olmalıydı (zaten migrate edilmiş), ${secondRun.migratedCount} bulundu`);

  const updated = await User.findById(user._id);
  assert(updated.balance === 120, `balance hâlâ 120 olmalıydı (tekrar eklenmedi), ${updated.balance} bulundu`);
});

await test('cross-process idempotency: commit sonrası bonusModelBMigratedAt set edilir ve kullanıcı aday sorgusundan bir daha ASLA eşleşmez (yeni process/boş _processedUserIds simülasyonu)', async () => {
  await resetDb();
  const user = await User.create({ username: 'test_mbb_u5', email: 'mbb5@test.com', password: 'x', balance: 20, bonusBalance: 100 });
  await BonusWagering.create({
    userId: user._id, source: 'promotion', description: 'Eski bonus',
    bonusAmount: 100, wageringRequired: 3500, wageringProgress: 0,
    multiplier: 35, status: 'active',
  });

  await migrateBonusToBalance({ dryRun: false });

  const updated = await User.findById(user._id);
  assert(updated.bonusModelBMigratedAt !== null, 'bonusModelBMigratedAt set edilmeliydi');
  assert(updated.balance === 120, `balance 120 olmalıydı (20+100), ${updated.balance} bulundu`);

  // Script'in kullandığı aday sorgusuyla aynı filtre — _processedUserIds'e
  // (in-memory, process'e özel) hiç bakmadan, tamamen DB marker'ına dayanır.
  // Bu, ikinci bir OS process'in (boş Set ile) bu kullanıcıyı bir daha asla
  // seçmeyeceğinin kanıtıdır — çift-kredi artık mümkün değil.
  const stillCandidate = await User.findOne({ _id: user._id, bonusBalance: { $gt: 0 }, bonusModelBMigratedAt: null });
  assert(stillCandidate === null, 'migrate edilmiş kullanıcı aday sorgusuyla bir daha ASLA eşleşmemeli');

  // Aynı doğrulamayı toplu adayları çeken sorgu üzerinden de teyit et.
  const candidatesAfter = await User.find({ bonusBalance: { $gt: 0 }, bonusModelBMigratedAt: null, username: /^test_mbb_u5$/ });
  assert(candidatesAfter.length === 0, `aday listesi boş olmalıydı, ${candidatesAfter.length} bulundu`);
});

await resetDb();
await mongoose.disconnect();

console.log(`\n${passed} geçti, ${failed} kaldı`);
if (failed > 0) process.exit(1);
