import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Tenant from '../src/models/Tenant.js';
import Domain from '../src/models/Domain.js';
import { createApp } from '../src/app.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t10';
const LEGACY_RESPONSE_KEYS = ['accessToken', 'amr', 'user'];
const LEGACY_USER_KEYS = [
  '__v', '_id', 'acceptedKvkkAt', 'acceptedTermsAt', 'accountRestricted', 'ageConfirmedAt',
  'ageVerifiedAt', 'agentId', 'balance', 'bonusBalance', 'bonusModelBMigratedAt', 'botProfile',
  'consentVersion', 'createdAt', 'cryptoDepositIndex', 'dailyStats', 'dateOfBirth', 'deletedAt',
  'deletionRequestedAt', 'email', 'emailVerificationExpires', 'emailVerified', 'favoriteGames',
  'isActive', 'isAgent', 'isBot', 'isDemoAdmin', 'isSeed', 'kycApprovedAt', 'kycProvider',
  'kycRejectedAt', 'kycRejectionReason', 'kycRequiredFor', 'kycStatus', 'kycSubmittedAt',
  'kycVerified', 'lastLoginAt', 'lastLoginIp', 'locked', 'monthlyStats', 'palaceUserCode',
  'passwordChangedAt', 'passwordResetExpires', 'phone', 'phoneVerified', 'preferences',
  'recentlyPlayed', 'referredBy', 'responsibleLimits', 'restrictedAt', 'restrictedBy',
  'restrictionReason', 'role', 'roles', 'scheduledDeletionAt', 'staffMigratedAt',
  'sumsubApplicantId', 'tenantId', 'tokenVersion', 'totalReferralEarnings', 'totalXpEarned',
  'twoFactorEnabled', 'twoFactorVerifiedAt', 'updatedAt', 'username', 'vipLevel', 'vipXp',
  'walletChainId', 'walletConnectedAt', 'walletType', 'weeklyStats', 'withdrawable',
  'withdrawalLockUntil',
];

function request(server, path, body, host) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      path,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(JSON.stringify(body)),
        host,
      },
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({
        status: response.statusCode,
        body: JSON.parse(text),
        cookies: response.headers['set-cookie'] || [],
      }));
    });
    request.on('error', reject);
    request.end(JSON.stringify(body));
  });
}

describe('Compatible Login & Staff Auth Integration', () => {
  let app;
  let server;
  let defaultTenant;
  let originalEnv;

  before(async () => {
    originalEnv = {
      TENANCY_MODE: process.env.TENANCY_MODE,
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
      JWT_STAFF_SECRET: process.env.JWT_STAFF_SECRET,
      JWT_STAFF_REFRESH_SECRET: process.env.JWT_STAFF_REFRESH_SECRET,
    };
    process.env.NODE_ENV = 'test';
    process.env.TENANCY_MODE = 'single';
    process.env.JWT_SECRET = 'test-player-secret';
    process.env.JWT_REFRESH_SECRET = 'test-player-refresh-secret';
    process.env.JWT_STAFF_SECRET = 'test-staff-secret';
    process.env.JWT_STAFF_REFRESH_SECRET = 'test-staff-refresh-secret';

    await mongoose.connect(TEST_DB);
    await mongoose.connection.dropDatabase();
    defaultTenant = await Tenant.create({ key: 'default', name: 'Default', isDefault: true, status: 'active' });
    setDefaultTenantId(defaultTenant._id);
    await Domain.create({ host: 'staff.example.test', tenantId: defaultTenant._id, verifiedAt: new Date() });
    const adminUser = await User.create({
      username: 'legacy_admin',
      email: 'admin@legacy.test',
      password: 'AdminPassword123!',
      role: 'admin',
      emailVerified: true,
    });
    await StaffAccount.create({
      _id: adminUser._id,
      email: 'admin@legacy.test',
      username: 'legacy_admin',
      password: 'AdminPassword123!',
    });

    app = createApp();
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    setDefaultTenantId(null);
    process.env.TENANCY_MODE = 'single';
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('single mode keeps the legacy admin login response and refresh cookie unchanged', async () => {
    const response = await request(server, '/api/auth/login', {
      username: 'legacy_admin',
      password: 'AdminPassword123!',
    }, 'unknown.single.test');

    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body).sort(), LEGACY_RESPONSE_KEYS);
    assert.deepEqual(Object.keys(response.body.user).sort(), LEGACY_USER_KEYS);
    assert.equal(response.body.user.role, 'admin');
    assert.equal(response.body.user.username, 'legacy_admin');
    assert.equal(response.body.amr[0], 'pwd');
    assert.match(response.cookies[0], /^refreshToken=[^;]+; Max-Age=604800; Path=\/; Expires=.*; HttpOnly; SameSite=Lax$/);
  });

  it('multi mode serves staff login from /api/staff/auth/login', async () => {
    process.env.TENANCY_MODE = 'multi';
    const legacyResponse = await request(server, '/api/auth/login', {
      username: 'legacy_admin',
      password: 'AdminPassword123!',
    }, 'staff.example.test');
    assert.equal(legacyResponse.status, 401);

    const response = await request(server, '/api/staff/auth/login', {
      username: 'legacy_admin',
      password: 'AdminPassword123!',
    }, 'staff.example.test');

    assert.equal(response.status, 200);
    assert.equal(response.body.requires2faSetup, true);
    assert.ok(response.body.setupToken);
  });
});
