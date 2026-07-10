import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import LoginAttempt from '../models/LoginAttempt.js';
import CasinoSession from '../models/CasinoSession.js';
import CasinoRound from '../models/CasinoRound.js';
import { createError } from '../middleware/error.js';
import { sendEmail } from '../services/email.js';

async function enrichWithPalaceBalance(user, obj) {
  try {
    const activeSession = await CasinoSession.findOne({ userId: user._id, status: 'active' });
    if (activeSession) {
      const roundAgg = await CasinoRound.aggregate([
        { $match: { userId: user._id, provider: 'palace', createdAt: { $gte: activeSession.transferredAt } } },
        { $group: { _id: null, net: { $sum: '$net' } } },
      ]);
      const netChange = roundAgg[0]?.net || 0;
      obj.activePalaceBalance = Math.max(0, activeSession.initialBalance + netChange);
    }
  } catch {}
}

async function enrichWithLockedBalance(user, obj) {
  try {
    const { getSpendableBreakdown } = await import('../services/wagering.js');
    const breakdown = await getSpendableBreakdown(user._id);
    obj.locked = breakdown.locked;
    obj.withdrawable = breakdown.withdrawable;
  } catch {}
}

function signAccess(user) {
  return jwt.sign(
    { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function signRefresh(user) {
  return jwt.sign(
    { id: user._id, family: user.tokenVersion || 0 },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

const EMAIL_VERIFY_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_HOURS = 1;
const LOGIN_LOCKOUT_THRESHOLD = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

export async function register(req, res, next) {
  try {
    const {
      username, email, password, referredBy,
      acceptedTerms, acceptedKvkk, consentVersion,
    } = req.validated;

    if (await User.findOne({ $or: [{ username }, { email }] }))
      return next(createError(409, 'USER_EXISTS', 'Kullanıcı adı veya email zaten kullanımda'));

    let referredById = null;
    if (referredBy) {
      const referrer = await User.findOne({ username: referredBy, deletedAt: null });
      if (referrer) referredById = referrer._id;
    }

    // Email verification token üret
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFY_TTL_HOURS * 3600 * 1000);

    const now = new Date();
    const user = await User.create({
      username, email, password, referredBy: referredById,
      // KVKK + Terms consent (Phase A4)
      acceptedTermsAt:  acceptedTerms ? now : null,
      acceptedKvkkAt:   acceptedKvkk ? now : null,
      consentVersion:   consentVersion || '1.0.0',
      // Email verification (Phase D1)
      emailVerified: false,
      emailVerificationToken,
      emailVerificationExpires,
    });

    // Email doğrulama maili gönder (best-effort)
    try {
      await sendEmail({
        to: email,
        subject: 'Email adresinizi doğrulayın — Bet Platform',
        template: 'verify-email',
        data: {
          username,
          verifyUrl: `${getBaseUrl(req)}/verify-email?token=${emailVerificationToken}`,
        },
      });
    } catch (e) {
      console.error('verify email send failed:', e.message);
    }

    const accessToken = signAccess(user);
    setRefreshCookie(res, signRefresh(user));
    const obj = user.toSafeObject();
    obj.emailVerified = false;
    await enrichWithPalaceBalance(user, obj);
    await enrichWithLockedBalance(user, obj);
    res.status(201).json({
      accessToken,
      user: obj,
      message: 'Kayıt başarılı. Email adresinize doğrulama maili gönderildi.',
    });
  } catch (e) { next(e); }
}

export async function login(req, res, next) {
  try {
    const { username, password } = req.validated;
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Hesap kilit kontrolü (Phase C5)
    const recentFails = await LoginAttempt.countDocuments({
      username, ip, success: false,
      createdAt: { $gt: new Date(Date.now() - LOGIN_LOCKOUT_MINUTES * 60 * 1000) },
    });
    if (recentFails >= LOGIN_LOCKOUT_THRESHOLD) {
      return next(createError(429, 'TOO_MANY_ATTEMPTS', `Çok fazla başarısız deneme. ${LOGIN_LOCKOUT_MINUTES} dakika bekleyin.`));
    }

    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      await LoginAttempt.create({ username, ip, userAgent, success: false, failReason: 'user_not_found' });
      return next(createError(401, 'INVALID_CREDENTIALS', 'Kullanıcı adı veya şifre hatalı'));
    }
    if (!user.isActive) {
      await LoginAttempt.create({ userId: user._id, username, ip, userAgent, success: false, failReason: 'banned' });
      return next(createError(403, 'ACCOUNT_BANNED', 'Hesabınız askıya alınmıştır'));
    }
    if (!(await user.comparePassword(password))) {
      await LoginAttempt.create({ userId: user._id, username, ip, userAgent, success: false, failReason: 'wrong_password' });
      return next(createError(401, 'INVALID_CREDENTIALS', 'Kullanıcı adı veya şifre hatalı'));
    }

    // Successful login
    await LoginAttempt.create({ userId: user._id, username, ip, userAgent, success: true });
    user.lastLoginAt = new Date();
    user.lastLoginIp = ip;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // eski token'ları geçersiz kıl
    await user.save();

    const accessToken = signAccess(user);
    setRefreshCookie(res, signRefresh(user));
    const obj = user.toSafeObject();
    await enrichWithPalaceBalance(user, obj);
    await enrichWithLockedBalance(user, obj);
    res.json({ accessToken, user: obj });
  } catch (e) { next(e); }
}

export async function refresh(req, res, next) {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return next(createError(401, 'NO_REFRESH_TOKEN', 'Refresh token bulunamadı'));
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return next(createError(401, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı'));
    // JWT rotation: tokenVersion uyuşmazsa geçersiz
    if (payload.family !== undefined && user.tokenVersion !== payload.family) {
      return next(createError(401, 'TOKEN_REVOKED', 'Token iptal edilmiş. Lütfen tekrar giriş yapın.'));
    }
    // Rotation: her refresh'te tokenVersion artır (Phase B9)
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    const accessToken = signAccess(user);
    setRefreshCookie(res, signRefresh(user));
    const obj = user.toSafeObject();
    await enrichWithPalaceBalance(user, obj);
    await enrichWithLockedBalance(user, obj);
    res.json({ accessToken, user: obj });
  } catch { next(createError(401, 'INVALID_REFRESH_TOKEN', 'Geçersiz refresh token')); }
}

export function logout(req, res) {
  res.clearCookie('refreshToken', { path: '/' });
  res.json({ message: 'Çıkış yapıldı' });
}

// ─── Email doğrulama (Phase D1) ────────────────────────────────
export async function verifyEmail(req, res, next) {
  try {
    const { token } = req.validated;
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });
    if (!user) return next(createError(400, 'INVALID_TOKEN', 'Geçersiz veya süresi dolmuş doğrulama linki'));
    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();
    res.json({ message: 'Email adresiniz doğrulandı', emailVerified: true });
  } catch (e) { next(e); }
}

// ─── Şifre sıfırlama (Phase D2) ───────────────────────────────
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.validated;
    const user = await User.findOne({ email });
    // Güvenlik: user yoksa da success dön (email enumeration prevention)
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.passwordResetToken = token;
      user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 3600 * 1000);
      await user.save();
      try {
        await sendEmail({
          to: email,
          subject: 'Şifre sıfırlama — Bet Platform',
          template: 'password-reset',
          data: {
            username: user.username,
            resetUrl: `${getBaseUrl(req)}/reset-password?token=${token}`,
          },
        });
      } catch (e) {
        console.error('reset email send failed:', e.message);
      }
    }
    res.json({ message: 'Şifre sıfırlama talimatları e-posta adresinize gönderildi' });
  } catch (e) { next(e); }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.validated;
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    }).select('+password');
    if (!user) return next(createError(400, 'INVALID_TOKEN', 'Geçersiz veya süresi dolmuş token'));
    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // eski token'ları revoke
    await user.save();
    res.json({ message: 'Şifreniz başarıyla değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.' });
  } catch (e) { next(e); }
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}