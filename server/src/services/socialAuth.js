import crypto from 'crypto';
import User from '../models/User.js';
import { createError } from '../middleware/error.js';
import { signAccess, signRefresh } from '../controllers/auth.js';

/**
 * Google OAuth configuration
 */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';

/**
 * Telegram OAuth configuration — DÜZELTME: önceden aynı TELEGRAM_BOT_TOKEN
 * env değişkeni admin bildirim botuyla (services/alert.js) çakışıyordu; bu
 * ikisi farklı Telegram botları olmalı (Login Widget bir domain'e kayıtlı
 * olmak zorunda, bildirim botu değil) — ayrı bir isim kullanılıyor.
 */
const TELEGRAM_LOGIN_BOT_TOKEN = process.env.TELEGRAM_LOGIN_BOT_TOKEN;
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME;

/**
 * Generate state parameter for OAuth
 */
function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Store OAuth state with TTL
 */
const oauthStateStore = new Map(); // state -> { provider, userId, expiresAt }

export function setOAuthState(provider, userId = null) {
  const state = generateState();
  oauthStateStore.set(state, {
    provider,
    userId,
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
  return entry;
}

/**
 * Google OAuth: Get authorization URL
 */
export function getGoogleAuthUrl(userId = null) {
  const state = setOAuthState('google', userId);
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
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
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: GOOGLE_REDIRECT_URI,
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

  return response.json();
}

/**
 * Telegram OAuth: Generate login widget URL
 */
export function getTelegramAuthUrl(userId = null) {
  const state = setOAuthState('telegram', userId);
  const params = new URLSearchParams({
    // DÜZELTME: CLIENT_URL virgülle ayrılmış çoklu CORS origin'i taşıyabilir
    // (bkz. utils/origins.js) — Telegram'a tek bir origin gönderilmeli.
    origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim(),
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
  const { hash, ...data } = queryParams;
  
  // Create data-check-string
  const dataCheckString = Object.keys(data)
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('\n');

  // Generate secret key from bot token
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  
  // Calculate HMAC
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  
  return hmac === hash;
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
  
  const email = profile.email.toLowerCase();
  
  // Try to find existing user by email
  let user = await User.findOne({ email }).session(session);
  
  if (!user) {
    // Create new user
    // DÜZELTME: User.create(docs, options) docs bir array verildiğinde HER
    // ZAMAN array döner (session null olsa bile) — web3Auth.js'teki aynı bug
    // (bkz. P6 commit'i), aynı sebeple burada da fark edilmemişti.
    const username = `google_${profile.sub.slice(0, 10)}`;
    const [created] = await User.create([{
      username,
      email,
      password: crypto.randomBytes(32).toString('hex'),
      googleId: profile.sub,
      googleEmail: email,
      googleName: profile.name,
      googlePicture: profile.picture,
      emailVerified: true, // Google verified
    }], { session });
    user = created;
  } else {
    // Update Google info if not set
    if (!user.googleId) {
      user.googleId = profile.sub;
      user.googleEmail = email;
      user.googleName = profile.name;
      user.googlePicture = profile.picture;
      user.emailVerified = true;
      await user.save({ session });
    }
  }
  
  return user;
}

/**
 * Find or create user from Telegram profile
 */
export async function findOrCreateTelegramUser(profile, options = {}) {
  const { session = null } = options;
  
  const telegramId = String(profile.id);
  
  // Try to find existing user by telegramId
  let user = await User.findOne({ telegramId }).session(session);
  
  if (!user) {
    // Try by username if available
    if (profile.username) {
      user = await User.findOne({ username: `tg_${profile.username}` }).session(session);
    }
    
    if (!user) {
      // Create new user (bkz. findOrCreateGoogleUser'daki aynı array-dönüş notu)
      const username = profile.username ? `tg_${profile.username}` : `tg_${telegramId.slice(0, 10)}`;
      const [created] = await User.create([{
        username,
        email: `${telegramId}@telegram.vip90.local`,
        password: crypto.randomBytes(32).toString('hex'),
        telegramId,
        telegramUsername: profile.username,
        telegramFirstName: profile.first_name,
        telegramLastName: profile.last_name,
        telegramPhoto: profile.photo_url,
        emailVerified: true, // Telegram verified
      }], { session });
      user = created;
    } else {
      // Link telegram to existing user
      user.telegramId = telegramId;
      user.telegramUsername = profile.username;
      user.telegramFirstName = profile.first_name;
      user.telegramLastName = profile.last_name;
      user.telegramPhoto = profile.photo_url;
      await user.save({ session });
    }
  } else {
    // Update Telegram info
    user.telegramId = telegramId;
    user.telegramUsername = profile.username;
    user.telegramFirstName = profile.first_name;
    user.telegramLastName = profile.last_name;
    user.telegramPhoto = profile.photo_url;
    await user.save({ session });
  }
  
  return user;
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
  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);
  
  return { user, accessToken, refreshToken, tokens };
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
  
  // Check auth_date is recent (within 24 hours)
  const authDate = parseInt(queryParams.auth_date);
  if (Date.now() - authDate * 1000 > 24 * 60 * 60 * 1000) {
    throw createError(400, 'EXPIRED_TELEGRAM_AUTH', 'Telegram yetkilendirmesi süresi dolmuş');
  }
  
  // Get user info
  const profile = getTelegramUserInfo(queryParams);
  
  // Find or create user
  const user = await findOrCreateTelegramUser(profile, { session });
  
  // Generate tokens
  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);
  
  return { user, accessToken, refreshToken };
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
  user.emailVerified = true;
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
  
  if (!verifyTelegramWidgetData(queryParams, TELEGRAM_LOGIN_BOT_TOKEN)) {
    throw createError(400, 'INVALID_TELEGRAM_DATA', 'Telegram verisi doğrulanamadı');
  }
  
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