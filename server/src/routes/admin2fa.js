import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import crypto from 'crypto';
import User from '../models/User.js';
import { createError } from '../middleware/error.js';
import { requireAuth, requireAdmin, invalidateUserTokens } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { adminLimiter } from '../middleware/rateLimit.js';
import { setup2faSchema, verify2faSchema, disable2faSchema } from '../validators/admin2fa.js';
import { getSiteName } from '../branding/index.js';
import { encryptTwoFactorSecret, writeBackupCodes, verifySecondFactor } from '../services/twoFactorAuth.js';
import { Router } from 'express';

const r = Router();

// Admin için 2FA setup (Phase B6)
r.post('/setup', requireAuth, requireAdmin, adminLimiter, validate(setup2faSchema), async (req, res, next) => {
  try {
    const { password } = req.validated;
    const user = await User.findById(req.user.id).select('+password');
    if (!user || user.role !== 'admin') return next(createError(403, 'NOT_ADMIN', 'Sadece admin'));
    if (!(await user.comparePassword(password))) return next(createError(401, 'WRONG_PASSWORD', 'Şifre yanlış'));
    if (user.twoFactorEnabled) return next(createError(400, 'ALREADY_ENABLED', '2FA zaten aktif'));

    const secret = speakeasy.generateSecret({
      name: `${await getSiteName()} (${user.username})`,
      length: 32,
    });

    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);

    // Backup codes üret
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex')
    );
    // Sır ve yedek kodlar şifreli saklanır (anahtar yoksa throw → yazma fail-closed);
    // ham değerler yalnız bu yanıtta bir kez gösterilir. Tek save: yarım kurulum kalmaz.
    user.twoFactorSecret = encryptTwoFactorSecret(secret.base32);
    user.twoFactorBackupCodes = writeBackupCodes(backupCodes);
    await user.save();

    res.json({
      secret: secret.base32,
      qrDataUrl,
      backupCodes,
      message: 'QR kodu Google Authenticator ile tarayın, sonra /verify ile doğrulayın',
    });
  } catch (e) { next(e); }
});

// 2FA token doğrula + aktifleştir
r.post('/verify', requireAuth, requireAdmin, adminLimiter, validate(verify2faSchema), async (req, res, next) => {
  try {
    const { token } = req.validated;
    const user = await User.findById(req.user.id).select('+password +twoFactorSecret +twoFactorBackupCodes');
    if (!user || user.role !== 'admin') return next(createError(403, 'NOT_ADMIN', 'Sadece admin'));
    if (!user.twoFactorSecret) return next(createError(400, 'NOT_SETUP', 'Önce setup yapın'));

    const result = await verifySecondFactor(user, token);
    if (!result.ok) return next(createError(401, 'INVALID_TOKEN', 'Geçersiz token'));
    // Backup code kullanıldı — kaldır
    if (result.usedBackupCode) user.twoFactorBackupCodes = writeBackupCodes(result.remainingBackupCodes);

    user.twoFactorEnabled = true;
    user.twoFactorVerifiedAt = new Date();
    await user.save();
    await invalidateUserTokens(req.user.id);

    res.json({ message: '2FA aktifleştirildi', enabled: true });
  } catch (e) { next(e); }
});

// 2FA disable
r.post('/disable', requireAuth, requireAdmin, adminLimiter, validate(disable2faSchema), async (req, res, next) => {
  try {
    const { password, token } = req.validated;
    const user = await User.findById(req.user.id).select('+password +twoFactorSecret +twoFactorBackupCodes');
    if (!user || user.role !== 'admin') return next(createError(403, 'NOT_ADMIN', 'Sadece admin'));
    if (!(await user.comparePassword(password))) return next(createError(401, 'WRONG_PASSWORD', 'Şifre yanlış'));
    if (!user.twoFactorEnabled) return next(createError(400, 'NOT_ENABLED', '2FA zaten kapalı'));

    const result = await verifySecondFactor(user, token);
    if (!result.ok) return next(createError(401, 'INVALID_TOKEN', 'Geçersiz 2FA token'));

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.twoFactorBackupCodes = null;
    user.twoFactorVerifiedAt = null;
    await user.save();
    await invalidateUserTokens(req.user.id);

    res.json({ message: '2FA devre dışı bırakıldı', enabled: false });
  } catch (e) { next(e); }
});

// Status
r.get('/status', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('twoFactorEnabled role');
    res.json({
      enabled: user.twoFactorEnabled || false,
      isAdmin: user.role === 'admin',
    });
  } catch (e) { next(e); }
});

export default r;