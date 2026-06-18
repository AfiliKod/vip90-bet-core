import jwt from 'jsonwebtoken';
import { createError } from './error.js';

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next(createError(401, 'UNAUTHORIZED', 'Token gerekli'));
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { next(createError(401, 'INVALID_TOKEN', 'Geçersiz token')); }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return next(createError(403, 'FORBIDDEN', 'Admin yetkisi gerekli'));
  next();
}
