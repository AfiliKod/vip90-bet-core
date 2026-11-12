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
import { setRefreshCookie } from '../services/session.js';
import { getTenantBaseUrl } from '../tenancy/tenantBaseUrl.js';

const r = Router();
const testMode = process.env.NODE_ENV === 'test' || process.env.E2E_TEST === 'true';
const conditionalAuthLimiter = testMode ? (req, res, next) => next() : authLimiter;
// OAuth redirect akışında sunucu accessToken'ı callback URL'sine ekleyip
// tarayıcıyı client'a yönlendirir; client (/auth/callback) token'ı alıp
// authStore'a yazar, ardından zenginleştirilmiş kullanıcı nesnesi normal
// /auth/refresh akışıyla (authStore.init()) gelir — burada tekrar
// hesaplamaya gerek yok, yalnızca refresh cookie set edilir.

// 2FA'lı hesap: challenge URL FRAGMENT'inde taşınır (#challenge=...). Fragment
// sunucuya/proxy log'larına/Referer'a gitmez; query'de taşınmaz. Challenge 5 dk
// ömürlü, tek kullanımlık ve oturum değildir (requireAuth reddeder).
async function redirectToTwoFactor(res, challengeToken) {
  const base = await getTenantBaseUrl();
  res.redirect(`${base}/auth/callback?requires2fa=1#challenge=${encodeURIComponent(challengeToken)}`);
}

// ── Google ──────────────────────────────────────────────────────────
// Giriş ekranı Google butonunu yalnız yapılandırılmışsa gösterir.
r.get('/google/state', async (req, res, next) => {
  try {
    res.json({ enabled: await isGoogleConfigured() });
  } catch (e) { next(e); }
});

r.get('/google', guestOnly, conditionalAuthLimiter, async (req, res, next) => {
  try {
    if (!(await isGoogleConfigured())) return res.redirect(`${await getTenantBaseUrl()}/auth/callback?error=google_not_configured`);
    res.redirect(await getGoogleAuthUrl());
  } catch (e) { next(e); }
});

r.get('/google/callback', async (req, res, next) => {
  try {
    const parsed = linkGoogleSchema.safeParse(req.query);
    if (!parsed.success) return res.redirect(`${await getTenantBaseUrl()}/auth/callback?error=invalid_request`);
    const { code, state } = parsed.data;
    const session = await handleGoogleCallback(code, state);
    if (session.requires2fa) return await redirectToTwoFactor(res, session.challengeToken);
    const { accessToken, refreshToken } = session;
    setRefreshCookie(res, refreshToken);
    res.redirect(`${await getTenantBaseUrl()}/auth/callback?token=${accessToken}`);
  } catch (e) {
    const error = e.code === 'GOOGLE_LINK_REQUIRED' ? 'google_link_required'
      : e.code === 'GOOGLE_EMAIL_UNVERIFIED' ? 'google_email_unverified'
      : (e.code || 'oauth_failed');
    res.redirect(`${await getTenantBaseUrl()}/auth/callback?error=${error}`);
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
    if (!parsed.success) return res.redirect(`${await getTenantBaseUrl()}/profile?error=invalid_request`);
    const { code, state } = parsed.data;
    await linkGoogleAccount(req.user.id, code, state);
    res.redirect(`${await getTenantBaseUrl()}/profile?linked=google`);
  } catch (e) {
    res.redirect(`${await getTenantBaseUrl()}/profile?error=${e.code || 'link_failed'}`);
  }
});

r.delete('/google', requireAuth, async (req, res, next) => {
  try {
    const user = await unlinkGoogleAccount(req.user.id);
    res.json({ user });
  } catch (e) { next(e); }
});

// ── Telegram ────────────────────────────────────────────────────────
r.get('/telegram', guestOnly, conditionalAuthLimiter, async (req, res, next) => {
  try {
    res.redirect(getTelegramAuthUrl(null, await getTenantBaseUrl()));
  } catch (e) { next(e); }
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
    if (!parsed.success) return res.redirect(`${await getTenantBaseUrl()}/auth/callback?error=invalid_request`);
    const { state, ...telegramParams } = parsed.data;
    const session = await handleTelegramCallback(telegramParams, state);
    if (session.requires2fa) return await redirectToTwoFactor(res, session.challengeToken);
    const { accessToken, refreshToken } = session;
    setRefreshCookie(res, refreshToken);
    res.redirect(`${await getTenantBaseUrl()}/auth/callback?token=${accessToken}`);
  } catch (e) {
    res.redirect(`${await getTenantBaseUrl()}/auth/callback?error=${e.code || 'oauth_failed'}`);
  }
});

r.post('/telegram/link', requireAuth, async (req, res, next) => {
  try {
    res.json({ url: getTelegramAuthUrl(req.user.id, await getTenantBaseUrl()) });
  } catch (e) { next(e); }
});

r.get('/telegram/link/callback', requireAuth, async (req, res, next) => {
  try {
    const parsed = linkTelegramSchema.safeParse(req.query);
    if (!parsed.success) return res.redirect(`${await getTenantBaseUrl()}/profile?error=invalid_request`);
    const { state, ...telegramParams } = parsed.data;
    await linkTelegramAccount(req.user.id, telegramParams, state);
    res.redirect(`${await getTenantBaseUrl()}/profile?linked=telegram`);
  } catch (e) {
    res.redirect(`${await getTenantBaseUrl()}/profile?error=${e.code || 'link_failed'}`);
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
