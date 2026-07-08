import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import BankDepositRequest from '../models/BankDepositRequest.js';
import { createError } from '../middleware/error.js';

export function getInfo(req, res) {
  res.json({
    bankName:        process.env.BANK_NAME        || 'Ziraat Bankası',
    bankBranch:      process.env.BANK_BRANCH      || 'İstanbul Merkez Şubesi',
    accountHolder:   process.env.BANK_HOLDER      || 'VIP90.BET TEKNOLOJİ A.Ş.',
    iban:            process.env.BANK_IBAN        || 'TR12 3456 7890 1234 5678 9000 12',
    accountNo:       process.env.BANK_ACCOUNT_NO  || '12345678-901234',
  });
}

export async function createDeposit(req, res, next) {
  try {
    const { amount } = req.validated;
    const deposit = await BankDepositRequest.create({
      userId: req.user.id,
      type: 'deposit',
      amount,
    });
    res.status(201).json({ deposit, message: 'Yatırma talebi oluşturuldu. Hesap bilgilerine havale yaptıktan sonra admin onayı bekleyin.' });
  } catch (e) { next(e); }
}

export async function createWithdraw(req, res, next) {
  try {
    const { amount, confirmForfeit } = req.validated;
    let user = await User.findById(req.user.id);
    if (user.withdrawalLockUntil && user.withdrawalLockUntil > new Date()) {
      const remaining = Math.ceil((user.withdrawalLockUntil - new Date()) / 1000 / 60);
      throw createError(400, 'WITHDRAWAL_LOCKED', `Şifre değişikliğinden sonra ${remaining} dakika beklemelisiniz`);
    }

    const { getSpendableBreakdown, forfeitActiveWagerings } = await import('../services/wagering.js');
    const breakdown = await getSpendableBreakdown(req.user.id);
    if (amount > breakdown.withdrawable) {
      if (breakdown.locked <= 0) throw createError(400, 'INSUFFICIENT_BALANCE', 'Yetersiz bakiye');
      if (!confirmForfeit) {
        throw createError(409, 'ACTIVE_BONUS_LOCK', `Bu çekim ₺${breakdown.locked.toFixed(2)} tutarındaki aktif bonusunuzu iptal eder. Onaylıyor musunuz?`);
      }
      await forfeitActiveWagerings(req.user.id);
      user = await User.findById(req.user.id);
    }

    if (user.balance < amount) throw createError(400, 'INSUFFICIENT_BALANCE', 'Yetersiz bakiye');
    const withdraw = await BankDepositRequest.create({
      userId: req.user.id,
      type: 'withdraw',
      amount,
    });
    res.status(201).json({ withdraw, message: 'Çekim talebi oluşturuldu. Admin onayından sonra hesabınıza aktarılacaktır.' });
  } catch (e) { next(e); }
}

export async function getMyRequests(req, res, next) {
  try {
    const { type, status, page=1, limit=20 } = req.query;
    const filter = { userId: req.user.id };
    if (type) filter.type = String(type);
    if (status) filter.status = String(status);
    const skip = (+page - 1) * +limit;
    const [requests, total] = await Promise.all([
      BankDepositRequest.find(filter).sort({ createdAt: -1 }).limit(+limit).skip(skip),
      BankDepositRequest.countDocuments(filter),
    ]);
    res.json({ requests, total, page: +page, limit: +limit });
  } catch (e) { next(e); }
}

/* ── Admin endpoints ──────────────────────────────────────────── */

export async function getAllPending(req, res, next) {
  try {
    const { type, page=1, limit=50 } = req.query;
    const filter = { status: 'pending' };
    if (type) filter.type = String(type);
    const skip = (+page - 1) * +limit;
    // Phase E11 — pagination added (KRİTİK fix — önceden NO LIMIT)
    const [requests, total] = await Promise.all([
      BankDepositRequest.find(filter)
        .populate('userId', 'username email balance')
        .sort({ createdAt: -1 })
        .limit(+limit).skip(skip),
      BankDepositRequest.countDocuments(filter),
    ]);
    res.json({ requests, total, page: +page, limit: +limit });
  } catch (e) { next(e); }
}

export async function approve(req, res, next) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const record = await BankDepositRequest.findById(req.params.id).session(session);
    if (!record) throw createError(404, 'NOT_FOUND', 'Talep bulunamadı');
    if (record.status !== 'pending') throw createError(409, 'ALREADY_PROCESSED', 'Talep zaten işlenmiş');

    record.status = 'approved';
    record.approvedBy = req.user.id;
    record.approvedAt = new Date();
    await record.save({ session });

    const user = await User.findById(record.userId).session(session);
    const balanceBefore = user.balance;
    const txAmount = record.type === 'deposit' ? record.amount : -record.amount;
    user.balance = +(user.balance + txAmount).toFixed(2);
    await user.save({ session });

    await Transaction.create([{
      userId: record.userId,
      type: record.type === 'deposit' ? 'deposit' : 'withdraw',
      amount: txAmount,
      balanceBefore,
      balanceAfter: user.balance,
      status: 'completed',
      note: `Banka ${record.type === 'deposit' ? 'yatırma' : 'çekme'} onaylandı`,
      createdBy: req.user.id,
    }], { session });

    await session.commitTransaction();
    res.json({ message: 'Talep onaylandı ve bakiye güncellendi', user: user.toSafeObject() });
  } catch (e) { await session.abortTransaction(); next(e); }
  finally { session.endSession(); }
}

export async function reject(req, res, next) {
  try {
    const { note } = req.body;
    const record = await BankDepositRequest.findById(req.params.id);
    if (!record) throw createError(404, 'NOT_FOUND', 'Talep bulunamadı');
    if (record.status !== 'pending') throw createError(409, 'ALREADY_PROCESSED', 'Talep zaten işlenmiş');

    record.status = 'rejected';
    record.adminNote = note || '';
    record.approvedBy = req.user.id;
    record.approvedAt = new Date();
    await record.save();

    res.json({ message: 'Talep reddedildi' });
  } catch (e) { next(e); }
}
