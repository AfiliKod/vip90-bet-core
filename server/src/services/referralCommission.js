import User from '../models/User.js';
import { getIO } from './socketEmitter.js';
import { getReferralSettings } from './referralSettings.js';
import { createTransaction } from './ledger.js';
import Transaction from '../models/Transaction.js';

export async function payReferralCommission(userId, houseProfit, options = {}) {
  const { session = null, sourceId = null } = options;

  const settings = await getReferralSettings();
  if (!settings.enabled) return null;
  if (!houseProfit || houseProfit <= 0) return null;

  const bettor = await User.findById(userId).select('referredBy').session(session);
  if (!bettor?.referredBy) return null;

  const commission = parseFloat((houseProfit * settings.commissionRate / 100).toFixed(2));
  if (commission <= 0) return null;

  // Tekrar koruması: anahtar ödemeyi doğuran olaydan (sourceId) türetilir ve
  // bakiye DEĞİŞMEDEN önce kontrol edilir — createTransaction'ın kendi
  // idempotency kontrolü yalnız ledger satırını engeller, bakiye $inc'ini değil.
  // sourceId yoksa (eski çağrılar) her çağrı ayrı ödeme sayılır.
  const idempotencyKey = sourceId
    ? `referral_commission_${bettor.referredBy}_${sourceId}`
    : `referral_commission_${bettor.referredBy}_${Date.now()}`;
  if (sourceId && await Transaction.exists({ idempotencyKey }).session(session)) return null;

  const referrer = await User.findByIdAndUpdate(
    bettor.referredBy,
    { $inc: { balance: commission, totalReferralEarnings: commission } },
    { new: true, session }
  );
  if (!referrer) return null;

  const balanceBefore = parseFloat((referrer.balance - commission).toFixed(2));
  await createTransaction({
    userId: referrer._id,
    type: 'referral_commission',
    amount: commission,
    balanceBefore,
    balanceAfter: referrer.balance,
    note: 'Referans kâr payı komisyonu',
    idempotencyKey,
    source: 'system',
  }, { session });

  const io = getIO();
  if (io) io.to(`user:${referrer._id}`).emit('balance:update', { balance: referrer.balance });

  return commission;
}
