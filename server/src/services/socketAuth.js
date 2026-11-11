import jwt from 'jsonwebtoken';
import { getAuthState } from '../middleware/auth.js';

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
  if (!payload || payload.purpose || !payload.id) return null;
  try {
    const state = await getAuthState(payload.id);
    if (state.isSeed || state.revoked) return null;
    if ((payload.tokenVersion ?? 0) !== state.version) return null;
  } catch {
    return null;
  }
  return payload;
}

/** socket.io namespace middleware: kimliği doğrular, socket.user atar. */
export async function socketAuthMiddleware(socket, next) {
  const payload = await verifySocketUser(socket.handshake.auth?.token);
  if (!payload) return next(new Error('auth'));
  socket.user = payload;
  next();
}
