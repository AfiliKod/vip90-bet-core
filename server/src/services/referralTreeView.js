import User from '../models/User.js';

/**
 * O2 — Affiliate: yalnızca admin GÖRÜNÜRLÜĞÜ.
 *
 * Bilinçli tasarım kararı: mevcut CANLI tek-kademeli ödeme mekanizmasına
 * (services/referralCommission.js — sabit %10, User.referredBy zincirinden
 * anlık bakiyeye ekleniyor, 3 çağrı noktası) dokunulmuyor. Ayrı, hiç
 * bağlanmamış çok-kademeli sistem de (services/referral.js, models/
 * ReferralTree.js) KULLANILMIYOR — o dosya `buildReferralTree` çağrılmadığı
 * için boş bir koleksiyona dayanıyor ve bilinen bir version-conflict bug'ı
 * içeriyor.
 *
 * Bunun yerine: User.referredBy zincirini CANLI, salt-okunur olarak 3
 * seviye derinliğinde dolaşan bu küçük fonksiyon — gerçek ödeme sisteminin
 * zaten kullandığı aynı alana dayanıyor, hiçbir yeni yazma yapmıyor.
 */
export async function getReferralTreeView(userId) {
  async function children(parentId) {
    return User.find({ referredBy: parentId, deletedAt: null })
      .select('username createdAt isActive totalReferralEarnings')
      .lean();
  }

  const level1 = await children(userId);
  const level2 = await Promise.all(level1.map(async u => ({
    ...u,
    children: await children(u._id),
  })));
  const level3Wrapped = await Promise.all(level2.map(async u => ({
    ...u,
    children: await Promise.all(u.children.map(async c => ({
      ...c,
      children: await children(c._id),
    }))),
  })));

  return level3Wrapped;
}
