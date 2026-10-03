#!/usr/bin/env node
// Tüm testleri sırayla çalıştırır ve özet rapor verir
//
// Çalıştır: cd server && node scripts/run-all-tests.cjs
//
// Not: Bu, VIP90.bet çekirdek platformunun açık kaynak dağıtımıdır. In-house
// oyunlar, bahis/canlı bahis oran motoru ve Igames casino entegrasyonu ayrı,
// lisanslı bir pakette yaşar — bu yüzden o alanlara özel testler burada yok.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const path = require('path');
const { spawnSync } = require('child_process');

// ─── Unit Tests (logic-only) ────────────────────────────────────────────────
const UNIT_SUITES = [
  'test-bonus-wagering.cjs',
  'test-promotion-claim.cjs',
  'test-admin-bonus-send.mjs',
  'test-withdrawal-lock-gate.mjs',         // Kilitli Bakiye çekim kapısı (#17)
  'test-auth-locked-balance.mjs',          // auth yanıtlarında locked/withdrawable (#17)
  'test-email-verification-gate.mjs',      // login+register email doğrulama gate + resend endpoint
  'test-migrate-bonus-to-balance.mjs',     // migration script idempotency (#17)
  'test-user-casino-summary.mjs',
  'test-referral-commission-service.mjs',  // payReferralCommission() logic
  'test-casino-referral.mjs',              // inhouse hook referral payout
  'test-events-list.mjs',                  // GET /events gelecek penceresi + cache (#12)
];

// ─── Casino Integration Tests (real DB) ────────────────────────────────────
const CASINO_SUITES = [
  'test-casino-callbacks.mjs',     // callback handler logic
  'test-popular-games.mjs',        // getPopularGames() aggregate
];

const MOCK_SUITES = [
  // Kept minimal: only for fast smoke tests
];

const results = [];

console.log('═'.repeat(60));
console.log('🧪 VIP90.bet Test Suite Runner');
console.log('═'.repeat(60));

function runTest(testFile, label) {
  console.log(`\n📋 ${label}: ${testFile}`);
  console.log('─'.repeat(60));

  const start = Date.now();
  const result = spawnSync('node', [path.join(__dirname, testFile)], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' },
  });
  const duration = ((Date.now() - start) / 1000).toFixed(1);

  const ok = result.status === 0;
  let type = 'unit';
  if (CASINO_SUITES.includes(testFile)) type = 'casino-integration';
  if (MOCK_SUITES.includes(testFile)) type = 'mock';

  results.push({ name: testFile, label, status: result.status, duration, type });
  return ok;
}

let allOk = true;

// 1. Unit suites (always)
console.log('\n━━━ Unit Suites (logic-only) ━━━');
for (const test of UNIT_SUITES) {
  const ok = runTest(test, 'Unit');
  if (!ok) allOk = false;
}

// 2. Casino integration suites (real DB)
console.log('\n━━━ Casino Integration Suites ━━━');
for (const test of CASINO_SUITES) {
  const ok = runTest(test, 'Casino Integration');
  if (!ok) allOk = false;
}

// 3. Mock suites (minimal)
if (MOCK_SUITES.length > 0) {
  console.log('\n━━━ Mock Suites ━━━');
  for (const test of MOCK_SUITES) {
    const ok = runTest(test, 'Mock');
    if (!ok) allOk = false;
  }
}

// Summary
console.log('\n' + '═'.repeat(60));
console.log('📊 GENEL ÖZET');
console.log('═'.repeat(60));

const byType = {};
for (const r of results) {
  if (!byType[r.type]) byType[r.type] = [];
  byType[r.type].push(r);
}

const typeLabels = {
  'unit': 'Unit Tests (logic)',
  'mock': 'Mock Tests',
  'casino-integration': 'Casino Integration (real DB)',
};

for (const [type, suites] of Object.entries(byType)) {
  console.log(`\n${typeLabels[type] || type}:`);
  const okCount = suites.filter(s => s.status === 0).length;
  for (const s of suites) {
    const status = s.status === 0 ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}  ${s.name.padEnd(45)} (${s.duration}s)`);
  }
  console.log(`  → ${okCount}/${suites.length} başarılı`);
}

const totalOk = results.filter(r => r.status === 0).length;
const total = results.length;

console.log('\n' + '─'.repeat(60));
console.log(`Toplam: ${totalOk}/${total} test suite başarılı`);

if (allOk) {
  console.log('\n✅ Tüm aktif test suite\'leri başarılı');
  process.exit(0);
} else {
  console.log('\n❌ Bazı test suite\'leri başarısız');
  process.exit(1);
}
