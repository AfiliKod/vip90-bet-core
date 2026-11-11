import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import LoginAttempt from '../models/LoginAttempt.js';
import CasinoSession from '../models/CasinoSession.js';
import CasinoRound from '../models/CasinoRound.js';
import { createError } from '../middleware/error.js';
import { hasAgeConsent, isAdultDateOfBirth } from '../middleware/ageGate.js';
import { resolveUniquePhone, isDuplicatePhoneError, phoneExistsError } from '../services/userPhone.js';
import { invalidateTokenVersionCache } from '../middleware/auth.js';
import { renderBuiltinTemplate } from '../services/email.js';
import { sendActionMail } from '../services/systemMail.js';
import { hashToken } from '../utils/tokenHash.js';
import { signAccess, signRefresh, setRefreshCookie, issueSession, reserveTwoFactorAttempt, assertAccountCanSession } from '../services/session.js';
import { claimChallenge, markChallengeUsed, recordChallengeFailure, acquireChallenge, releaseChallenge } from '../services/twoFactorChallenge.js';
import { verifySecondFactor, writeBackupCodes } from '../services/twoFactorAuth.js';

async function enrichWithIgamesBalance(user, obj) {
  try {
    // A closing igames session (V19b) still holds the player's casino money.
    // F3: a stray_deposit session (a refunded launch whose late deposit is
    // being recovered) holds no player money: its transfer was refunded.
    const activeSession = await CasinoSession.findOne({
      userId: user._id, status: { $in: ['active', 'closing'] }, reconciliationReason: { $ne: 'stray_deposit' },
    });
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

export { enrichWithIgamesBalance, enrichWithLockedBalance };

// Token üretimi services/session.js'e taşındı; mevcut importlar kırılmasın diye re-export.
export { signAccess, signRefresh, setRefreshCookie };

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
      acceptedTerms, acceptedKvkk, consentVersion, ageConfirmed,
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
    // E-postaya ham token gider; DB'ye yalnız SHA-256 hash'i yazılır (V1).
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationToken = hashToken(rawVerificationToken);
    const emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFY_TTL_HOURS * 3600 * 1000);

    const now = new Date();
    // 18+ beyanı: beyan → ageConfirmedAt, doğum tarihi 18+ kanıtlıyorsa
    // ayrıca ageVerifiedAt (2026-10-08; daha önce hiç yazılmıyordu).
    const dobAdult = dateOfBirth ? isAdultDateOfBirth(dateOfBirth, now) : null;
    if (dobAdult === false) {
      throw createError(422, 'AGE_NOT_ELIGIBLE', '18 yaşından küçük oyuncular kaydolamaz');
    }
    const user = await User.create({
      username, email, password, referredBy: referredById,
      // Slikair payment için opsiyonel alanlar
      phone: normalizedPhone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      // KVKK + Terms consent (Phase A4)
      acceptedTermsAt:  acceptedTerms ? now : null,
      acceptedKvkkAt:   acceptedKvkk ? now : null,
      ageConfirmedAt:   ageConfirmed ? now : null,
      ageVerifiedAt:    dobAdult === true ? now : null,
      consentVersion:   consentVersion || '1.0.0',
      // Email verification (Phase D1)
      emailVerified: false,
      emailVerificationToken,
      emailVerificationExpires,
    });

    // Email doğrulama maili gönder (best-effort). İçerik admin panelindeki
    // "Sistem E-postaları" sayfasından düzenlenir; şablon pasif/yoksa gömülü
    // şablonla aynı içerik gönderilir (davranış değişmez).
    const verifyUrl = `${getBaseUrl(req)}/verify-email?token=${rawVerificationToken}`;
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

    // Başarılı parola. 2FA'lı hesapta oturum + tokenVersion artışı + lastLogin
    // ikinci faktör doğrulanana kadar ertelenir; yanıtta kullanıcı nesnesi YOK.
    const session = await issueSession(user, { method: 'pwd' });
    if (session.requires2fa) {
      return res.json({ requires2fa: true, challengeToken: session.challengeToken });
    }
    await LoginAttempt.create({ userId: user._id, username, ip, userAgent, success: true });
    user.lastLoginAt = new Date();
    user.lastLoginIp = ip;
    await user.save();

    setRefreshCookie(res, session.refreshToken);
    const obj = user.toSafeObject();
    await enrichWithIgamesBalance(user, obj);
    await enrichWithLockedBalance(user, obj);
    res.json({ accessToken: session.accessToken, user: obj, amr: session.amr });
  } catch (e) { next(e); }
}

/**
 * POST /auth/2fa/login — challenge + TOTP/yedek kod → oturum.
 * Challenge 5 dk ömürlü, tek kullanımlık, 5 denemede kilitlenir.
 */
export async function verifyLogin2fa(req, res, next) {
  try {
    const { challengeToken, token } = req.validated;
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const payload = claimChallenge(challengeToken);
    // Eşzamanlı ikinci gönderim: ilki bitene kadar reddedilir (await'ten önce).
    if (!acquireChallenge(payload.jti)) {
      return next(createError(409, 'CHALLENGE_USED', 'Doğrulama anahtarı kullanılmış'));
    }
    try {
      const user = await User.findById(payload.id).select('+twoFactorSecret +twoFactorBackupCodes');
      const invalid = () => createError(401, 'INVALID_2FA', 'Doğrulama kodu hatalı');
      if (!user || user.isSeed || !user.twoFactorEnabled
        || (user.tokenVersion || 0) !== (payload.tokenVersion || 0)) {
        markChallengeUsed(payload.jti);
        return next(createError(401, 'INVALID_CHALLENGE', 'Geçersiz doğrulama anahtarı'));
      }
      if (!user.isActive) {
        markChallengeUsed(payload.jti);
        return next(createError(403, 'ACCOUNT_BANNED', 'Hesabınız askıya alınmıştır'));
      }

      // Atomik rezervasyon: bekleyen wrong_2fa satırı doğrulamadan önce yazılır.
      const attemptId = await reserveTwoFactorAttempt(user, { ip, userAgent });
      const result = await verifySecondFactor(user, token);
      if (!result.ok) {
        recordChallengeFailure(payload.jti);
        return next(invalid());
      }
      await LoginAttempt.deleteOne({ _id: attemptId });
      markChallengeUsed(payload.jti);
      if (result.usedBackupCode) {
        // Koşullu güncelleme: aynı yedek kod iki kez tüketilemez.
        const next2 = writeBackupCodes(result.remainingBackupCodes);
        const upd = await User.updateOne({ _id: user._id, twoFactorBackupCodes: user.twoFactorBackupCodes }, { $set: { twoFactorBackupCodes: next2 } });
        if (upd.modifiedCount !== 1) {
          recordChallengeFailure(payload.jti);
          return next(createError(401, 'INVALID_2FA', 'Doğrulama kodu hatalı'));
        }
      }

      await LoginAttempt.create({ userId: user._id, username: user.username, ip, userAgent, success: true });
      user.lastLoginAt = new Date();
      user.lastLoginIp = ip;
      const session = await issueSession(user, { method: payload.amr?.[0] || 'pwd', verified2fa: true });

      setRefreshCookie(res, session.refreshToken);
      const obj = user.toSafeObject();
      await enrichWithIgamesBalance(user, obj);
      await enrichWithLockedBalance(user, obj);
      res.json({ accessToken: session.accessToken, user: obj, amr: session.amr });
    } finally {
      releaseChallenge(payload.jti);
    }
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
    // Askıya alınmış/silinmiş hesabın refresh cookie'si artık dönmez.
    assertAccountCanSession(user);
    // Rotation: her refresh'te tokenVersion artır (Phase B9)
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    // 2026-09-23: middleware/auth.js'in requireAuth'u DB tokenVersion'ını 30sn
    // önbellekliyor — burada artırıp önbelleği haberdar etmezsek, az önce
    // basılan bu YENİ (geçerli) access token bile "tokenVersion uyuşmazlığı"
    // ile reddedilir (bkz. invalidateTokenVersionCache'in üstündeki not).
    invalidateTokenVersionCache(user._id);
    const accessToken = signAccess(user, ['refresh']);
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

/**
 * 18+ kapısının açılması (2026-10-08).
 *
 * Kayıtta beyan (`ageConfirmed`) ya da doğum tarihi göndermeyen hesaplar
 * casino oyunlarına erişemez (middleware/ageGate.js → 403
 * AGE_CONFIRMATION_REQUIRED); burada tek tıkla kayıt yazılır. Doğum tarihi
 * 18 yaş altını kanıtlıyorsa beyan YAZILMAZ (422) — 18+ kapısı atlanamaz.
 */
export async function ageConfirm(req, res, next) {
  try {
    const { confirmed, dateOfBirth } = req.validated || {};
    const now = new Date();

    const dobAdult = dateOfBirth ? isAdultDateOfBirth(dateOfBirth, now) : null;
    if (dobAdult === false) {
      return next(createError(422, 'AGE_NOT_ELIGIBLE', '18 yaşından küçük oyuncular casino oyunlarına erişemez'));
    }

    const update = { ageConfirmedAt: now };
    if (dobAdult === true) update.ageVerifiedAt = now;
    if (dateOfBirth) update.dateOfBirth = new Date(dateOfBirth);

    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true })
      .select('-password');

    if (!user) return next(createError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı'));

    res.json({
      message: '18 yaş onayı kaydedildi',
      ageConfirmedAt: user.ageConfirmedAt,
      ageVerifiedAt: user.ageVerifiedAt,
      verified: Boolean(user.ageVerifiedAt),
      ageConsent: hasAgeConsent(user),
    });
  } catch (e) { next(e); }
}

// ─── Email doğrulama (Phase D1) ────────────────────────────────
export async function verifyEmail(req, res, next) {
  try {
    const { token } = req.validated;
    const user = await User.findOne({
      emailVerificationToken: hashToken(token),
      emailVerificationExpires: { $gt: new Date() },
    }).select('+emailVerificationToken');
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
      user.emailVerificationToken = hashToken(token);
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
      user.passwordResetToken = hashToken(token);
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
      passwordResetToken: hashToken(token),
      passwordResetExpires: { $gt: new Date() },
    }).select('+password +passwordResetToken');
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