// server/src/services/demoData/kycSeed.js
import KycDocument from '../../models/KycDocument.js';
import { getSeedUserPool, load as loadUsers } from './userSeed.js';
import { pick, pickWeighted, randomPastDate } from './randomUtils.js';

const DOC_TYPES = ['identity_card', 'passport', 'drivers_license', 'utility_bill', 'selfie_with_id'];

async function ensureUserPool() {
  let pool = await getSeedUserPool(500);
  if (!pool.length) {
    await loadUsers(20);
    pool = await getSeedUserPool(500);
  }
  return pool;
}

export async function status() {
  return { count: await KycDocument.countDocuments({ isSeed: true }) };
}

export async function load(count) {
  const pool = await ensureUserPool();
  const docs = [];
  for (let i = 0; i < count; i++) {
    const status = pickWeighted([['pending', 60], ['approved', 30], ['rejected', 10]]);
    const createdAt = randomPastDate(90);
    docs.push({
      userId: pick(pool)._id, documentType: pick(DOC_TYPES),
      fileName: `seed_doc_${i + 1}.jpg`, fileSize: 204800, mimeType: 'image/jpeg',
      fileUrl: `/seed/kyc/seed_doc_${i + 1}.jpg`,
      status, isSeed: true, createdAt,
      reviewedAt: status !== 'pending' ? createdAt : null,
      rejectionReason: status === 'rejected' ? 'Seed: belge okunaklı değil' : '',
    });
  }
  if (docs.length) await KycDocument.insertMany(docs);
  return { created: docs.length };
}

export async function clear() {
  const result = await KycDocument.deleteMany({ isSeed: true });
  return { deleted: result.deletedCount };
}

export async function liveTick() {
  const pool = await getSeedUserPool(500);
  if (!pool.length) return null;
  const user = pick(pool);
  await KycDocument.create({
    userId: user._id, documentType: pick(DOC_TYPES),
    fileName: 'seed_live_doc.jpg', fileSize: 204800, mimeType: 'image/jpeg',
    fileUrl: '/seed/kyc/seed_live_doc.jpg', status: 'pending', isSeed: true,
  });
  const { logActivity } = await import('../activityFeed.js');
  await logActivity({
    type: 'kyc_submitted', userId: user._id, status: 'pending',
    summary: 'KYC belgesi yüklendi (1 belge)', data: { docCount: 1 },
  });
  return { userId: user._id };
}
