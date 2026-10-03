import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { getIO } from './socketEmitter.js';
import { REFERRAL_SETTINGS } from '../config/referral.js';
import { createTransaction } from './ledger.js';

export async function payReferralCommission(userId, houseProfit, options = {}) {
  const { session = null } = options;

  if (!REFERRAL_SETTINGS.enabled) return null;
  if (!houseProfit || houseProfit <= 0) return null;

  const bettor = await User.findById(userId).select('referredBy').session(session);
  if (!bettor?.referredBy) return null;

  const commission = parseFloat((houseProfit * REFERRAL_SETTINGS.commissionRate / 100).toFixed(2));
  if (commission <= 0) return null;

  const referrer = await User.findByIdAndUpdate(
    bettor.referredBy,
    { $inc: { balance: commission, totalReferralEarnings: commission } },
    { new: true, session }
  );
  if (!referrer) return null;

  const balanceBefore = parseFloat((referrer.balance - commission).toFixed(2));
  await Transaction.create([{
    userId:        referrer._id,
    type:          'referral_commission',
    amount:        commission,
    balanceBefore,
    balanceAfter:  referrer.balance,
    note:          'Referans kâr payı komisyonu',
  }], { session });

  await createTransaction({
    userId: referrer._id,
    type: 'referral_commission',
    amount: commission,
    balanceBefore,
    balanceAfter: referrer.balance,
    note: 'Referans kâr payı komisyonu',
    idempotencyKey: `referral_commission_${referrer._id}_${Date.now()}`,
    source: 'system',
  }, { session });

  const io = getIO();
  if (io) io.to(`user:${referrer._id}`).emit('balance:update', { balance: referrer.balance });

  return commission;
}
