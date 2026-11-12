import crypto from 'crypto';
import User from '../models/User.js';
import { createError } from '../middleware/error.js';
import { issueSession } from './session.js';
import { getGoogleAuthSettings } from '../config/googleAuthConfig.js';
import { createProviderUser, providerUsernameCandidates } from './providerUsername.js';
import { clientUrlFallback } from '../tenancy/tenantBaseUrl.js';
import { getCurrentTenantId } from '../tenancy/context.js';

/**
 * Telegram OAuth configuration — DÜZELTME: önceden aynı TELEGRAM_BOT_TOKEN
 * env değişkeni admin bildirim botuyla (services/alert.js) çakışıyordu; bu
 * ikisi farklı Telegram botları olmalı (Login Widget bir domain'e kayıtlı
 * olmak zorunda, bildirim botu değil) — ayrı bir isim kullanılıyor.
 */
const TELEGRAM_LOGIN_BOT_TOKEN = process.env.TELEGRAM_LOGIN_BOT_TOKEN;
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME;

/**
 * Google girişi, Modules → Google Login kartındaki anahtar açık ve istemci
 * kimliği + sırrı (panel ya da .env) tanımlıysa kullanılabilir. Giriş ekranı
 * butonu buna göre gösterir; tanımsızken Google "OAuth client was not found"
 * hatası veriyordu.
 */
export async function isGoogleConfigured() {
  return (await getGoogleAuthSettings()).active;
}

/**
 * Generate state parameter for OAuth
 */
function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Store OAuth state with TTL
 */
const oauthStateStore = new Map(); // state -> { provider, userId, tenantId, expiresAt }

// İP-6 (spec §8.4): state, üretildiği isteğin kiracısını taşır; callback başka
// bir kiracının alan adına gelirse state geçersiz sayılır. Tek kiracılı kurulumda
// iki taraf da aynı (varsayılan ya da boş) kiracıdır, davranış değişmez.
function tenantKeyOf(tenantId) {
  return tenantId == null ? '' : String(tenantId);
}

export function setOAuthState(provider, userId = null) {
  const state = generateState();
  oauthStateStore.set(state, {
    provider,
    userId,
    tenantId: tenantKeyOf(getCurrentTenantId()),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });
  return state;
}

export function getOAuthState(state) {
  const entry = oauthStateStore.get(state);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    oauthStateStore.delete(state);
    return null;
  }
  return entry;
}

export function consumeOAuthState(state) {
  const entry = oauthStateStore.get(state);
  if (entry) oauthStateStore.delete(state);
  if (entry && entry.tenantId !== tenantKeyOf(getCurrentTenantId())) return null;
  return entry;
}

/**
 * Google OAuth: Get authorization URL
 */
export async function getGoogleAuthUrl(userId = null) {
  const { clientId, redirectUri } = await getGoogleAuthSettings();
  const state = setOAuthState('google', userId);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Google OAuth: Exchange code for tokens
 */
export async function exchangeGoogleCode(code) {
  const { clientId, clientSecret, redirectUri } = await getGoogleAuthSettings();
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Google token exchange failed: ${error.error_description || error.error}`);
  }

  return response.json();
}

/**
 * Google OAuth: Get user info from access token
 */
export async function getGoogleUserInfo(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Google user info');
  }

  const data = await response.json();
  // V14: Google'ın doğrulamadığı e-posta ile giriş/bağlama yapılmaz.
  const verified = data.verified_email === true || data.email_verified === true;
  if (!verified) throw createError(403, 'GOOGLE_EMAIL_UNVERIFIED', 'Google e-posta adresi doğrulanmamış');
  // v2 userinfo kimliği `id` olarak döner (OIDC'de `sub`); ikisini de `sub`a
  // normalleştir. Kimlik yoksa asla undefined googleId ile sorgu/kayıt yapma.
  const rawId = data.sub ?? data.id;
  if (rawId === undefined || rawId === null || String(rawId) === '') {
    throw createError(502, 'GOOGLE_PROFILE_INVALID', 'Google profilinde kimlik yok');
  }
  return { ...data, sub: String(rawId), verified_email: true };
}

/**
 * Telegram OAuth: Generate login widget URL
 */
export function getTelegramAuthUrl(userId = null, origin = clientUrlFallback()) {
  const state = setOAuthState('telegram', userId);
  const params = new URLSearchParams({
    // Callers pass the tenant's primary-domain origin (getTenantBaseUrl);
    // the default keeps the single-mode CLIENT_URL behaviour.
    origin,
    bot_id: TELEGRAM_LOGIN_BOT_TOKEN?.split(':')[0] || '',
    request_access: 'write',
    state,
  });
  return `https://oauth.telegram.org/auth?${params.toString()}`;
}

/**
 * Telegram OAuth: Verify widget data
 * https://core.telegram.org/widgets/login
 */
export function verifyTelegramWidgetData(queryParams, botToken) {
  if (!queryParams || typeof botToken !== 'string' || !botToken) return false;
  const { hash, ...data } = queryParams;
  // F1: eksik/yanlış tipte hash'i erken reddet; karşılaştırma sabit zamanlı.
  if (typeof hash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hash)) return false;

  // Create data-check-string
  const dataCheckString = Object.keys(data)
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('\n');

  // Generate secret key from bot token
  const secretKey = crypto.createHash('sha256').update(botToken).digest();

  // Calculate HMAC
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  const given = Buffer.from(hash, 'hex');
  return given.length === hmac.length && crypto.timingSafeEqual(given, hmac);
}

const TELEGRAM_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TELEGRAM_MAX_FUTURE_MS = 5 * 60 * 1000;

/** F1: auth_date sayısal olmalı, 24 saatten eski veya 5 dk'dan ileri olamaz. */
function assertTelegramAuthDate(queryParams) {
  const raw = String(queryParams?.auth_date ?? '');
  if (!/^\d{1,12}$/.test(raw)) {
    throw createError(400, 'INVALID_TELEGRAM_DATA', 'Telegram verisi doğrulanamadı');
  }
  const diff = Date.now() - Number(raw) * 1000;
  if (diff > TELEGRAM_MAX_AGE_MS) {
    throw createError(400, 'EXPIRED_TELEGRAM_AUTH', 'Telegram yetkilendirmesi süresi dolmuş');
  }
  if (diff < -TELEGRAM_MAX_FUTURE_MS) {
    throw createError(400, 'INVALID_TELEGRAM_DATA', 'Telegram verisi doğrulanamadı');
  }
}

/**
 * Telegram OAuth: Get user info from widget data
 */
export function getTelegramUserInfo(queryParams) {
  return {
    id: queryParams.id,
    first_name: queryParams.first_name,
    last_name: queryParams.last_name,
    username: queryParams.username,
    photo_url: queryParams.photo_url,
    auth_date: parseInt(queryParams.auth_date),
  };
}

/**
 * Find or create user from Google profile
 */
export async function findOrCreateGoogleUser(profile, options = {}) {
  const { session = null } = options;
  if (!profile || typeof profile.sub !== 'string' || !profile.sub) {
    throw createError(502, 'GOOGLE_PROFILE_INVALID', 'Google profilinde kimlik yok');
  }
  
  const email = profile.email.toLowerCase();
  
  // V14: önce googleId ile ara — bağlı hesabın yerel e-postası Google
  // e-postasından farklı olabilir; e-postayla aramak yeni hesap açmaya
  // (googleId unique ihlali) götürürdü.
  const linked = await User.findOne({ googleId: profile.sub }).session(session);
  if (linked) return linked;

  // Try to find existing user by email
  let user = await User.findOne({ email }).session(session);
  
  if (!user) {
    // F1: the base name may be taken (a local account, or another Google
    // identity with the same sub prefix): bounded candidates like Telegram's.
    const { user: created } = await createProviderUser(
      providerUsernameCandidates(`google_${profile.sub.slice(0, 10)}`, profile.sub),
      (username) => ({
        username,
        email,
        password: crypto.randomBytes(32).toString('hex'),
        googleId: profile.sub,
        googleEmail: email,
        googleName: profile.name,
        googlePicture: profile.picture,
        emailVerified: profile.verified_email === true,
      }),
      {
        session,
        // Concurrent first login with the same Google account: the winner.
        findWinner: (e) => (e?.keyPattern?.googleId || e?.keyPattern?.email ? User.findOne({ googleId: profile.sub }) : null),
      },
    );
    user = created;
  } else {
    // V14: zaten bu Google hesabına bağlıysa girer (emailVerified fark etmez).
    // Bağlı olmayan yerel hesap yalnız iki taraf da e-postayı doğruladıysa
    // otomatik bağlanır; aksi halde şifreyle girip profilden bağlanmalı.
    if (user.googleId && user.googleId === profile.sub) {
      return user;
    }
    if (user.googleId || !(profile.verified_email === true && user.emailVerified === true)) {
      throw createError(409, 'GOOGLE_LINK_REQUIRED', 'Google hesabını bağlamak için önce şifreyle giriş yapın');
    }
    user.googleId = profile.sub;
    user.googleEmail = email;
    user.googleName = profile.name;
    user.googlePicture = profile.picture;
    await user.save({ session });
  }
  
  return user;
}

/**
 * Find or create user from Telegram profile
 */
export async function findOrCreateTelegramUser(profile, options = {}) {
  const { session = null } = options;

  const telegramId = String(profile.id);

  // F1: yalnız telegramId ile eşleşir. Telegram kullanıcı adları serbest
  // kalıp başkasına geçebilir; yerel bir hesap da `tg_<ad>` önceden kaydedebilir.
  // Kullanıcı adıyla mevcut hesaba ASLA bağlanmaz (bağlama için
  // kimlik doğrulamalı linkTelegramAccount akışı).
  const user = await User.findOne({ telegramId }).session(session);
  if (user) {
    user.telegramUsername = profile.username;
    user.telegramFirstName = profile.first_name;
    user.telegramLastName = profile.last_name;
    user.telegramPhoto = profile.photo_url;
    await user.save({ session });
    return user;
  }

  const base = profile.username ? `tg_${profile.username}` : `tg_${telegramId.slice(0, 10)}`;
  const { user: created } = await createProviderUser(
    providerUsernameCandidates(base, telegramId),
    (username) => ({
      username,
      email: `${telegramId}@telegram.vip90.local`,
      password: crypto.randomBytes(32).toString('hex'),
      telegramId,
      telegramUsername: profile.username,
      telegramFirstName: profile.first_name,
      telegramLastName: profile.last_name,
      telegramPhoto: profile.photo_url,
      emailVerified: true, // Telegram verified
    }),
    {
      session,
      // Concurrent first login with the same telegramId (the clashing key is
      // telegramId or the derived <id>@telegram.vip90.local email): the winner.
      findWinner: (e) => (e?.keyPattern?.telegramId || e?.keyPattern?.email ? User.findOne({ telegramId }) : null),
    },
  );
  return created;
}

/**
 * Handle Google OAuth callback
 */
export async function handleGoogleCallback(code, state, options = {}) {
  const { session = null } = options;
  
  // Verify state
  const stateData = consumeOAuthState(state);
  if (!stateData || stateData.provider !== 'google') {
    throw createError(400, 'INVALID_STATE', 'Geçersiz veya süresi dolmuş OAuth state');
  }
  
  // Exchange code for tokens
  const tokens = await exchangeGoogleCode(code);
  
  // Get user info
  const profile = await getGoogleUserInfo(tokens.access_token);
  
  // Find or create user
  const user = await findOrCreateGoogleUser(profile, { session });
  
  // Generate tokens
  const sessionResult = await issueSession(user, { method: 'google' });
  
  return { user, ...sessionResult, tokens };
}

/**
 * Handle Telegram OAuth callback
 */
export async function handleTelegramCallback(queryParams, state, options = {}) {
  const { session = null } = options;
  
  // Verify state
  const stateData = consumeOAuthState(state);
  if (!stateData || stateData.provider !== 'telegram') {
    throw createError(400, 'INVALID_STATE', 'Geçersiz veya süresi dolmuş OAuth state');
  }
  
  // Verify Telegram widget data
  if (!verifyTelegramWidgetData(queryParams, TELEGRAM_LOGIN_BOT_TOKEN)) {
    throw createError(400, 'INVALID_TELEGRAM_DATA', 'Telegram verisi doğrulanamadı');
  }
  
  // auth_date: sayısal, en fazla 24 saat eski, 5 dakikadan ileri değil
  assertTelegramAuthDate(queryParams);
  
  // Get user info
  const profile = getTelegramUserInfo(queryParams);
  
  // Find or create user
  const user = await findOrCreateTelegramUser(profile, { session });
  
  // Generate tokens
  const sessionResult = await issueSession(user, { method: 'telegram' });
  
  return { user, ...sessionResult };
}

/**
 * Link Google account to existing user
 */
export async function linkGoogleAccount(userId, code, state, options = {}) {
  const { session = null } = options;
  
  const stateData = consumeOAuthState(state);
  if (!stateData || stateData.provider !== 'google') {
    throw createError(400, 'INVALID_STATE', 'Geçersiz OAuth state');
  }
  
  // Verify user exists and doesn't already have Google
  const user = await User.findById(userId).session(session);
  if (!user) throw createError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı');
  if (user.googleId) throw createError(409, 'GOOGLE_ALREADY_LINKED', 'Hesap zaten Google ile bağlı');
  
  const tokens = await exchangeGoogleCode(code);
  const profile = await getGoogleUserInfo(tokens.access_token);
  if (!profile.sub) throw createError(502, 'GOOGLE_PROFILE_INVALID', 'Google profilinde kimlik yok');
  
  // Check if Google account already linked to another user
  const existingUser = await User.findOne({ googleId: profile.sub }).session(session);
  if (existingUser && !existingUser._id.equals(userId)) {
    throw createError(409, 'GOOGLE_ALREADY_LINKED', 'Bu Google hesabı zaten başka bir kullanıcıya bağlı');
  }
  
  // Link Google account
  user.googleId = profile.sub;
  user.googleEmail = profile.email;
  user.googleName = profile.name;
  user.googlePicture = profile.picture;
  // Yalnız (doğrulanmış) Google e-postası hesap e-postasıyla aynıysa doğrulanır.
  if (String(profile.email || '').toLowerCase() === String(user.email || '').toLowerCase()) {
    user.emailVerified = true;
  }
  await user.save({ session });
  
  return user;
}

/**
 * Link Telegram account to existing user
 */
export async function linkTelegramAccount(userId, queryParams, state, options = {}) {
  const { session = null } = options;
  
  const stateData = consumeOAuthState(state);
  if (!stateData || stateData.provider !== 'telegram') {
    throw createError(400, 'INVALID_STATE', 'Geçersiz OAuth state');
  }
  // F1: kullanıcıya bağlı state yalnız o kullanıcıyla tüketilebilir.
  if (stateData.userId && String(stateData.userId) !== String(userId)) {
    throw createError(400, 'INVALID_STATE', 'Geçersiz OAuth state');
  }
  
  if (!verifyTelegramWidgetData(queryParams, TELEGRAM_LOGIN_BOT_TOKEN)) {
    throw createError(400, 'INVALID_TELEGRAM_DATA', 'Telegram verisi doğrulanamadı');
  }
  assertTelegramAuthDate(queryParams);
  
  const user = await User.findById(userId).session(session);
  if (!user) throw createError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı');
  if (user.telegramId) throw createError(409, 'TELEGRAM_ALREADY_LINKED', 'Hesap zaten Telegram ile bağlı');
  
  const profile = getTelegramUserInfo(queryParams);
  
  const existingUser = await User.findOne({ telegramId: String(profile.id) }).session(session);
  if (existingUser && !existingUser._id.equals(userId)) {
    throw createError(409, 'TELEGRAM_ALREADY_LINKED', 'Bu Telegram hesabı zaten başka bir kullanıcıya bağlı');
  }
  
  user.telegramId = String(profile.id);
  user.telegramUsername = profile.username;
  user.telegramFirstName = profile.first_name;
  user.telegramLastName = profile.last_name;
  user.telegramPhoto = profile.photo_url;
  await user.save({ session });
  
  return user;
}

/**
 * Unlink Google account
 */
export async function unlinkGoogleAccount(userId, options = {}) {
  const { session = null } = options;
  
  const user = await User.findByIdAndUpdate(userId, {
    googleId: null,
    googleEmail: null,
    googleName: null,
    googlePicture: null,
  }, { new: true, session }).select('-password');
  
  if (!user) throw createError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı');
  
  return user;
}

/**
 * Unlink Telegram account
 */
export async function unlinkTelegramAccount(userId, options = {}) {
  const { session = null } = options;
  
  const user = await User.findByIdAndUpdate(userId, {
    telegramId: null,
    telegramUsername: null,
    telegramFirstName: null,
    telegramLastName: null,
    telegramPhoto: null,
  }, { new: true, session }).select('-password');
  
  if (!user) throw createError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı');
  
  return user;
}

/**
 * Get user's linked social accounts
 */
export async function getUserSocialAccounts(userId) {
  const user = await User.findById(userId).select('googleId googleEmail googleName googlePicture telegramId telegramUsername telegramFirstName telegramLastName telegramPhoto walletAddress');
  if (!user) return null;
  
  return {
    google: user.googleId ? {
      id: user.googleId,
      email: user.googleEmail,
      name: user.googleName,
      picture: user.googlePicture,
    } : null,
    telegram: user.telegramId ? {
      id: user.telegramId,
      username: user.telegramUsername,
      firstName: user.telegramFirstName,
      lastName: user.telegramLastName,
      photo: user.telegramPhoto,
    } : null,
    wallet: user.walletAddress ? {
      address: user.walletAddress,
      type: user.walletType,
      connectedAt: user.walletConnectedAt,
      chainId: user.walletChainId,
    } : null,
  };
}