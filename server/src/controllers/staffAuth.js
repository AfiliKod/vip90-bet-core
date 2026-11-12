import jwt from 'jsonwebtoken';
import StaffAccount from '../models/StaffAccount.js';
import { createError } from '../middleware/error.js';
import { getTenancyMode } from '../config/tenancy.js';
import { getStaffEffectivePermissions } from '../services/permissions.js';
import {
  setStaffRefreshCookie,
  signStaffAccess,
  signStaffRefresh,
  verifyStaffRefresh,
} from '../services/staffSession.js';
import { createStaffChallengeToken } from './staff2fa.js';

function staffAccessSecret() {
  return process.env.JWT_STAFF_SECRET || process.env.JWT_SECRET;
}

function sessionScope(req) {
  if (req.tenant?.id) return { scopeType: 'tenant', scopeId: req.tenant.id };
  return { scopeType: 'platform', scopeId: null };
}

function createSetupToken(staff) {
  return jwt.sign({
    sub: staff._id,
    typ: 'staff-setup',
    purpose: 'staff-2fa-setup',
    tv: staff.tokenVersion || 0,
  }, staffAccessSecret(), { expiresIn: '5m' });
}

async function issueStaffSession(staff, req, amr = ['pwd']) {
  const { scopeType, scopeId } = sessionScope(req);
  staff.tokenVersion = (staff.tokenVersion || 0) + 1;
  staff.lastLoginAt = new Date();
  staff.lastLoginIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  await staff.save();
  return {
    accessToken: signStaffAccess(staff, { scopeType, scopeId, amr }),
    refreshToken: signStaffRefresh(staff),
    amr,
  };
}

export async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw createError(401, 'INVALID_CREDENTIALS', 'Kullanıcı adı veya şifre hatalı');
    }

    const staff = await StaffAccount.findOne({ username }).select('+password');
    if (!staff || staff.status !== 'active' || !(await staff.comparePassword(password))) {
      throw createError(401, 'INVALID_CREDENTIALS', 'Kullanıcı adı veya şifre hatalı');
    }

    if (staff.twoFactor?.enabled) {
      return res.json({ requires2fa: true, challengeToken: createStaffChallengeToken(staff, 'pwd') });
    }
    if (getTenancyMode() === 'multi') {
      return res.json({ requires2faSetup: true, setupToken: createSetupToken(staff) });
    }

    const session = await issueStaffSession(staff, req);
    setStaffRefreshCookie(res, session.refreshToken);
    return res.json({ accessToken: session.accessToken, staff: staff.toSafeObject(), amr: session.amr });
  } catch (error) { return next(error); }
}

export async function refresh(req, res, next) {
  try {
    const token = req.cookies?.staffRefreshToken;
    if (!token) throw createError(401, 'NO_REFRESH_TOKEN', 'Refresh token bulunamadı');
    const payload = verifyStaffRefresh(token);
    const staff = await StaffAccount.findById(payload.sub);
    if (!staff || staff.status !== 'active' || (staff.tokenVersion || 0) !== (payload.family || 0)) {
      throw createError(401, 'INVALID_REFRESH_TOKEN', 'Geçersiz refresh token');
    }

    const amr = getTenancyMode() === 'multi' || staff.twoFactor?.enabled
      ? ['refresh', 'otp']
      : ['refresh'];
    const session = await issueStaffSession(staff, req, amr);
    setStaffRefreshCookie(res, session.refreshToken);
    return res.json({ accessToken: session.accessToken, staff: staff.toSafeObject(), amr: session.amr });
  } catch {
    return next(createError(401, 'INVALID_REFRESH_TOKEN', 'Geçersiz refresh token'));
  }
}

export async function me(req, res, next) {
  try {
    const staff = await StaffAccount.findById(req.staff?.id);
    if (!staff || staff.status !== 'active') throw createError(401, 'INVALID_STAFF', 'Geçersiz personel hesabı');
    const permissions = await getStaffEffectivePermissions(staff._id, {
      scopeType: req.staff.scope,
      scopeId: req.staff.scopeId,
    });
    return res.json({ staff: staff.toSafeObject(), permissions: [...permissions].sort() });
  } catch (error) { return next(error); }
}

export function logout(req, res) {
  res.clearCookie('staffRefreshToken', { path: '/api/staff/auth' });
  res.json({ message: 'Çıkış yapıldı' });
}
