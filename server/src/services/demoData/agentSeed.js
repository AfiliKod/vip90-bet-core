// server/src/services/demoData/agentSeed.js
import Agent from '../../models/Agent.js';
import ReferralCommission from '../../models/ReferralCommission.js';
import { getSeedUserPool, load as loadUsers } from './userSeed.js';
import { pick, randomInt, randomFloat, randomPastDate } from './randomUtils.js';

async function ensureUserPool(minSize) {
  let pool = await getSeedUserPool(1000);
  if (pool.length < minSize) {
    await loadUsers(minSize - pool.length + 10);
    pool = await getSeedUserPool(1000);
  }
  return pool;
}

export async function status() {
  return { count: await Agent.countDocuments({ isSeed: true }) };
}

export async function load(count) {
  const pool = await ensureUserPool(count * 6);
  const existingAgentUserIds = new Set((await Agent.find({ isSeed: true }).distinct('userId')).map(String));
  const availableForAgent = pool.filter(u => !existingAgentUserIds.has(String(u._id)));

  const agentDocs = [];
  const commissionDocs = [];
  const usedThisBatch = new Set();

  for (let i = 0; i < count && i < availableForAgent.length; i++) {
    const agentUser = availableForAgent[i];
    usedThisBatch.add(String(agentUser._id));
    const playerCandidates = pool.filter(u => String(u._id) !== String(agentUser._id));
    const playerCount = Math.min(randomInt(5, 15), playerCandidates.length);
    const players = [];
    for (let p = 0; p < playerCount; p++) players.push(pick(playerCandidates)._id);

    const createdAt = randomPastDate(90);
    agentDocs.push({
      userId: agentUser._id, players, commissionRate: randomInt(5, 20),
      balance: randomFloat(0, 5000), isActive: true, isSeed: true, createdAt,
    });
    for (const bettorId of players) {
      commissionDocs.push({
        referrerId: agentUser._id, bettorId, level: 1,
        houseProfit: randomFloat(10, 500), commissionAmount: randomFloat(1, 50),
        commissionRate: 10, status: pick(['pending', 'approved']),
        source: pick(['sports', 'casino']), isSeed: true, createdAt: randomPastDate(90),
      });
    }
  }

  if (agentDocs.length) await Agent.insertMany(agentDocs);
  if (commissionDocs.length) await ReferralCommission.insertMany(commissionDocs);
  return { created: agentDocs.length };
}

export async function clear() {
  const commissionResult = await ReferralCommission.deleteMany({ isSeed: true });
  const agentResult = await Agent.deleteMany({ isSeed: true });
  return { deleted: agentResult.deletedCount, commissionsDeleted: commissionResult.deletedCount };
}

export async function liveTick() {
  // Kapsam dışı — spec § Kategori Detayları 7 (Agent/Referral canlı tick üretmiyor).
  return null;
}
