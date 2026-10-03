// server/src/services/demoData/userSeed.js
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../../models/User.js';
import Transaction from '../../models/Transaction.js';
import { randomInt, randomFloat, pick, randomPastDate } from './randomUtils.js';

const SEED_DOMAIN = 'seed.local';
const SEED_PASSWORD = 'SeedUser1234!';
let cachedHash = null;

async function getSeedPasswordHash() {
  if (!cachedHash) cachedHash = await bcrypt.hash(SEED_PASSWORD, 12);
  return cachedHash;
}

// Kullanıcı adı/e-posta artık seed_player_000001 yerine gerçekçi görünen
// isimlerden/takma adlardan üretiliyor (admin panelinde insancıl görünmesi
// için) — e-posta alanı yine de .local (RFC 2606 anlamında çözümlenemez)
// kalıyor, hiçbir gerçek e-postaya asla ulaşılamaz. Bahis sitelerinde
// kullanıcı adları genelde gerçek isim DEĞİL, takma ad şeklindedir — bu
// yüzden yarı yarıya "ad.soyad" ve yarı yarıya "sıfat+isim" (nickname)
// tarzı üretiliyor. İsim havuzu uluslararası (Türkçe'ye özel değil).
const FIRST_NAMES = [
  'James', 'Maria', 'Ahmed', 'Wei', 'Sofia', 'Liam', 'Yuki', 'Carlos', 'Anna', 'Hassan',
  'Olivia', 'Noah', 'Emma', 'Mateus', 'Priya', 'Lucas', 'Fatima', 'Ivan', 'Chloe', 'Kenji',
  'Aisha', 'Diego', 'Elena', 'Omar', 'Nina', 'Marco', 'Layla', 'Erik', 'Sara', 'Felix',
  'Zara', 'Leo', 'Mei', 'Victor', 'Amara', 'David', 'Ines', 'Kai', 'Nadia', 'Tom',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Garcia', 'Kim', 'Müller', 'Rossi', 'Silva', 'Chen', 'Novak', 'Andersen',
  'Petrov', 'Yamamoto', 'Costa', 'Dubois', 'Nguyen', 'Kowalski', 'Hansen', 'Fischer', 'Santos', 'Okafor',
  'Larsen', 'Moreau', 'Schmidt', 'Rodriguez', 'Park', 'Bianchi', 'Weber', 'Ivanov', 'Lopez', 'Hoffmann',
];
const NICK_ADJECTIVES = [
  'shadow', 'lucky', 'crazy', 'silent', 'golden', 'wild', 'royal', 'iron', 'dark', 'swift',
  'neon', 'mystic', 'savage', 'frozen', 'blazing', 'rogue', 'crimson', 'lone', 'turbo', 'epic',
];
const NICK_NOUNS = [
  'wolf', 'tiger', 'ace', 'phoenix', 'ninja', 'dragon', 'hawk', 'ranger', 'striker', 'raven',
  'panther', 'viper', 'falcon', 'shark', 'king', 'rider', 'hunter', 'wizard', 'ghost', 'storm',
];

function toAsciiSlug(str) {
  return str
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // aksanları ayır ve at (é→e, ü→u, ş→s vb.)
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function randomHumanIdentity() {
  const suffix = randomInt(1000, 9999);
  let displayName, slug;
  if (Math.random() < 0.5) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    displayName = `${first} ${last}`;
    slug = `${toAsciiSlug(first)}.${toAsciiSlug(last)}${suffix}`;
  } else {
    const adj = pick(NICK_ADJECTIVES);
    const noun = pick(NICK_NOUNS);
    displayName = `${adj}${noun}${suffix}`;
    slug = `${adj}_${noun}${suffix}`;
  }
  return { displayName, username: slug, email: `${slug}@${SEED_DOMAIN}` };
}

/** Aynı parti içinde username çakışmasın diye tekrar denenir (DB'deki eski seed'lere karşı çakışma ihtimali ihmal edilebilir düzeyde küçük — geniş kombinasyon uzayı). */
function uniqueHumanIdentity(usedSlugs) {
  let identity = randomHumanIdentity();
  let attempts = 0;
  while (usedSlugs.has(identity.username) && attempts < 20) {
    identity = randomHumanIdentity();
    attempts += 1;
  }
  usedSlugs.add(identity.username);
  return identity;
}

export async function getSeedUserPool(limit = 1000) {
  return User.find({ isSeed: true }).limit(limit).select('_id balance').lean();
}

export async function status() {
  return { count: await User.countDocuments({ isSeed: true }) };
}

export async function load(count) {
  const passwordHash = await getSeedPasswordHash();
  const usedSlugs = new Set();

  const userDocs = [];
  for (let i = 0; i < count; i++) {
    const { username, email } = uniqueHumanIdentity(usedSlugs);
    const createdAt = randomPastDate(90);
    userDocs.push({
      username,
      email,
      password: passwordHash,
      role: 'user',
      isSeed: true,
      balance: 0,
      createdAt,
      updatedAt: createdAt,
    });
  }
  const inserted = await User.insertMany(userDocs);

  const txDocs = [];
  const balanceUpdates = [];
  for (const user of inserted) {
    const txCount = randomInt(3, 15);
    const events = [];
    for (let i = 0; i < txCount; i++) {
      const type = pick(['deposit', 'deposit', 'deposit', 'withdraw']);
      const createdAt = new Date(Math.max(user.createdAt.getTime(), randomPastDate(90).getTime()));
      events.push({ type, createdAt });
    }
    events.sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 1; i < events.length; i++) {
      if (events[i].createdAt.getTime() <= events[i - 1].createdAt.getTime()) {
        events[i].createdAt = new Date(events[i - 1].createdAt.getTime() + 1);
      }
    }

    let running = 0;
    for (const ev of events) {
      const balanceBefore = running;
      let amount;
      if (ev.type === 'withdraw' && balanceBefore <= 0) ev.type = 'deposit';
      if (ev.type === 'deposit') {
        amount = randomFloat(100, 5000);
      } else {
        amount = -Math.min(randomFloat(50, balanceBefore), balanceBefore);
      }
      running = parseFloat((running + amount).toFixed(2));
      txDocs.push({
        userId: user._id, type: ev.type, amount, balanceBefore, balanceAfter: running,
        status: 'completed', currency: 'TRY', source: 'system', note: 'Seed backfill',
        isSeed: true, createdAt: ev.createdAt, updatedAt: ev.createdAt,
      });
    }
    balanceUpdates.push({ updateOne: { filter: { _id: user._id }, update: { balance: running } } });
  }
  if (txDocs.length) await Transaction.insertMany(txDocs);
  if (balanceUpdates.length) await User.bulkWrite(balanceUpdates);

  return { created: inserted.length };
}

export async function clear() {
  const userIds = await User.find({ isSeed: true }).distinct('_id');
  const txResult = await Transaction.deleteMany({ userId: { $in: userIds } });
  const userResult = await User.deleteMany({ isSeed: true });
  return { deleted: userResult.deletedCount, transactionsDeleted: txResult.deletedCount };
}

export async function liveTick() {
  const pool = await getSeedUserPool(500);
  if (!pool.length) return null;
  const user = pick(pool);
  const balanceBefore = user.balance || 0;
  const type = pick(['deposit', 'deposit', 'withdraw']);
  if (type === 'withdraw' && balanceBefore <= 0) return null;
  const amount = type === 'deposit' ? randomFloat(100, 3000) : -Math.min(randomFloat(50, balanceBefore), balanceBefore);
  const balanceAfter = parseFloat((balanceBefore + amount).toFixed(2));

  await User.updateOne({ _id: user._id }, { balance: balanceAfter });
  const { createTransaction } = await import('../ledger.js');
  const { transaction } = await createTransaction({
    userId: user._id, type, amount, balanceBefore, balanceAfter,
    status: 'completed', source: 'system', note: 'Seed canlı simülasyon',
    idempotencyKey: `demo_live_${user._id}_${crypto.randomUUID()}`,
  });
  await Transaction.updateOne({ _id: transaction._id }, { isSeed: true });

  return { userId: user._id, type, amount };
}
