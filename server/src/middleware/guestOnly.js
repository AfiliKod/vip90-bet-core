import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { createError } from './error.js';

/**
 * Misafir akışları (giriş, kayıt, şifre sıfırlama) için oturum tespiti.
 *
 * Access token'ın imzası/süresi yeterli kanıttır. Refresh cookie için ek olarak
 * tokenVersion DB'den doğrulanır: iptal edilmiş bir cookie taşıyan kullanıcı
 * aksi halde tekrar giriş yapamaz duruma düşerdi.
 */
export async function detectSession(req, { verifyAccess, verifyRefresh, findUser }) {
  const bearer = req.headers?.authorization?.split(' ')[1];
  if (bearer) {
    try {
      verifyAccess(bearer);
      return true;
    } catch {}
  }

  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    const payload = (() => { try { return verifyRefresh(refreshToken); } catch { return null; } })();
    if (payload) {
      const user = await findUser(payload.id);
      if (user && (payload.family === undefined || user.tokenVersion === payload.family)) return true;
    }
  }

  return false;
}

/** Test edilebilirlik için bağımlılıkları dışarıdan alan fabrika. */
export function makeGuestOnly(deps) {
  return async function guestOnlyMiddleware(req, res, next) {
    let active;
    try {
      active = await detectSession(req, deps);
    } catch (e) {
      // Oturum tespiti kendi başına bir yetkilendirme değil; patlarsa akışı kesme.
      console.error('guestOnly session detection failed:', e.message);
      return next();
    }
    if (active) {
      return next(createError(403, 'ALREADY_AUTHENTICATED',
        'Bu işlem için önce oturumunuzu kapatmanız gerekiyor'));
    }
    next();
  };
}

/** Aktif oturumu olan isteği misafir uçlarına sokmayan middleware. */
export const guestOnly = makeGuestOnly({
  verifyAccess: token => jwt.verify(token, process.env.JWT_SECRET),
  verifyRefresh: token => jwt.verify(token, process.env.JWT_REFRESH_SECRET),
  findUser: id => User.findById(id).select('tokenVersion'),
});
