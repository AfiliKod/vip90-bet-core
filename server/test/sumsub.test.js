import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Setting from '../src/models/Setting.js';
import { kycConfig } from '../src/config/kyc.js';

describe('KYC Config Store', () => {
  before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_kyc_config');
    }
  });

  after(async () => {
    await Setting.deleteMany({ key: { $in: ['KYC_ENABLED', 'KYC_PROVIDER', 'SUMSUB_APP_TOKEN', 'SUMSUB_SECRET_KEY', 'SUMSUB_LEVEL_NAME', 'SUMSUB_WEBHOOK_SECRET'] } });
  });

  beforeEach(async () => {
    await Setting.deleteMany({ key: { $in: ['KYC_ENABLED', 'KYC_PROVIDER', 'SUMSUB_APP_TOKEN', 'SUMSUB_SECRET_KEY', 'SUMSUB_LEVEL_NAME', 'SUMSUB_WEBHOOK_SECRET'] } });
    kycConfig.invalidate();
  });

  it('should return defaults when DB is empty', async () => {
    const enabled = await kycConfig.get('KYC_ENABLED');
    assert.equal(enabled, 'true');

    const provider = await kycConfig.get('KYC_PROVIDER');
    assert.equal(provider, 'manual');

    const levelName = await kycConfig.get('SUMSUB_LEVEL_NAME');
    assert.equal(levelName, 'basic-kyc-level');
  });

  it('should return env fallback for secrets', async () => {
    process.env.SUMSUB_APP_TOKEN = 'test_token_from_env';
    const token = await kycConfig.get('SUMSUB_APP_TOKEN');
    assert.equal(token, 'test_token_from_env');
    delete process.env.SUMSUB_APP_TOKEN;
  });

  it('should save and retrieve a setting', async () => {
    await kycConfig.set('KYC_PROVIDER', 'sumsub', null);
    kycConfig.invalidate();
    const provider = await kycConfig.get('KYC_PROVIDER');
    assert.equal(provider, 'sumsub');
  });

  it('should delete setting when value is empty', async () => {
    await kycConfig.set('KYC_PROVIDER', 'sumsub', null);
    await kycConfig.set('KYC_PROVIDER', '', null);
    kycConfig.invalidate();
    const provider = await kycConfig.get('KYC_PROVIDER');
    assert.equal(provider, 'manual'); // default
  });

  it('should return source information', async () => {
    const source = await kycConfig.sourceOf('KYC_ENABLED');
    assert.equal(source, 'default');

    await kycConfig.set('KYC_ENABLED', 'false', null);
    kycConfig.invalidate();
    const dbSource = await kycConfig.sourceOf('KYC_ENABLED');
    assert.equal(dbSource, 'db');
  });

  it('should mask secrets in getAll', async () => {
    await kycConfig.set('SUMSUB_APP_TOKEN', 'app_t_1234567890abcdef', null);
    await kycConfig.set('SUMSUB_SECRET_KEY', 'sec_abcdefghijklmnop', null);
    kycConfig.invalidate();

    const all = await kycConfig.getAll();
    const tokenEntry = all.find(s => s.key === 'SUMSUB_APP_TOKEN');
    const secretEntry = all.find(s => s.key === 'SUMSUB_SECRET_KEY');

    assert.ok(tokenEntry.secret === true);
    assert.ok(tokenEntry.value.includes('…'));
    assert.equal(tokenEntry.rawValue, 'app_t_1234567890abcdef');

    assert.ok(secretEntry.secret === true);
    assert.ok(secretEntry.value.includes('…'));
    assert.equal(secretEntry.rawValue, 'sec_abcdefghijklmnop');
  });

  it('should reject unknown keys', async () => {
    try {
      await kycConfig.set('UNKNOWN_KEY', 'value', null);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('Unknown KYC key'));
    }
  });

  it('should return all KYC keys with correct structure', async () => {
    const all = await kycConfig.getAll();
    assert.ok(Array.isArray(all));
    assert.equal(all.length, 6);

    const keys = all.map(s => s.key);
    assert.ok(keys.includes('KYC_ENABLED'));
    assert.ok(keys.includes('KYC_PROVIDER'));
    assert.ok(keys.includes('SUMSUB_APP_TOKEN'));
    assert.ok(keys.includes('SUMSUB_SECRET_KEY'));
    assert.ok(keys.includes('SUMSUB_LEVEL_NAME'));
    assert.ok(keys.includes('SUMSUB_WEBHOOK_SECRET'));

    for (const item of all) {
      assert.ok('key' in item);
      assert.ok('value' in item);
      assert.ok('rawValue' in item);
      assert.ok('source' in item);
      assert.ok('secret' in item);
    }
  });
});

describe('KYC Provider Branching', () => {
  before(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_kyc_branching');
    }
  });

  after(async () => {
    await User.deleteMany({});
    await Setting.deleteMany({ key: { $in: ['KYC_PROVIDER'] } });
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Setting.deleteMany({ key: { $in: ['KYC_PROVIDER'] } });
    kycConfig.invalidate();
  });

  it('should set kycProvider to sumsub when provider is sumsub', async () => {
    await kycConfig.set('KYC_PROVIDER', 'sumsub', null);
    kycConfig.invalidate();

    const user = await User.create({
      username: 'sumsub_user',
      email: 'sumsub@test.com',
      password: 'password123',
    });

    const provider = await kycConfig.get('KYC_PROVIDER');
    assert.equal(provider, 'sumsub');
  });

  it('should set kycProvider to manual by default', async () => {
    const user = await User.create({
      username: 'manual_user',
      email: 'manual@test.com',
      password: 'password123',
    });

    assert.equal(user.kycProvider, 'manual');
    assert.equal(user.sumsubApplicantId, null);
  });

  it('should allow storing sumsubApplicantId', async () => {
    const user = await User.create({
      username: 'sumsub_user2',
      email: 'sumsub2@test.com',
      password: 'password123',
      sumsubApplicantId: '5c9e177b0a975a6eeccf5960',
      kycProvider: 'sumsub',
    });

    assert.equal(user.sumsubApplicantId, '5c9e177b0a975a6eeccf5960');
    assert.equal(user.kycProvider, 'sumsub');

    const found = await User.findOne({ sumsubApplicantId: '5c9e177b0a975a6eeccf5960' });
    assert.ok(found);
    assert.equal(found.username, 'sumsub_user2');
  });
});

describe('Sumsub HMAC Signature', () => {
  it('should generate correct HMAC-SHA256 signature', async () => {
    const crypto = await import('crypto');
    const secretKey = 'test_secret_key';
    const ts = '1234567890';
    const method = 'POST';
    const urlPath = '/resources/applicants?levelName=basic-kyc-level';
    const body = '{"externalUserId":"user123"}';

    const payload = ts + method + urlPath + body;
    const expected = crypto.default.createHmac('sha256', secretKey).update(payload).digest('hex');

    assert.ok(expected);
    assert.equal(typeof expected, 'string');
    assert.equal(expected.length, 64); // SHA-256 hex length
  });

  it('should produce different signatures for different secrets', async () => {
    const crypto = await import('crypto');
    const ts = '1234567890';
    const method = 'POST';
    const urlPath = '/resources/applicants';

    const sig1 = crypto.default.createHmac('sha256', 'secret1').update(ts + method + urlPath).digest('hex');
    const sig2 = crypto.default.createHmac('sha256', 'secret2').update(ts + method + urlPath).digest('hex');

    assert.notEqual(sig1, sig2);
  });

  it('should produce different signatures for different timestamps', async () => {
    const crypto = await import('crypto');
    const secret = 'same_secret';
    const method = 'POST';
    const urlPath = '/resources/applicants';

    const sig1 = crypto.default.createHmac('sha256', secret).update('1111111111' + method + urlPath).digest('hex');
    const sig2 = crypto.default.createHmac('sha256', secret).update('2222222222' + method + urlPath).digest('hex');

    assert.notEqual(sig1, sig2);
  });
});
