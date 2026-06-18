import Promotion from '../models/Promotion.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { createError } from '../middleware/error.js';

export async function list(req, res, next) {
  try {
    const promos = await Promotion.find({ isActive:true });
    res.json({ promotions: promos });
  } catch(e) { next(e); }
}

export async function claim(req, res, next) {
  try {
    const promo = await Promotion.findById(req.params.id);
    if (!promo || !promo.isActive) throw createError(404,'NOT_FOUND','Promosyon bulunamadı');
    if (promo.claimedBy.includes(req.user.id)) throw createError(409,'ALREADY_CLAIMED','Bu promosyonu daha önce kullandınız');
    const user = await User.findById(req.user.id);
    const balanceBefore = user.bonusBalance;
    user.bonusBalance = +(user.bonusBalance + promo.amount).toFixed(2);
    promo.claimedBy.push(user._id);
    await Promise.all([user.save(), promo.save()]);
    await Transaction.create({ userId: user._id, type:'bonus', amount: promo.amount, balanceBefore, balanceAfter: user.bonusBalance });
    res.json({ message:'Bonus bakiyenize eklendi', bonusBalance: user.bonusBalance });
  } catch(e) { next(e); }
}
