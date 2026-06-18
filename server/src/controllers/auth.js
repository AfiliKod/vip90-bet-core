import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { createError } from '../middleware/error.js';

function signAccess(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

function signRefresh(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export async function register(req, res, next) {
  try {
    const { username, email, password, referredBy } = req.validated;
    if (await User.findOne({ $or: [{ username }, { email }] }))
      return next(createError(409, 'USER_EXISTS', 'Kullanıcı adı veya email zaten kullanımda'));

    let referredById = null;
    if (referredBy) {
      const referrer = await User.findOne({ username: referredBy, deletedAt: null });
      if (referrer) referredById = referrer._id;
    }

    const user = await User.create({ username, email, password, referredBy: referredById });
    const accessToken = signAccess(user);
    setRefreshCookie(res, signRefresh(user));
    res.status(201).json({ accessToken, user: user.toSafeObject() });
  } catch (e) { next(e); }
}

export async function login(req, res, next) {
  try {
    const { username, password } = req.validated;
    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password)))
      return next(createError(401, 'INVALID_CREDENTIALS', 'Kullanıcı adı veya şifre hatalı'));
    if (!user.isActive)
      return next(createError(403, 'ACCOUNT_BANNED', 'Hesabınız askıya alınmıştır'));
    const accessToken = signAccess(user);
    setRefreshCookie(res, signRefresh(user));
    res.json({ accessToken, user: user.toSafeObject() });
  } catch (e) { next(e); }
}

export async function refresh(req, res, next) {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return next(createError(401, 'NO_REFRESH_TOKEN', 'Refresh token bulunamadı'));
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return next(createError(401, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı'));
    const accessToken = signAccess(user);
    setRefreshCookie(res, signRefresh(user));
    res.json({ accessToken, user: user.toSafeObject() });
  } catch { next(createError(401, 'INVALID_REFRESH_TOKEN', 'Geçersiz refresh token')); }
}

export function logout(req, res) {
  res.clearCookie('refreshToken');
  res.json({ message: 'Çıkış yapıldı' });
}
