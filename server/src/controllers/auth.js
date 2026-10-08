import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import LoginAttempt from '../models/LoginAttempt.js';
import CasinoSession from '../models/CasinoSession.js';
import CasinoRound from '../models/CasinoRound.js';
import { createError } from '../middleware/error.js';
import { resolveUniquePhone, isDuplicatePhoneError, phoneExistsError } from '../services/userPhone.js';
import { invalidateTokenVersionCache } from '../middleware/auth.js';
import { renderBuiltinTemplate } from '../services/email.js';
import { sendActionMail } from '../services/systemMail.js';

async function enrichWithIgamesBalance(user, obj) {
  try {
    const activeSession = await CasinoSession.findOne({ userId: user._id, status: 'active' });
    if (activeSession) {
      const roundAgg = await CasinoRound.aggregate([
        { $match: { userId: user._id, provider: 'igames', createdAt: { $gte: activeSession.transferredAt } } },
        { $group: { _id: null, net: { $sum: '$net' } } },
      ]);
      const netChange = roundAgg[0]?.net || 0;
      obj.activeIgamesBalance = Math.max(0, activeSession.initialBalance + netChange);
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

export { signAccess, enrichWithIgamesBalance, enrichWithLockedBalance };

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

// P5/P6 — sosyal/web3 giriş route'ları da normal login'le aynı token
// çiftini (access + refresh cookie) üretmeli.
export { signRefresh, setRefreshCookie };

const EMAIL_VERIFY_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_HOURS = 1;
const LOGIN_LOCKOUT_THRESHOLD = 5;
const LOGIN_LOCKOUT_MINUTES = 15;
const EMAIL_VERIFICATION_CUTOFF = new Date(process.env.EMAIL_VERIFICATION_CUTOFF || '2026-07-14T00:00:00Z');

export async function register(req, res, next) {
  try {
    const {
      username, email, password, referredBy,
      phone, dateOfBirth,
      acceptedTerms, acceptedKvkk, consentVersion,
    } = req.validated;

    if (await User.findOne({ $or: [{ username }, { email }] }))
      return next(createError(409, 'USER_EXISTS', 'Kullanıcı adı veya email zaten kullanımda'));

    const normalizedPhone = await resolveUniquePhone(phone);

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
      // Slikair payment için opsiyonel alanlar
      phone: normalizedPhone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      // KVKK + Terms consent (Phase A4)
      acceptedTermsAt:  acceptedTerms ? now : null,
      acceptedKvkkAt:   acceptedKvkk ? now : null,
      consentVersion:   consentVersion || '1.0.0',
      // Email verification (Phase D1)
      emailVerified: false,
      emailVerificationToken,
      emailVerificationExpires,
    });

    // Email doğrulama maili gönder (best-effort). İçerik admin panelindeki
    // "Sistem E-postaları" sayfasından düzenlenir; şablon pasif/yoksa gömülü
    // şablonla aynı içerik gönderilir (davranış değişmez).
    const verifyUrl = `${getBaseUrl(req)}/verify-email?token=${emailVerificationToken}`;
    let emailResult;
    try {
      emailResult = await sendActionMail('user.emailVerify', {
        user,
        to: email,
        vars: { verifyUrl, expiresHours: EMAIL_VERIFY_TTL_HOURS },
        fallback: () => renderBuiltinTemplate('verify-email', { username, verifyUrl }),
      });
    } catch (e) {
      console.error('verify email send failed:', e.message);
    }
    // Karşılama maili isteğe bağlıdır: panelde yalnızca bir şablon tanımlanırsa gönderilir.
    sendActionMail('user.welcome', { user }).catch(() => {});
    // Karşılama SMS'i — aynı kapılar: şablon aktif + gateway + modül açık olmalı,
    // yoksa dispatchSmsEvent ilk sorguda atlar. Fire-and-forget.
    import('../services/smsTemplate.js')
      .then(({ dispatchSmsEvent }) => dispatchSmsEvent('userRegistered', user, { balance: user.balance }))
      .catch(() => {});

    const obj = user.toSafeObject();
    obj.emailVerified = false;
    const response = {
      user: obj,
      message: 'Kayıt başarılı. Email adresinize doğrulama maili gönderildi. Giriş yapabilmek için lütfen email adresinizi doğrulayın.',
    };
    // SMTP yapılandırılmamışsa (local/dev): linki response'a da ekle, aksi halde
    // gerçek mail gelmediği için doğrulama akışı test edilemez.
    if (process.env.NODE_ENV !== 'production' && emailResult?.mock) {
      response.devVerifyUrl = verifyUrl;
    }
    res.status(201).json(response);
  } catch (e) { next(isDuplicatePhoneError(e) ? phoneExistsError() : e); }
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
      // 429 dönen kilitli istekler hiç yeni LoginAttempt yazmıyor, bu yüzden
      // recentFails eşikte donuk kalıyor — "=== THRESHOLD" tek başına brute
      // force altında HER istekte tekrar true olup feed'i flood'luyordu
      // (2026-09-23'te final review'da bulundu, ampirik doğrulandı: 3 kilitli
      // istek → 3 event). Zaman-pencereli tekrar-önleme: bu kilitlenme
      // penceresi için zaten bir login_risk event'i varsa tekrar loglama.
      try {
        const { logActivity } = await import('../services/activityFeed.js');
        const ActivityEvent = (await import('../models/ActivityEvent.js')).default;
        const lockedUser = await User.findOne({ username }).select('_id');
        if (lockedUser) {
          const alreadyLogged = await ActivityEvent.exists({
            type: 'login_risk', userId: lockedUser._id, status: 'locked',
            createdAt: { $gt: new Date(Date.now() - LOGIN_LOCKOUT_MINUTES * 60 * 1000) },
          });
          if (!alreadyLogged) {
            await logActivity({
              type: 'login_risk', userId: lockedUser._id, status: 'locked',
              summary: `Hesap kilitlendi: ${recentFails} başarısız giriş denemesi`,
              data: { ip, recentFails },
            });
          }
        }
      } catch (e) {
        console.error('[activity] login lockout error:', e.message);
      }
      return next(createError(429, 'TOO_MANY_ATTEMPTS', `Çok fazla başarısız deneme. ${LOGIN_LOCKOUT_MINUTES} dakika bekleyin.`));
    }

    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      await LoginAttempt.create({ username, ip, userAgent, success: false, failReason: 'user_not_found' });
      return next(createError(401, 'INVALID_CREDENTIALS', 'Kullanıcı adı veya şifre hatalı'));
    }
    // Admin demo-veri üreticisinin (isSeed) hesapları gerçek oturum açamaz —
    // gerçek bakiyeleri var ve eskiden koddaki sabit parolayı paylaşıyorlardı.
    // Hesabın varlığını sızdırmamak için "yanlış şifre" ile aynı yanıt.
    if (user.isSeed) {
      await LoginAttempt.create({ userId: user._id, username, ip, userAgent, success: false, failReason: 'seed_account' });
      return next(createError(401, 'INVALID_CREDENTIALS', 'Kullanıcı adı veya şifre hatalı'));
    }
    if (!user.isActive) {
      await LoginAttempt.create({ userId: user._id, username, ip, userAgent, success: false, failReason: 'banned' });
      return next(createError(403, 'ACCOUNT_BANNED', 'Hesabınız askıya alınmıştır'));
    }
    if (!(await user.comparePassword(password))) {
      await LoginAttempt.create({ userId: user._id, username, ip, userAgent, success: false, failReason: 'wrong_password' });
      try { const { onFailedLogin } = await import('../services/riskDetector.js'); await onFailedLogin(user._id, { ip }); } catch {}
      return next(createError(401, 'INVALID_CREDENTIALS', 'Kullanıcı adı veya şifre hatalı'));
    }
    if (!user.emailVerified && user.createdAt >= EMAIL_VERIFICATION_CUTOFF) {
      return next(createError(403, 'EMAIL_NOT_VERIFIED', 'Email adresinizi doğrulamanız gerekiyor. Gelen kutunuzu kontrol edin.', { email: user.email }));
    }

    // Successful login
    await LoginAttempt.create({ userId: user._id, username, ip, userAgent, success: true });
    user.lastLoginAt = new Date();
    user.lastLoginIp = ip;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // eski token'ları geçersiz kıl
    await user.save();
    invalidateTokenVersionCache(user._id); // bkz. refresh()'teki not — aynı 30sn önbellek riski

    const accessToken = signAccess(user);
    setRefreshCookie(res, signRefresh(user));
    const obj = user.toSafeObject();
    await enrichWithIgamesBalance(user, obj);
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
    // Demo/seed hesapları oturum yenileyemez (login ve requireAuth ile aynı kural).
    if (user.isSeed) return next(createError(401, 'TOKEN_REVOKED', 'Token iptal edilmiş. Lütfen tekrar giriş yapın.'));
    // JWT rotation: tokenVersion uyuşmazsa geçersiz
    if (payload.family !== undefined && user.tokenVersion !== payload.family) {
      return next(createError(401, 'TOKEN_REVOKED', 'Token iptal edilmiş. Lütfen tekrar giriş yapın.'));
    }
    // Rotation: her refresh'te tokenVersion artır (Phase B9)
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    // 2026-09-23: middleware/auth.js'in requireAuth'u DB tokenVersion'ını 30sn
    // önbellekliyor — burada artırıp önbelleği haberdar etmezsek, az önce
    // basılan bu YENİ (geçerli) access token bile "tokenVersion uyuşmazlığı"
    // ile reddedilir (bkz. invalidateTokenVersionCache'in üstündeki not).
    invalidateTokenVersionCache(user._id);
    const accessToken = signAccess(user);
    setRefreshCookie(res, signRefresh(user));
    const obj = user.toSafeObject();
    await enrichWithIgamesBalance(user, obj);
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
    // Doğrulama SMS'i — fire-and-forget, şablon yok/pasif/gateway kapalıysa atlar.
    import('../services/smsTemplate.js')
      .then(({ dispatchSmsEvent }) => dispatchSmsEvent('emailVerified', user))
      .catch(() => {});
    res.json({ message: 'Email adresiniz doğrulandı', emailVerified: true });
  } catch (e) { next(e); }
}

export async function resendVerification(req, res, next) {
  try {
    const { email } = req.validated;
    const user = await User.findOne({ email });
    let emailResult;
    // Dışarıdaki `devVerifyUrl` dalı da bu bağlamdan okur — blok içine
    // `const` ile tanımlanırsa ReferenceError fırlatırdı.
    let verifyUrl = '';
    if (user && !user.emailVerified) {
      const token = crypto.randomBytes(32).toString('hex');
      user.emailVerificationToken = token;
      user.emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFY_TTL_HOURS * 3600 * 1000);
      await user.save();
      verifyUrl = `${getBaseUrl(req)}/verify-email?token=${token}`;
      try {
        emailResult = await sendActionMail('user.emailVerify', {
          user,
          to: email,
          vars: { verifyUrl, expiresHours: EMAIL_VERIFY_TTL_HOURS },
          fallback: () => renderBuiltinTemplate('verify-email', { username: user.username, verifyUrl }),
        });
      } catch (e) {
        console.error('resend verify email send failed:', e.message);
      }
    }
    // Güvenlik: kullanıcı yoksa/zaten doğrulanmışsa da aynı generic mesaj (email enumeration prevention)
    const response = { message: 'Doğrulanmamış bir hesap bulunursa, doğrulama maili gönderildi.' };
    if (process.env.NODE_ENV !== 'production' && emailResult?.mock) {
      response.devVerifyUrl = verifyUrl;
    }
    res.json(response);
  } catch (e) { next(e); }
}

// ─── Şifre sıfırlama (Phase D2) ───────────────────────────────
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.validated;
    const user = await User.findOne({ email });
    // Güvenlik: user yoksa da success dön (email enumeration prevention)
    let emailResult;
    // `devResetUrl` bu bağlamdan okunur — blok içi `const` ReferenceError üretirdi.
    let resetUrl = '';
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.passwordResetToken = token;
      user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 3600 * 1000);
      await user.save();
      resetUrl = `${getBaseUrl(req)}/reset-password?token=${token}`;
      try {
        emailResult = await sendActionMail('user.passwordReset', {
          user,
          to: email,
          vars: { resetUrl, expiresMinutes: PASSWORD_RESET_TTL_HOURS * 60 },
          fallback: () => renderBuiltinTemplate('password-reset', { username: user.username, resetUrl }),
        });
      } catch (e) {
        console.error('reset email send failed:', e.message);
      }
    }
    const response = { message: 'Şifre sıfırlama talimatları e-posta adresinize gönderildi' };
    if (process.env.NODE_ENV !== 'production' && emailResult?.mock) {
      response.devResetUrl = resetUrl;
    }
    res.json(response);
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
    invalidateTokenVersionCache(user._id); // revoke'un 30sn önbellek gecikmesi olmadan anında etkili olması için
    // Güvenlik bildirimi — panelde bir şablon tanımlanmışsa gönderilir.
    sendActionMail('user.passwordChanged', { user, vars: { changedAt: new Date().toISOString() } }).catch(() => {});
    res.json({ message: 'Şifreniz başarıyla değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.' });
  } catch (e) { next(e); }
}

function getBaseUrl(req) {
  // Production'da client aynı origin'den (Express static) servis edilir, req.host doğrudur.
  // Dev'de client ayrı bir Vite sunucusunda çalışır — API'nin kendi host'u yanlış link üretir.
  if (process.env.NODE_ENV !== 'production') {
    // CLIENT_URL CORS için virgülle ayrılmış çoklu origin olabilir — linkte ilkini kullan.
    const first = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();
    return first;
  }
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}