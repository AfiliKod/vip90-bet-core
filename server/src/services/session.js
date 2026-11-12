import jwt from 'jsonwebtoken';
import { invalidateTokenVersionCache } from '../middleware/auth.js';
import LoginAttempt from '../models/LoginAttempt.js';
import { createError } from '../middleware/error.js';
import { createChallengeToken } from './twoFactorChallenge.js';

export function signAccess(user, amr = ['pwd']) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
      sub: user._id,
      typ: 'player',
      tid: user.tenantId || null,
      tv: user.tokenVersion || 0,
      aud: 'player',
      amr,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

export function signRefresh(user) {
  return jwt.sign(
    { id: user._id, family: user.tokenVersion || 0 },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

export function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

/**
 * Oturum açmanın tek kapısı (şifre, cüzdan, Google, Telegram).
 * 2FA'lı hesapta ikinci faktör doğrulanmadan token ÇIKMAZ ve tokenVersion
 * artmaz (mevcut oturumlar bozulmaz); yalnız challenge döner.
 */
export const TFA_FAIL_LIMIT = 10;
const TFA_FAIL_WINDOW_MS = 15 * 60 * 1000;

// Hesap başına (IP'den bağımsız) yanlış ikinci faktör sınırı.
export async function assertTwoFactorNotLocked(user) {
  const n = await LoginAttempt.countDocuments({
    userId: user._id, success: false, failReason: 'wrong_2fa',
    createdAt: { $gt: new Date(Date.now() - TFA_FAIL_WINDOW_MS) },
  });
  if (n >= TFA_FAIL_LIMIT) {
    throw createError(429, 'TOO_MANY_ATTEMPTS', 'Çok fazla doğrulama denemesi. 15 dakika bekleyin.');
  }
}

// Tahmini doğrulamadan ÖNCE atomik rezerve eder: bekleyen bir wrong_2fa satırı
// eklenir, sonra pencere sayılır (kendi satırı dahil). Eşzamanlı isteklerin
// hepsi birbirinin satırını görür; limiti aşan reddedilir (satırı kalır)
// Başarıda satır silinir.
export async function reserveTwoFactorAttempt(user, { ip, userAgent }) {
  await assertTwoFactorNotLocked(user); // kilitliyken satır eklenmez (kilit uzatılamaz)
  const row = await LoginAttempt.create({
    userId: user._id, username: user.username, ip, userAgent, success: false, failReason: 'wrong_2fa',
  });
  const n = await LoginAttempt.countDocuments({
    userId: user._id, success: false, failReason: 'wrong_2fa',
    createdAt: { $gt: new Date(Date.now() - TFA_FAIL_WINDOW_MS) },
  });
  if (n > TFA_FAIL_LIMIT) {
    // Satır SİLİNMEZ: yarışta kaybedenlerin silmesi sayacı limitin altına
    // düşürüp kilidi gevşetirdi. Satır sınırlı (yalnız yarış anındaki eşzamanlılık).
    throw createError(429, 'TOO_MANY_ATTEMPTS', 'Çok fazla doğrulama denemesi. 15 dakika bekleyin.');
  }
  return row._id;
}

// Askıya alınmış, silinmiş veya demo/seed hesap hiçbir kapıdan oturum alamaz.
export function assertAccountCanSession(user) {
  if (!user.isActive || user.deletedAt || user.isSeed) {
    throw createError(403, 'ACCOUNT_BANNED', 'Hesabınız askıya alınmıştır');
  }
}

export async function issueSession(user, { method = 'pwd', verified2fa = false } = {}) {
  assertAccountCanSession(user);
  if (user.twoFactorEnabled && !verified2fa) {
    await assertTwoFactorNotLocked(user);
    return { requires2fa: true, challengeToken: createChallengeToken(user, method) };
  }
  user.tokenVersion = (user.tokenVersion || 0) + 1; // eski token'ları geçersiz kıl
  await user.save();
  invalidateTokenVersionCache(user._id);
  const amr = verified2fa ? [method, 'otp'] : [method];
  return {
    requires2fa: false,
    accessToken: signAccess(user, amr),
    refreshToken: signRefresh(user),
    amr,
  };
}
