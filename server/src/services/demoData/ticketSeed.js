// server/src/services/demoData/ticketSeed.js
import Ticket from '../../models/Ticket.js';
import { getSeedUserPool, load as loadUsers } from './userSeed.js';
import { pick, pickWeighted, randomPastDate } from './randomUtils.js';

const SUBJECTS = ['Para yatırma sorunu', 'Bonus talebi', 'Hesap doğrulama', 'Çekim gecikmesi', 'Oyun teknik sorunu'];

async function ensureUserPool() {
  let pool = await getSeedUserPool(500);
  if (!pool.length) {
    await loadUsers(20);
    pool = await getSeedUserPool(500);
  }
  return pool;
}

export async function status() {
  return { count: await Ticket.countDocuments({ isSeed: true }) };
}

export async function load(count) {
  const pool = await ensureUserPool();
  const docs = [];
  for (let i = 0; i < count; i++) {
    const userId = pick(pool)._id;
    const createdAt = randomPastDate(90);
    const status = pickWeighted([['open', 30], ['in_progress', 20], ['resolved', 30], ['closed', 20]]);
    const messages = [{ senderId: userId, senderRole: 'player', text: '(seed) Yardım talebi mesajı' }];
    if (status !== 'open') messages.push({ senderId: userId, senderRole: 'admin', text: '(seed) Destek yanıtı' });
    docs.push({ userId, subject: pick(SUBJECTS), status, messages, isSeed: true, createdAt });
  }
  if (docs.length) await Ticket.insertMany(docs);
  return { created: docs.length };
}

export async function clear() {
  const result = await Ticket.deleteMany({ isSeed: true });
  return { deleted: result.deletedCount };
}

export async function liveTick() {
  const pool = await getSeedUserPool(500);
  if (!pool.length) return null;
  const userId = pick(pool)._id;
  await Ticket.create({
    userId, subject: pick(SUBJECTS), status: 'open',
    messages: [{ senderId: userId, senderRole: 'player', text: '(seed) Yardım talebi mesajı' }],
    isSeed: true,
  });
  return { userId };
}
