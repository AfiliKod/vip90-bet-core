import Promotion from '../models/Promotion.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import BonusWagering from '../models/BonusWagering.js';
import { createError } from '../middleware/error.js';

export async function list(req, res, next) {
  try {
    const promos = await Promotion.find({ isActive:true });
    res.json({ promotions: promos });
  } catch(e) { next(e); }
}

export async function claim(req, res, next) {
  try {
    // Phase A5 — Bonus T&C zorunlu
    const { acceptedBonusTerms } = req.body;
    if (!acceptedBonusTerms) {
      throw createError(400, 'T&C_REQUIRED', 'Bonus kullanım koşullarını kabul etmelisiniz');
    }

    // Atomic claim: only one concurrent request can add userId to claimedBy
    const claimed = await Promotion.findOneAndUpdate(
      {
        _id: req.params.id,
        isActive: true,
        claimedBy: { $ne: req.user.id },
      },
      { $push: { claimedBy: req.user.id } },
      { new: true }
    );

    if (!claimed) {
      const exists = await Promotion.findById(req.params.id);
      if (!exists || !exists.isActive) throw createError(404,'NOT_FOUND','Promosyon bulunamadı');
      throw createError(409,'ALREADY_CLAIMED','Bu promosyonu daha önce kullandınız');
    }
    const promo = claimed;

    // Model B (Kilitli Bakiye): bonus anında gerçek balance'a eklenir, hemen
    // oynanabilir olur. wageringRequired tamamlanana dek lockedAmount kadarı
    // çekilemez (bkz. wagering.js getLockedAmount/getSpendableBreakdown).
    const user = await User.findById(req.user.id);
    const balanceBefore = user.balance;
    user.balance = parseFloat((user.balance + promo.amount).toFixed(2));
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: 'bonus',
      amount: promo.amount,
      balanceBefore,
      balanceAfter: user.balance,
      referenceId: promo._id,
      note: `Promosyon: ${promo.title}`,
    });

    // Wagering requirement oluştur
    const wageringMultiplier = promo.wageringMultiplier || 35;
    const wageringRequired = parseFloat((promo.amount * wageringMultiplier).toFixed(2));
    const deadline = promo.deadlineDays
      ? new Date(Date.now() + promo.deadlineDays * 24 * 60 * 60 * 1000)
      : null;

    await BonusWagering.create({
      userId: user._id,
      promotionId: promo._id,
      source: 'promotion',
      description: promo.title,
      bonusAmount: promo.amount,
      wageringRequired,
      wageringProgress: 0,
      multiplier: wageringMultiplier,
      gameWeights: promo.gameWeights || undefined,
      deadline,
      status: 'active',
      acceptedTermsAt: new Date(), // Phase A5 — bonus T&C consent
    });

    // bonusBalance artık ayrı bir para havuzu değil, kilitli/çevrim bekleyen
    // tutarın göstergesi (mirror). Gerçek kaynak: getLockedAmount().
    const { getLockedAmount } = await import('../services/wagering.js');
    user.bonusBalance = await getLockedAmount(user._id);
    await user.save();

    res.json({
      message: 'Bonus bakiyenize eklendi, hemen oynanabilir',
      balance: user.balance,
      bonusBalance: user.bonusBalance,
      wageringRequired,
      wageringMultiplier,
      deadline,
    });
  } catch(e) { next(e); }
}

export async function myWagerings(req, res, next) {
  try {
    const wagerings = await BonusWagering.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ wagerings });
  } catch(e) { next(e); }
}

export async function convert(req, res, next) {
  try {
    const { convertBonus } = await import('../services/wagering.js');
    const result = await convertBonus(req.params.wid, req.user.id);
    if (!result) throw createError(400, 'INVALID_STATE', 'Bu bonus dönüştürülemez (tamamlanmamış veya zaten dönüştürülmüş)');
    res.json({
      message: 'Bonus cash\'e çevrildi',
      convertedAmount: result.convertedAmount,
      newBalance: result.newBalance,
    });
  } catch(e) { next(e); }
}