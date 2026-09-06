import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import crypto from 'crypto';
import User from '../models/User.js';
import { createError } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { adminLimiter } from '../middleware/rateLimit.js';
import { getSiteName } from '../branding/index.js';
import { Router } from 'express';

const r = Router();

// Admin için 2FA setup (Phase B6)
r.post('/setup', requireAuth, adminLimiter, async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) return next(createError(400, 'MISSING_PASSWORD', 'Şifre gerekli'));
    const user = await User.findById(req.user.id).select('+password');
    if (!user || user.role !== 'admin') return next(createError(403, 'NOT_ADMIN', 'Sadece admin'));
    if (!(await user.comparePassword(password))) return next(createError(401, 'WRONG_PASSWORD', 'Şifre yanlış'));
    if (user.twoFactorEnabled) return next(createError(400, 'ALREADY_ENABLED', '2FA zaten aktif'));

    const secret = speakeasy.generateSecret({
      name: `${await getSiteName()} (${user.username})`,
      length: 32,
    });

    user.twoFactorSecret = secret.base32;
    await user.save();

    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);

    // Backup codes üret
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex')
    );
    user.twoFactorBackupCodes = backupCodes;
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
r.post('/verify', requireAuth, adminLimiter, async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return next(createError(400, 'MISSING_TOKEN', 'Token gerekli'));
    const user = await User.findById(req.user.id);
    if (!user || user.role !== 'admin') return next(createError(403, 'NOT_ADMIN', 'Sadece admin'));
    if (!user.twoFactorSecret) return next(createError(400, 'NOT_SETUP', 'Önce setup yapın'));

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: String(token).replace(/\s/g, ''),
      window: 1,
    });

    if (!verified) {
      // Backup code kontrolü
      const codeIndex = (user.twoFactorBackupCodes || []).indexOf(String(token).trim());
      if (codeIndex === -1) return next(createError(401, 'INVALID_TOKEN', 'Geçersiz token'));
      // Backup code kullanıldı — kaldır
      user.twoFactorBackupCodes.splice(codeIndex, 1);
    }

    user.twoFactorEnabled = true;
    user.twoFactorVerifiedAt = new Date();
    await user.save();

    res.json({ message: '2FA aktifleştirildi', enabled: true });
  } catch (e) { next(e); }
});

// 2FA disable
r.post('/disable', requireAuth, adminLimiter, async (req, res, next) => {
  try {
    const { password, token } = req.body;
    const user = await User.findById(req.user.id).select('+password');
    if (!user || user.role !== 'admin') return next(createError(403, 'NOT_ADMIN', 'Sadece admin'));
    if (!(await user.comparePassword(password))) return next(createError(401, 'WRONG_PASSWORD', 'Şifre yanlış'));
    if (!user.twoFactorEnabled) return next(createError(400, 'NOT_ENABLED', '2FA zaten kapalı'));

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: String(token).replace(/\s/g, ''),
      window: 1,
    });
    if (!verified) return next(createError(401, 'INVALID_TOKEN', 'Geçersiz 2FA token'));

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    user.twoFactorBackupCodes = [];
    user.twoFactorVerifiedAt = null;
    await user.save();

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