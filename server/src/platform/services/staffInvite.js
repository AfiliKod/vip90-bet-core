import crypto from 'node:crypto';
import StaffInvite from '../models/StaffInvite.js';
import StaffAccount from '../../models/StaffAccount.js';
import { createError } from '../../middleware/error.js';

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 12;

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/**
 * Issues a one-time invitation for a staff account. Earlier unused invitations
 * of the same account are revoked. Returns the raw token (shown once).
 */
export async function createStaffInvite(staffId, { createdBy = null, now = new Date() } = {}) {
  await StaffInvite.updateMany({ staffId, usedAt: null }, { $set: { usedAt: now } });
  const token = crypto.randomBytes(32).toString('base64url');
  const invite = await StaffInvite.create({
    staffId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    createdBy,
  });
  return { token, expiresAt: invite.expiresAt };
}

/**
 * Accepts an invitation: sets the password, consumes the token and bumps the
 * token version so earlier sessions end. 2FA enrolment still runs at login.
 */
export async function acceptStaffInvite({ token, password, now = new Date() }) {
  if (!token || typeof token !== 'string') throw createError(400, 'INVITE_INVALID', 'Davet geçersiz');
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw createError(400, 'PASSWORD_TOO_SHORT', `Parola en az ${MIN_PASSWORD_LENGTH} karakter olmalı`);
  }
  const invite = await StaffInvite.findOneAndUpdate(
    { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  );
  if (!invite) throw createError(400, 'INVITE_INVALID', 'Davet geçersiz ya da süresi dolmuş');
  const staff = await StaffAccount.findById(invite.staffId).select('+password');
  if (!staff || staff.status !== 'active') throw createError(400, 'INVITE_INVALID', 'Davet geçersiz');
  staff.password = password;
  staff.tokenVersion = (staff.tokenVersion || 0) + 1;
  await staff.save();
  return { staffId: staff._id, email: staff.email };
}
