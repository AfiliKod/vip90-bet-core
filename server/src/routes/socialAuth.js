import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { guestOnly } from '../middleware/guestOnly.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { linkGoogleSchema, linkTelegramSchema } from '../validators/auth.js';
import {
  getGoogleAuthUrl, handleGoogleCallback, linkGoogleAccount, unlinkGoogleAccount,
  getTelegramAuthUrl, handleTelegramCallback, linkTelegramAccount, unlinkTelegramAccount,
  getUserSocialAccounts, setOAuthState, isGoogleConfigured,
} from '../services/socialAuth.js';
import { setRefreshCookie } from '../controllers/auth.js';

const r = Router();
const testMode = process.env.NODE_ENV === 'test' || process.env.E2E_TEST === 'true';
const conditionalAuthLimiter = testMode ? (req, res, next) => next() : authLimiter;
// DÜZELTME: CLIENT_URL, app.js'teki CORS origin listesi için virgülle
// ayrılmış birden fazla değer taşıyabiliyor (bkz. utils/origins.js) — tek
// bir redirect hedefi olarak kullanılamaz. İlk origin "birincil" frontend
// adresi olarak alınıyor.
const CLIENT_URL = (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim();
// OAuth redirect akışında sunucu accessToken'ı callback URL'sine ekleyip
// tarayıcıyı client'a yönlendirir; client (/auth/callback) token'ı alıp
// authStore'a yazar, ardından zenginleştirilmiş kullanıcı nesnesi normal
// /auth/refresh akışıyla (authStore.init()) gelir — burada tekrar
// hesaplamaya gerek yok, yalnızca refresh cookie set edilir.

// ── Google ──────────────────────────────────────────────────────────
// Giriş ekranı Google butonunu yalnız yapılandırılmışsa gösterir.
r.get('/google/state', async (req, res, next) => {
  try {
    res.json({ enabled: await isGoogleConfigured() });
  } catch (e) { next(e); }
});

r.get('/google', guestOnly, conditionalAuthLimiter, async (req, res, next) => {
  try {
    if (!(await isGoogleConfigured())) return res.redirect(`${CLIENT_URL}/auth/callback?error=google_not_configured`);
    res.redirect(await getGoogleAuthUrl());
  } catch (e) { next(e); }
});

r.get('/google/callback', async (req, res, next) => {
  try {
    const parsed = linkGoogleSchema.safeParse(req.query);
    if (!parsed.success) return res.redirect(`${CLIENT_URL}/auth/callback?error=invalid_request`);
    const { code, state } = parsed.data;
    const { accessToken, refreshToken } = await handleGoogleCallback(code, state);
    setRefreshCookie(res, refreshToken);
    res.redirect(`${CLIENT_URL}/auth/callback?token=${accessToken}`);
  } catch (e) {
    res.redirect(`${CLIENT_URL}/auth/callback?error=${e.code || 'oauth_failed'}`);
  }
});

r.post('/google/link', requireAuth, async (req, res, next) => {
  try {
    if (!(await isGoogleConfigured())) {
      return res.status(400).json({ error: { code: 'GOOGLE_NOT_CONFIGURED', message: 'Google ile giriş yapılandırılmamış' } });
    }
    res.json({ url: await getGoogleAuthUrl(req.user.id) });
  } catch (e) { next(e); }
});

r.get('/google/link/callback', requireAuth, async (req, res, next) => {
  try {
    const parsed = linkGoogleSchema.safeParse(req.query);
    if (!parsed.success) return res.redirect(`${CLIENT_URL}/profile?error=invalid_request`);
    const { code, state } = parsed.data;
    await linkGoogleAccount(req.user.id, code, state);
    res.redirect(`${CLIENT_URL}/profile?linked=google`);
  } catch (e) {
    res.redirect(`${CLIENT_URL}/profile?error=${e.code || 'link_failed'}`);
  }
});

r.delete('/google', requireAuth, async (req, res, next) => {
  try {
    const user = await unlinkGoogleAccount(req.user.id);
    res.json({ user });
  } catch (e) { next(e); }
});

// ── Telegram ────────────────────────────────────────────────────────
r.get('/telegram', guestOnly, conditionalAuthLimiter, (req, res) => {
  res.redirect(getTelegramAuthUrl());
});

// Telegram Login Widget'ın data-auth-url modu kendi state parametresi
// eklemiyor — client, widget'ı render etmeden önce buradan taze bir state
// alıp callback URL'sine kendisi ekler (bkz. LoginTelegramButton.jsx).
r.get('/telegram/widget-state', conditionalAuthLimiter, (req, res) => {
  res.json({ state: setOAuthState('telegram'), botUsername: process.env.TELEGRAM_BOT_USERNAME || null });
});

r.get('/telegram/callback', async (req, res, next) => {
  try {
    const parsed = linkTelegramSchema.safeParse(req.query);
    if (!parsed.success) return res.redirect(`${CLIENT_URL}/auth/callback?error=invalid_request`);
    const { state, ...telegramParams } = parsed.data;
    const { accessToken, refreshToken } = await handleTelegramCallback(telegramParams, state);
    setRefreshCookie(res, refreshToken);
    res.redirect(`${CLIENT_URL}/auth/callback?token=${accessToken}`);
  } catch (e) {
    res.redirect(`${CLIENT_URL}/auth/callback?error=${e.code || 'oauth_failed'}`);
  }
});

r.post('/telegram/link', requireAuth, (req, res) => {
  res.json({ url: getTelegramAuthUrl(req.user.id) });
});

r.get('/telegram/link/callback', requireAuth, async (req, res, next) => {
  try {
    const parsed = linkTelegramSchema.safeParse(req.query);
    if (!parsed.success) return res.redirect(`${CLIENT_URL}/profile?error=invalid_request`);
    const { state, ...telegramParams } = parsed.data;
    await linkTelegramAccount(req.user.id, telegramParams, state);
    res.redirect(`${CLIENT_URL}/profile?linked=telegram`);
  } catch (e) {
    res.redirect(`${CLIENT_URL}/profile?error=${e.code || 'link_failed'}`);
  }
});

r.delete('/telegram', requireAuth, async (req, res, next) => {
  try {
    const user = await unlinkTelegramAccount(req.user.id);
    res.json({ user });
  } catch (e) { next(e); }
});

// ── Ortak ───────────────────────────────────────────────────────────
r.get('/accounts', requireAuth, async (req, res, next) => {
  try {
    const accounts = await getUserSocialAccounts(req.user.id);
    res.json({ accounts });
  } catch (e) { next(e); }
});

export default r;
