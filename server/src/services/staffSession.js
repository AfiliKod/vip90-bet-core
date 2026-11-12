import jwt from 'jsonwebtoken';
import StaffAccount from '../models/StaffAccount.js';

const STAFF_AUTH_CACHE_TTL = 30_000;
const staffAuthCache = new Map();

function staffAccessSecret() {
  return process.env.JWT_STAFF_SECRET || process.env.JWT_SECRET;
}

function staffRefreshSecret() {
  return process.env.JWT_STAFF_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET || process.env.JWT_STAFF_SECRET;
}

export function signStaffAccess(staffAccount, { scopeType, scopeId = null, amr = ['pwd'] }) {
  return jwt.sign(
    {
      sub: staffAccount._id,
      typ: 'staff',
      scp: scopeType,
      sid: scopeId,
      tv: staffAccount.tokenVersion || 0,
      aud: 'staff',
      amr,
    },
    staffAccessSecret(),
    { expiresIn: '15m' }
  );
}

export function signStaffRefresh(staffAccount) {
  return jwt.sign(
    {
      sub: staffAccount._id,
      typ: 'staff',
      family: staffAccount.tokenVersion || 0,
      aud: 'staff-refresh',
    },
    staffRefreshSecret(),
    { expiresIn: '7d' }
  );
}

export function verifyStaffAccess(token) {
  return jwt.verify(token, staffAccessSecret(), { audience: 'staff' });
}

export function verifyStaffRefresh(token) {
  return jwt.verify(token, staffRefreshSecret(), { audience: 'staff-refresh' });
}

export function setStaffRefreshCookie(res, token) {
  res.cookie('staffRefreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/staff/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export async function invalidateStaffTokens(staffId) {
  await StaffAccount.findByIdAndUpdate(staffId, { $inc: { tokenVersion: 1 } });
  staffAuthCache.delete(String(staffId));
}

export async function getStaffAuthState(staffId) {
  const cacheKey = String(staffId);
  const cached = staffAuthCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < STAFF_AUTH_CACHE_TTL) {
    return { version: cached.version, revoked: cached.revoked };
  }

  const staff = await StaffAccount.findById(staffId).select('tokenVersion status').lean();
  const state = {
    version: staff?.tokenVersion ?? 0,
    revoked: !staff || staff.status !== 'active',
    ts: Date.now(),
  };
  staffAuthCache.set(cacheKey, state);
  return { version: state.version, revoked: state.revoked };
}
