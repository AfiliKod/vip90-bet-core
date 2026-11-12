import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import qrcode from 'qrcode';
import speakeasy from 'speakeasy';
import StaffAccount from '../models/StaffAccount.js';
import { createError } from '../middleware/error.js';
import { decryptSensitive, encryptSensitive } from '../utils/secretCrypto.js';

const CHALLENGE_TTL = '5m';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGE_ATTEMPTS = 5;
const challengeState = new Map();

function staffChallengeKey() {
  return crypto.createHash('sha256')
    .update(`${process.env.JWT_STAFF_SECRET}:staff-2fa-challenge`)
    .digest();
}

function cleanCode(code) {
  return String(code ?? '').replace(/\s/g, '');
}

function hashBackupCode(code) {
  return crypto.createHash('sha256').update(cleanCode(code)).digest('hex');
}

function codesMatch(left, right) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sweepChallenges() {
  const now = Date.now();
  for (const [jti, challenge] of challengeState) {
    if (challenge.expiresAt <= now) challengeState.delete(jti);
  }
}

function getChallenge(jti) {
  return challengeState.get(jti);
}

function assertUsableChallenge(payload) {
  const challenge = getChallenge(payload.jti);
  if (!challenge || challenge.staffId !== String(payload.sub)) {
    throw createError(401, 'INVALID_CHALLENGE', 'Geçersiz doğrulama anahtarı');
  }
  if (challenge.attempts >= MAX_CHALLENGE_ATTEMPTS) {
    challenge.used = true;
    throw createError(429, 'TOO_MANY_ATTEMPTS', 'Çok fazla doğrulama denemesi');
  }
  if (challenge.used || challenge.inFlight) {
    throw createError(401, 'CHALLENGE_USED', 'Doğrulama anahtarı kullanılmış');
  }
  challenge.inFlight = true;
  challenge.attempts += 1;
  return challenge;
}

function recordChallengeFailure(challenge) {
  if (challenge.attempts >= MAX_CHALLENGE_ATTEMPTS) challenge.used = true;
}

function requestStaffId(req) {
  const staffId = req.staff?.id;
  if (!staffId) throw createError(401, 'UNAUTHORIZED', 'Personel kimliği gerekli');
  return staffId;
}

/** Generate a staff TOTP secret and a standards-compatible OTPAuth URI. */
export function generateStaffSecret(staff) {
  const secret = speakeasy.generateSecret({ length: 32 }).base32;
  const label = `VIP90-Staff:${staff.email}`;
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=VIP90-Platform`;
  return { secret, otpauthUrl };
}

/** Confirm a newly generated TOTP secret and persist its encrypted form. */
export async function confirmStaff2fa(staffId, { secret, token }) {
  const normalizedSecret = String(secret ?? '');
  const normalizedToken = cleanCode(token);
  if (!normalizedSecret || !normalizedToken
    || !speakeasy.totp.verify({ secret: normalizedSecret, encoding: 'base32', token: normalizedToken, window: 1 })) {
    throw createError(401, 'INVALID_2FA', 'Doğrulama kodu hatalı');
  }

  const staff = await StaffAccount.findById(staffId).select('+twoFactor.secretEnc +twoFactor.backupCodesHash');
  if (!staff || staff.status !== 'active') {
    throw createError(401, 'INVALID_STAFF', 'Geçersiz personel hesabı');
  }

  const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(8).toString('hex'));
  staff.twoFactor = {
    enabled: true,
    secretEnc: encryptSensitive(normalizedSecret),
    backupCodesHash: backupCodes.map(hashBackupCode),
  };
  await staff.save();

  return { backupCodes };
}

/**
 * Create a short-lived, single-use token for the second half of staff login.
 * It deliberately uses a derived key, so it can never be accepted as a staff
 * access token even by an endpoint that verifies JWT_STAFF_SECRET directly.
 */
export function createStaffChallengeToken(staffAccount, method) {
  sweepChallenges();
  const jti = crypto.randomUUID();
  challengeState.set(jti, {
    staffId: String(staffAccount._id),
    attempts: 0,
    used: false,
    inFlight: false,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return jwt.sign({
    sub: String(staffAccount._id),
    typ: 'staff-challenge',
    purpose: 'staff-2fa',
    tv: staffAccount.tokenVersion || 0,
    method,
    jti,
  }, staffChallengeKey(), { expiresIn: CHALLENGE_TTL });
}

/** Verify a staff login challenge using a TOTP or an unused backup code. */
export async function verifyStaffChallenge(challengeToken, code) {
  sweepChallenges();
  let payload;
  try {
    payload = jwt.verify(challengeToken, staffChallengeKey());
  } catch {
    throw createError(401, 'INVALID_CHALLENGE', 'Geçersiz doğrulama anahtarı');
  }
  if (payload.typ !== 'staff-challenge' || payload.purpose !== 'staff-2fa' || !payload.sub || !payload.jti) {
    throw createError(401, 'INVALID_CHALLENGE', 'Geçersiz doğrulama anahtarı');
  }

  const challenge = assertUsableChallenge(payload);
  try {
    const staff = await StaffAccount.findById(payload.sub)
      .select('+twoFactor.secretEnc +twoFactor.backupCodesHash');
    if (!staff || staff.status !== 'active' || !staff.twoFactor?.enabled
      || (staff.tokenVersion || 0) !== (payload.tv || 0)) {
      challenge.used = true;
      throw createError(401, 'INVALID_CHALLENGE', 'Geçersiz doğrulama anahtarı');
    }

    const normalizedCode = cleanCode(code);
    const secret = decryptSensitive(staff.twoFactor.secretEnc);
    const validTotp = secret && speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: normalizedCode,
      window: 1,
    });

    if (!validTotp) {
      const suppliedHash = hashBackupCode(normalizedCode);
      const storedHash = staff.twoFactor.backupCodesHash.find((hash) => codesMatch(hash, suppliedHash));
      if (!storedHash) {
        recordChallengeFailure(challenge);
        throw createError(401, 'INVALID_2FA', 'Doğrulama kodu hatalı');
      }

      // Conditional removal prevents the same backup code from satisfying two
      // concurrently issued challenges.
      const update = await StaffAccount.updateOne(
        { _id: staff._id, 'twoFactor.backupCodesHash': storedHash },
        { $pull: { 'twoFactor.backupCodesHash': storedHash } },
      );
      if (update.modifiedCount !== 1) {
        recordChallengeFailure(challenge);
        throw createError(401, 'INVALID_2FA', 'Doğrulama kodu hatalı');
      }
    }

    challenge.used = true;
    return { staff, amr: ['pwd', 'otp'] };
  } finally {
    challenge.inFlight = false;
  }
}

export async function setup2fa(req, res, next) {
  try {
    const staff = await StaffAccount.findById(requestStaffId(req));
    if (!staff || staff.status !== 'active') throw createError(401, 'INVALID_STAFF', 'Geçersiz personel hesabı');
    if (staff.twoFactor?.enabled) throw createError(400, 'ALREADY_ENABLED', '2FA zaten aktif');

    const { secret, otpauthUrl } = generateStaffSecret(staff);
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);
    res.json({ secret, otpauthUrl, qrDataUrl });
  } catch (error) { next(error); }
}

export async function confirm2fa(req, res, next) {
  try {
    const { backupCodes } = await confirmStaff2fa(requestStaffId(req), req.body || {});
    res.json({ enabled: true, backupCodes });
  } catch (error) { next(error); }
}

export async function challengeVerify(req, res, next) {
  try {
    const { challengeToken, code } = req.body || {};
    const { staff, amr } = await verifyStaffChallenge(challengeToken, code);
    res.json({ staff: staff.toSafeObject(), amr });
  } catch (error) { next(error); }
}
