import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

// services/socialAuth.js TELEGRAM_LOGIN_BOT_TOKEN'ı modül YÜKLENİRKEN bir
// kez process.env'den okuyup sabitliyor (prod'da sorun değil — server.js'in
// ilk satırı dotenv/config, tüm alt-modüllerden önce çalışır). Testte
// server.js hiç import edilmediği için önce env'i set edip SONRA dinamik
// import ile modülü yüklemek gerekiyor — normal static import bundan önce
// hoist edilirdi.
process.env.TELEGRAM_LOGIN_BOT_TOKEN ||= 'test-telegram-bot-token';
const {
  setOAuthState, getOAuthState, consumeOAuthState,
  verifyTelegramWidgetData, getTelegramUserInfo,
  findOrCreateGoogleUser, findOrCreateTelegramUser,
  handleTelegramCallback, getUserSocialAccounts,
} = await import('../src/services/socialAuth.js');

// Telegram Login Widget verisini gerçek bot token'ıyla imzalayan yardımcı
// (services/socialAuth.js'in verifyTelegramWidgetData'sının tersi).
function signTelegramData(data, botToken) {
  const dataCheckString = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  return crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
}

describe('Social Auth Service', () => {
  before(async () => {
    process.env.JWT_SECRET ||= 'test-jwt-secret';
    process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret';
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_socialauth');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('OAuth state management', () => {
    it('should set and retrieve state, tied to provider', () => {
      const state = setOAuthState('google');
      const entry = getOAuthState(state);
      assert.equal(entry.provider, 'google');
    });

    it('should return null for unknown state', () => {
      assert.equal(getOAuthState('does-not-exist'), null);
    });

    it('should be single-use — consumeOAuthState removes it', () => {
      const state = setOAuthState('telegram');
      const first = consumeOAuthState(state);
      assert.equal(first.provider, 'telegram');
      assert.equal(getOAuthState(state), null);
    });
  });

  describe('verifyTelegramWidgetData', () => {
    it('should accept correctly signed data', () => {
      const data = { id: '123456', first_name: 'Test', auth_date: '1700000000' };
      const hash = signTelegramData(data, process.env.TELEGRAM_LOGIN_BOT_TOKEN);
      assert.equal(verifyTelegramWidgetData({ ...data, hash }, process.env.TELEGRAM_LOGIN_BOT_TOKEN), true);
    });

    it('should reject tampered data', () => {
      const data = { id: '123456', first_name: 'Test', auth_date: '1700000000' };
      const hash = signTelegramData(data, process.env.TELEGRAM_LOGIN_BOT_TOKEN);
      assert.equal(verifyTelegramWidgetData({ ...data, first_name: 'Hacked', hash }, process.env.TELEGRAM_LOGIN_BOT_TOKEN), false);
    });

    it('should reject a signature made with the wrong bot token', () => {
      const data = { id: '123456', first_name: 'Test', auth_date: '1700000000' };
      const hash = signTelegramData(data, 'a-different-bot-token');
      assert.equal(verifyTelegramWidgetData({ ...data, hash }, process.env.TELEGRAM_LOGIN_BOT_TOKEN), false);
    });
  });

  describe('findOrCreateGoogleUser', () => {
    // P5 — daha önce User.create([{...}], {session}) dönen array doğrudan
    // `user` olarak atanıyordu; bu test o gerçek bug'ı kırmızıdan yeşile
    // taşıdı (bkz. commit notu).
    it('should create a new user with correct fields, not an array', async () => {
      const profile = { sub: 'google-sub-123', email: 'newgoogle@example.com', name: 'Google User', picture: 'https://x/y.jpg' };
      const user = await findOrCreateGoogleUser(profile);

      assert.ok(!Array.isArray(user), 'user bir dizi olmamalı');
      assert.ok(user._id, 'user._id tanımlı olmalı');
      assert.equal(user.googleId, 'google-sub-123');
      assert.equal(user.email, 'newgoogle@example.com');
      assert.equal(user.emailVerified, true);
    });

    it('should link Google to an existing user found by email', async () => {
      const existing = await User.create({ username: 'existinguser', email: 'existing@example.com', password: 'Password1' });
      const profile = { sub: 'google-sub-456', email: 'existing@example.com', name: 'Existing', picture: null };
      const user = await findOrCreateGoogleUser(profile);

      assert.equal(user._id.toString(), existing._id.toString());
      assert.equal(user.googleId, 'google-sub-456');
    });
  });

  describe('findOrCreateTelegramUser', () => {
    it('should create a new user with correct fields, not an array', async () => {
      const profile = { id: '999888777', first_name: 'Tele', last_name: 'Gram', username: 'telegramuser', photo_url: null };
      const user = await findOrCreateTelegramUser(profile);

      assert.ok(!Array.isArray(user), 'user bir dizi olmamalı');
      assert.ok(user._id, 'user._id tanımlı olmalı');
      assert.equal(user.telegramId, '999888777');
      assert.equal(user.username, 'tg_telegramuser');
    });
  });

  describe('handleTelegramCallback', () => {
    it('should authenticate end-to-end with a validly signed widget payload', async () => {
      const state = setOAuthState('telegram');
      const authDate = Math.floor(Date.now() / 1000);
      const data = { id: '555444333', first_name: 'Widget', username: 'widgetuser', auth_date: String(authDate) };
      const hash = signTelegramData(data, process.env.TELEGRAM_LOGIN_BOT_TOKEN);

      const result = await handleTelegramCallback({ ...data, hash }, state);

      assert.ok(!Array.isArray(result.user));
      assert.equal(result.user.telegramId, '555444333');
      assert.ok(typeof result.accessToken === 'string' && result.accessToken.length > 0);
      assert.ok(typeof result.refreshToken === 'string' && result.refreshToken.length > 0);
    });

    it('should reject an invalid/expired state', async () => {
      const authDate = Math.floor(Date.now() / 1000);
      const data = { id: '111', first_name: 'X', auth_date: String(authDate) };
      const hash = signTelegramData(data, process.env.TELEGRAM_LOGIN_BOT_TOKEN);
      await assert.rejects(() => handleTelegramCallback({ ...data, hash }, 'bogus-state'));
    });

    it('should reject tampered widget data even with a valid state', async () => {
      const state = setOAuthState('telegram');
      const authDate = Math.floor(Date.now() / 1000);
      const data = { id: '222', first_name: 'X', auth_date: String(authDate) };
      const hash = signTelegramData(data, 'wrong-token');
      await assert.rejects(() => handleTelegramCallback({ ...data, hash }, state));
    });
  });

  describe('getUserSocialAccounts', () => {
    it('should report linked providers', async () => {
      const user = await User.create({
        username: 'linked', email: 'linked@example.com', password: 'Password1',
        googleId: 'g1', googleEmail: 'linked@example.com', googleName: 'Linked',
      });
      const accounts = await getUserSocialAccounts(user._id);
      assert.ok(accounts.google);
      assert.equal(accounts.google.id, 'g1');
      assert.equal(accounts.telegram, null);
      assert.equal(accounts.wallet, null);
    });
  });
});
