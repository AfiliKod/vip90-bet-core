import User from '../models/User.js';
import Bet from '../models/Bet.js';
import Transaction from '../models/Transaction.js';
import CasinoRound from '../models/CasinoRound.js';
import BonusWagering from '../models/BonusWagering.js';
import CasinoSession from '../models/CasinoSession.js';
import { createError } from '../middleware/error.js';

const DATA_EXPORT_CATEGORIES = [
  'Hesap bilgileri (kullanıcı adı, e-posta, kayıt tarihi)',
  'Bahis geçmişi (tüm spor bahisleri)',
  'Casino oyun geçmişi (Palace turları)',
  'Bonus ve çevrim geçmişi',
  'Para yatırma/çekme işlemleri',
  'Banka talepleri (deposit/withdraw)',
  'Kripto işlemleri',
  'Oturum logları (son 30 gün)',
  'Cihaz ve IP bilgileri',
  'Consent kayıtları (ToS, KVKK, 18+)',
];

export async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error:{code:'NOT_FOUND',message:'Kullanıcı bulunamadı'} });

    const obj = user.toSafeObject();

    // Aktif Palace oturumu varsa Palace'taki bakiyeyi ek bilgi olarak ekle
    const activeSession = await CasinoSession.findOne({ userId: user._id, status: 'active' });
    if (activeSession) {
      const roundAgg = await CasinoRound.aggregate([
        { $match: { userId: user._id, provider: 'palace', createdAt: { $gte: activeSession.transferredAt } } },
        { $group: { _id: null, net: { $sum: '$net' } } },
      ]);
      const netChange = roundAgg[0]?.net || 0;
      obj.activePalaceBalance = Math.max(0, activeSession.initialBalance + netChange);
    }

    res.json({ user: obj });
  } catch(e) { next(e); }
}

export async function getMyBets(req, res, next) {
  try {
    const { status, page=1, limit=20 } = req.query;
    const filter = { userId: req.user.id };
    if (status) filter.status = status;
    const skip = (+page - 1) * +limit;
    const [bets, total] = await Promise.all([
      Bet.find(filter).sort({ createdAt:-1 }).limit(+limit).skip(skip),
      Bet.countDocuments(filter),
    ]);
    res.json({ bets, total, page: +page, limit: +limit });
  } catch(e) { next(e); }
}

export async function getMyTransactions(req, res, next) {
  try {
    const { page=1, limit=50 } = req.query;
    const skip = (+page - 1) * +limit;
    const [transactions, total] = await Promise.all([
      Transaction.find({ userId: req.user.id }).sort({ createdAt:-1 }).limit(+limit).skip(skip),
      Transaction.countDocuments({ userId: req.user.id }),
    ]);
    res.json({ transactions, total, page: +page, limit: +limit });
  } catch(e) { next(e); }
}

export async function getPreferences(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('preferences');
    res.json({ preferences: user.preferences ?? {} });
  } catch(e) { next(e); }
}

export async function updatePreferences(req, res, next) {
  try {
    const allowed = ['avatarColor','favoriteSports','accentColor','oddsFormat','language','notifyLive','notifyOddsChange','defaultStake'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[`preferences.${key}`] = req.body[key];
    }
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true }).select('preferences');
    res.json({ preferences: user.preferences });
  } catch(e) { next(e); }
}

export async function updatePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.validated;
    const user = await User.findById(req.user.id).select('+password');
    const ok = await user.comparePassword(currentPassword);
    if (!ok) return next(createError(400, 'WRONG_PASSWORD', 'Mevcut şifre yanlış'));
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    // Withdrawal cooldown: 24 saat (Phase B17)
    user.withdrawalLockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    // Eski token'ları revoke
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    res.json({ message: 'Şifre güncellendi. 24 saat withdrawal kilidi aktif.' });
  } catch(e) { next(e); }
}

export async function updateEmail(req, res, next) {
  try {
    const { password, newEmail } = req.validated;
    const user = await User.findById(req.user.id).select('+password');
    const ok = await user.comparePassword(password);
    if (!ok) return next(createError(400, 'WRONG_PASSWORD', 'Şifre yanlış'));
    const exists = await User.findOne({ email: newEmail.toLowerCase(), _id: { $ne: user._id } });
    if (exists) return next(createError(400, 'EMAIL_TAKEN', 'Bu e-posta kullanımda'));
    user.email = newEmail.toLowerCase();
    user.emailVerified = false; // Yeniden doğrulama gerek
    user.passwordChangedAt = new Date();
    user.withdrawalLockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    res.json({ message: 'E-posta güncellendi. Yeniden doğrulama gerekli.' });
  } catch(e) { next(e); }
}

// ─── KVKK md.11 — Self-service data export (Phase D5) ────────────
export async function exportMyData(req, res, next) {
  try {
    // Phase A6 — password doğrulaması (validated middleware)
    // Note: dataExportRequestSchema uses body, not query
    const { password } = req.body;
    const user = await User.findById(req.user.id).select('+password');
    const ok = await user.comparePassword(password);
    if (!ok) return next(createError(400, 'WRONG_PASSWORD', 'Şifre yanlış'));

    const userId = req.user.id;
    const [bets, transactions, casinoRounds, bonusWagerings, casinoSessions] = await Promise.all([
      Bet.find({ userId }).select('-raw').lean(),
      Transaction.find({ userId }).lean(),
      CasinoRound.find({ userId }).lean(),
      BonusWagering.find({ userId }).lean(),
      CasinoSession.find({ userId }).lean(),
    ]);

    const exportData = {
      generatedAt: new Date().toISOString(),
      categories: DATA_EXPORT_CATEGORIES,
      account: {
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        preferences: user.preferences,
        consent: {
          acceptedTermsAt: user.acceptedTermsAt,
          acceptedKvkkAt: user.acceptedKvkkAt,
          ageConfirmedAt: user.ageConfirmedAt,
          consentVersion: user.consentVersion,
        },
      },
      bets,
      transactions,
      casinoRounds,
      bonusWagerings,
      casinoSessions,
      counts: {
        bets: bets.length,
        transactions: transactions.length,
        casinoRounds: casinoRounds.length,
        bonusWagerings: bonusWagerings.length,
        casinoSessions: casinoSessions.length,
      },
    };

    res.set('Content-Type', 'application/json');
    res.set('Content-Disposition', `attachment; filename="data-export-${user.username}-${Date.now()}.json"`);
    res.json(exportData);
  } catch(e) { next(e); }
}

// ─── Account deletion (Phase D5 — 30 gün grace) ────────────────────
export async function requestAccountDeletion(req, res, next) {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user.id).select('+password');
    const ok = await user.comparePassword(password);
    if (!ok) return next(createError(400, 'WRONG_PASSWORD', 'Şifre yanlış'));
    if (user.deletionRequestedAt) return next(createError(400, 'ALREADY_PENDING', 'Silme talebi zaten beklemede'));
    user.deletionRequestedAt = new Date();
    user.scheduledDeletionAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await user.save();
    res.json({
      message: 'Hesap silme talebi alındı. 30 gün içinde hesabınız silinecek. Bu süre içinde "Silme İptali" yapabilirsiniz.',
      scheduledDeletionAt: user.scheduledDeletionAt,
    });
  } catch(e) { next(e); }
}

export async function cancelAccountDeletion(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user.deletionRequestedAt) return next(createError(400, 'NOT_PENDING', 'Bekleyen silme talebi yok'));
    user.deletionRequestedAt = null;
    user.scheduledDeletionAt = null;
    await user.save();
    res.json({ message: 'Hesap silme talebi iptal edildi.' });
  } catch(e) { next(e); }
}

// ─── 18+ yaş doğrulama (Phase D3) ──────────────────────────────────
const MIN_AGE = 18;
export async function verifyAge(req, res, next) {
  try {
    const { dateOfBirth } = req.body;
    if (!dateOfBirth) return next(createError(400, 'MISSING_DOB', 'Doğum tarihi gerekli'));
    const dob = new Date(dateOfBirth);
    const ageMs = Date.now() - dob.getTime();
    const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears < MIN_AGE) {
      return next(createError(403, 'UNDERAGE', '18 yaşından büyük olmalısınız. Kumar bağımlılığı yardım hatları: gamblingtherapy.org'));
    }
    const user = await User.findById(req.user.id);
    user.dateOfBirth = dob;
    user.ageVerifiedAt = new Date();
    await user.save();
    res.json({ message: 'Yaş doğrulandı', ageVerified: true });
  } catch(e) { next(e); }
}

// ─── Responsible gambling limits (Phase D4) ───────────────────────
export async function getLimits(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('responsibleLimits');
    res.json({ limits: user.responsibleLimits ?? {} });
  } catch(e) { next(e); }
}

export async function updateLimits(req, res, next) {
  try {
    const allowed = ['depositDaily', 'depositWeekly', 'depositMonthly', 'sessionTimeoutMin', 'selfExclusionUntil'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[`responsibleLimits.${key}`] = req.body[key];
      }
    }
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true }).select('responsibleLimits');
    res.json({ limits: user.responsibleLimits });
  } catch(e) { next(e); }
}