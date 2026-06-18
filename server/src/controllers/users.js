import User from '../models/User.js';
import Bet from '../models/Bet.js';
import Transaction from '../models/Transaction.js';

export async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error:{code:'NOT_FOUND',message:'Kullanıcı bulunamadı'} });
    res.json({ user: user.toSafeObject() });
  } catch(e) { next(e); }
}
export async function getMyBets(req, res, next) {
  try {
    const { status, page=1, limit=20 } = req.query;
    const filter = { userId: req.user.id };
    if (status) filter.status = status;
    const bets = await Bet.find(filter).sort({ createdAt:-1 }).limit(+limit).skip((+page-1)*+limit);
    res.json({ bets });
  } catch(e) { next(e); }
}
export async function getMyTransactions(req, res, next) {
  try {
    const txs = await Transaction.find({ userId: req.user.id }).sort({ createdAt:-1 }).limit(50);
    res.json({ transactions: txs });
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
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6)
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Geçersiz şifre' } });
    const user = await User.findById(req.user.id);
    const ok = await user.comparePassword(currentPassword);
    if (!ok) return res.status(400).json({ error: { code: 'WRONG_PASSWORD', message: 'Mevcut şifre yanlış' } });
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Şifre güncellendi' });
  } catch(e) { next(e); }
}

export async function updateEmail(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: { code: 'VALIDATION', message: 'E-posta ve şifre gerekli' } });
    const user = await User.findById(req.user.id);
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(400).json({ error: { code: 'WRONG_PASSWORD', message: 'Şifre yanlış' } });
    const exists = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
    if (exists) return res.status(400).json({ error: { code: 'EMAIL_TAKEN', message: 'Bu e-posta kullanımda' } });
    user.email = email.toLowerCase();
    await user.save();
    res.json({ message: 'E-posta güncellendi', email: user.email });
  } catch(e) { next(e); }
}
