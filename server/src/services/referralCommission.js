import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { getIO } from './socketEmitter.js';

export async function payReferralCommission(userId, houseProfit, options = {}) {
  const { session = null } = options;

  if (!houseProfit || houseProfit <= 0) return null;

  const bettor = await User.findById(userId).select('referredBy').session(session);
  if (!bettor?.referredBy) return null;

  const commission = parseFloat((houseProfit * 0.10).toFixed(2));
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

  const io = getIO();
  if (io) io.to(`user:${referrer._id}`).emit('balance:update', { balance: referrer.balance });

  return commission;
}
