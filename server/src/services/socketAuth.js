import jwt from 'jsonwebtoken';
import { getAuthState } from '../middleware/auth.js';
import { getTenancyMode } from '../config/tenancy.js';
import { getStaffAuthState, verifyStaffAccess } from './staffSession.js';
import StaffAccount from '../models/StaffAccount.js';

function playerPayloadIsValid(payload) {
  if (!payload || payload.purpose || !payload.id) return false;
  if (payload.aud === 'staff' || payload.aud === 'staff-refresh') return false;
  if (getTenancyMode() !== 'multi') return true;
  return payload.aud === 'player' && payload.typ === 'player' && !!payload.sub && !!payload.tid;
}

function handshakeTenantId(socket) {
  return socket.request?.tenant?.id
    ?? socket.handshake?.auth?.tenantId
    ?? socket.handshake?.query?.tenantId
    ?? null;
}

function matchesHandshakeTenant(payload, tenantId) {
  if (!tenantId) return true;
  if (payload.typ === 'staff') {
    return payload.scp !== 'tenant' || String(payload.sid) === String(tenantId);
  }
  return !payload.tid || String(payload.tid) === String(tenantId);
}

/**
 * Tüm socket el sıkışmaları (ana namespace subscribe:*, /live, /chat) için tek
 * doğrulayıcı. requireAuth ile aynı kuralları uygular: geçerli imza, `purpose`
 * taşımayan (2FA challenge değil), seed olmayan ve tokenVersion'ı DB ile
 * eşleşen token. Aksi halde null.
 */
export async function verifySocketUser(token) {
  if (typeof token !== 'string' || !token) return null;
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch { return null; }
  if (!playerPayloadIsValid(payload)) return null;
  try {
    const state = await getAuthState(payload.id);
    if (state.isSeed || state.revoked) return null;
    if ((payload.tokenVersion ?? 0) !== state.version) return null;
  } catch {
    return null;
  }
  return payload;
}

export async function verifySocketStaff(token) {
  if (typeof token !== 'string' || !token) return null;
  let payload;
  try { payload = verifyStaffAccess(token); } catch { return null; }
  if (payload.aud !== 'staff' || payload.typ !== 'staff' || !payload.sub) return null;
  try {
    const state = await getStaffAuthState(payload.sub);
    if (state.revoked || (payload.tv ?? 0) !== state.version) return null;
    const hasOtp = Array.isArray(payload.amr) && payload.amr.includes('otp');
    if (getTenancyMode() === 'multi') return hasOtp ? payload : null;
    const staff = await StaffAccount.findById(payload.sub).select('twoFactor.enabled').lean();
    if (staff?.twoFactor?.enabled && !hasOtp) return null;
  } catch {
    return null;
  }
  return payload;
}

function attachSocketActor(socket, payload) {
  const tenantId = handshakeTenantId(socket)
    ?? (payload.typ === 'staff' && payload.scp === 'tenant' ? payload.sid : payload.tid ?? null);
  if (!matchesHandshakeTenant(payload, tenantId)) return false;
  socket.data = {
    tenantId: tenantId === null ? null : String(tenantId),
    actor: {
      kind: payload.typ === 'staff' ? 'staff' : 'player',
      id: payload.sub ?? payload.id,
      scope: payload.typ === 'staff' ? payload.scp : null,
    },
  };
  return true;
}

/** Player socket namespace middleware: staff tokens are never accepted here. */
export async function socketAuthMiddleware(socket, next) {
  const payload = await verifySocketUser(socket.handshake.auth?.token);
  if (!payload || !attachSocketActor(socket, payload)) return next(new Error('auth'));
  socket.user = payload;
  return next();
}

/** Staff socket namespace middleware for staff-only realtime endpoints. */
export async function staffSocketAuthMiddleware(socket, next) {
  const payload = await verifySocketStaff(socket.handshake.auth?.token);
  if (!payload || !attachSocketActor(socket, payload)) return next(new Error('auth'));
  socket.staff = payload;
  return next();
}
