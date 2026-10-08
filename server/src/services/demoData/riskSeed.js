// server/src/services/demoData/riskSeed.js
// Rastgele Evaluation/Finding uydurmaz: gerçek risk motorunu (evaluateRisk)
// gerçek kural setine karşı çağırır — her senaryo tam olarak 1 kuralı eşleştirir
// ki load(N) → N evaluation + N finding invariantı korunsun.
import RiskEvaluation from '../../models/RiskEvaluation.js';
import RiskFinding from '../../models/RiskFinding.js';
import { evaluateRisk } from '../riskEngine.js';
import { initDefaultRules } from '../riskRule.js';
import { getSeedUserPool, load as loadUsers } from './userSeed.js';
import { pick } from './randomUtils.js';

// Her context, initDefaultRules varsayılan setinden TAM olarak 1 kuralı eşleştirir
// (eksik alanlar evaluateCondition'da false döner — bkz. riskRule.js).
const SCENARIOS = [
  { event: 'seed.deposit.velocity', context: { depositCount1h: 6 } },
  { event: 'seed.rapid.withdraw', context: { minutesSinceDeposit: 5 } },
  { event: 'seed.kyc.failures', context: { kycFailureCount: 4 } },
  { event: 'seed.failed.login', context: { failedLoginCount1h: 7 } },
  { event: 'seed.large.withdraw', context: { withdrawalAmount: 75000 } },
  { event: 'seed.multi.account', context: { accountsSameIp: 4 } },
  { event: 'seed.first.deposit', context: { firstDepositAmount: 25000 } },
  { event: 'seed.withdraw.before.kyc', context: { kycApproved: false, withdrawalAttempts: 3 } },
  { event: 'seed.full.withdraw', context: { minutesSinceDeposit: 30, withdrawalRatioPct: 100 } },
  { event: 'seed.shared.payment', context: { paymentMethodAccountCount: 3 } },
  { event: 'seed.kyc.rejections', context: { kycRejections24h: 3 } },
];

async function ensureRulesAndPool() {
  await initDefaultRules();
  let pool = await getSeedUserPool(500);
  if (!pool.length) {
    await loadUsers(20);
    pool = await getSeedUserPool(500);
  }
  return pool;
}

async function runScenario(playerId, scenario, { suppressActivity }) {
  return evaluateRisk(playerId, scenario.event, scenario.context, {
    isSeed: true,
    suppressActivity,
  });
}

export async function status() {
  return { count: await RiskEvaluation.countDocuments({ isSeed: true }) };
}

// riskEngine.evaluateRisk RiskProfile'ı read-then-write ile güncelliyor
// (riskEngine.js:67 findOne + 136 findOneAndUpdate) — atomik değil, aynı
// oyuncu eşzamanlı iki kez değerlendirilirse kayıp güncelleme (lost update)
// riski var. Bu yüzden batch içi oyuncular HER ZAMAN birbirinden farklı
// seçilir (havuzdan tekrarsız örnekleme); farklı batch'ler arasında aynı
// oyuncunun tekrar seçilmesi güvenli (önceki batch tamamlanmış olur).
const SEED_BATCH_SIZE = 10;

export async function load(count) {
  const pool = await ensureRulesAndPool();
  let created = 0;
  for (let batchStart = 0; batchStart < count; batchStart += SEED_BATCH_SIZE) {
    const batchCount = Math.min(SEED_BATCH_SIZE, count - batchStart, pool.length);
    const batchPlayers = [...pool].sort(() => Math.random() - 0.5).slice(0, batchCount);
    // Toplu seed activity feed'i spamlememeli (insertMany backfill davranışıyla aynı)
    await Promise.all(batchPlayers.map((player, i) => {
      const scenario = SCENARIOS[(batchStart + i) % SCENARIOS.length];
      return runScenario(player._id, scenario, { suppressActivity: true });
    }));
    created += batchPlayers.length;
  }
  return { created };
}

export async function clear() {
  const evalResult = await RiskEvaluation.deleteMany({ isSeed: true });
  const findingResult = await RiskFinding.deleteMany({ isSeed: true });
  return { deleted: evalResult.deletedCount, findingsDeleted: findingResult.deletedCount };
}

export async function liveTick() {
  // Canlı tick havuzu kendisi DOLDURMAZ (load() doldurur): operatör demo
  // verisini temizledikten sonra simülasyon 20 yeni seed kullanıcı açıyor ve
  // "havuz boş → iş durur" kuralı hiç tetiklenmiyordu (2026-10-08).
  await initDefaultRules();
  const pool = await getSeedUserPool(500);
  if (!pool.length) return null;
  const playerId = pick(pool)._id;
  const scenario = pick(SCENARIOS);
  // Canlı tick: eşleşen kural risk_flag ActivityEvent'i üretir (motorun doğal davranışı)
  await runScenario(playerId, scenario, { suppressActivity: false });
  return { userId: playerId };
}
