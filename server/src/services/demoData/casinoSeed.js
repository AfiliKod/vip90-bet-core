// server/src/services/demoData/casinoSeed.js
import CasinoRound from '../../models/CasinoRound.js';
import { getSeedUserPool, load as loadUsers } from './userSeed.js';
import { randomFloat, pick, randomPastDate } from './randomUtils.js';

const SEED_GAMES = [
  { gameId: 'dice', gameTitle: 'Dice' },
  { gameId: 'mines', gameTitle: 'Mines' },
  { gameId: 'plinko', gameTitle: 'Plinko' },
  { gameId: 'limbo', gameTitle: 'Limbo' },
  { gameId: 'crash', gameTitle: 'Crash' },
];

async function ensureUserPool() {
  let pool = await getSeedUserPool(500);
  if (!pool.length) {
    await loadUsers(20);
    pool = await getSeedUserPool(500);
  }
  return pool;
}

function randomRound(userId, isSeed, createdAt) {
  const game = pick(SEED_GAMES);
  const bet = randomFloat(5, 200);
  // Hedef RTP ~%96 (gerçekçi inhouse house-edge): p · (1+m)/2 ≈ 0.96
  // Eski oran (p=0.45, m=5) RTP=%135 üretiyordu → analytics GGR = −net
  // formülüyle seed'i kar-ZARAR hesabında oyuncu lehine çevirip
  // Dashboard combined total'i negatife çekiyordu (₺-43.4B = −43.4k).
  const win = Math.random() < 0.40;
  const payout = win ? randomFloat(bet, bet * 3.8) : 0;
  return {
    userId, gameId: game.gameId, gameTitle: game.gameTitle, provider: 'inhouse',
    bet, payout, net: parseFloat((payout - bet).toFixed(2)),
    balanceBefore: 1000, balanceAfter: parseFloat((1000 - bet + payout).toFixed(2)),
    isSeed, createdAt,
  };
}

export async function status() {
  return { count: await CasinoRound.countDocuments({ isSeed: true }) };
}

export async function load(count) {
  const pool = await ensureUserPool();
  const docs = [];
  for (let i = 0; i < count; i++) {
    docs.push(randomRound(pick(pool)._id, true, randomPastDate(90)));
  }
  if (docs.length) await CasinoRound.insertMany(docs);
  return { created: docs.length };
}

export async function clear() {
  const result = await CasinoRound.deleteMany({ isSeed: true });
  return { deleted: result.deletedCount };
}

export async function liveTick() {
  const pool = await getSeedUserPool(500);
  if (!pool.length) return null;
  const doc = randomRound(pick(pool)._id, true, undefined);
  delete doc.createdAt;
  const round = new CasinoRound(doc);
  await round.save();
  return { roundId: round._id };
}
