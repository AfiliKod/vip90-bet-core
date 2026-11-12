import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import speakeasy from 'speakeasy';
import StaffAccount from '../src/models/StaffAccount.js';
import {
  generateStaffSecret,
  confirmStaff2fa,
  createStaffChallengeToken,
  verifyStaffChallenge,
} from '../src/controllers/staff2fa.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t6';

describe('Staff 2FA Lifecycle', () => {
  process.env.JWT_SECRET = 'player_sec_32_bytes_long_1234567!';
  process.env.JWT_STAFF_SECRET = 'staff_sec_32_bytes_long_1234567!';
  process.env.OPERATOR_SECRET_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  let staff;

  before(async () => {
    await mongoose.connect(TEST_DB);
    await StaffAccount.deleteMany({});
    staff = await StaffAccount.create({ email: 'staff2fa@test.com', username: 'staff2fa', password: 'pwd' });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('generates secret, confirms setup and returns backup codes', async () => {
    const { secret, otpauthUrl } = generateStaffSecret(staff);
    assert.ok(secret);
    assert.ok(otpauthUrl.includes('VIP90-Staff'));

    const token = speakeasy.totp({ secret, encoding: 'base32' });
    const { backupCodes } = await confirmStaff2fa(staff._id, { secret, token });
    assert.equal(backupCodes.length, 8);

    const updated = await StaffAccount.findById(staff._id).select('+twoFactor.secretEnc +twoFactor.backupCodesHash');
    assert.equal(updated.twoFactor.enabled, true);
    assert.ok(updated.twoFactor.secretEnc.startsWith('enc:'));
    assert.equal(updated.twoFactor.backupCodesHash.length, 8);
  });

  it('verifies login challenge with TOTP code', async () => {
    const updated = await StaffAccount.findById(staff._id);
    const challenge = createStaffChallengeToken(updated, 'pwd');
    const secret = speakeasy.generateSecret().base32; // dummy
    // Re-read staff with secret
    const fullStaff = await StaffAccount.findById(staff._id).select('+twoFactor.secretEnc');
    const { decryptSensitive } = await import('../src/utils/secretCrypto.js');
    const rawSecret = decryptSensitive(fullStaff.twoFactor.secretEnc);
    const validCode = speakeasy.totp({ secret: rawSecret, encoding: 'base32' });

    const result = await verifyStaffChallenge(challenge, validCode);
    assert.equal(String(result.staff._id), String(staff._id));
    assert.deepEqual(result.amr, ['pwd', 'otp']);
  });
});
