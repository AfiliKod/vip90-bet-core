import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import StaffAccount from '../src/models/StaffAccount.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t1';

describe('StaffAccount Model', () => {
  before(async () => {
    await mongoose.connect(TEST_DB);
    await StaffAccount.deleteMany({});
  });

  after(async () => {
    await StaffAccount.deleteMany({});
    await mongoose.disconnect();
  });

  it('hashes password on save and compares correctly', async () => {
    const staff = await StaffAccount.create({
      email: 'Staff1@Domain.COM',
      username: 'staff_one',
      password: 'SecretPassword123!',
    });
    assert.equal(staff.email, 'staff1@domain.com');
    assert.notEqual(staff.password, 'SecretPassword123!');
    assert.equal(await staff.comparePassword('SecretPassword123!'), true);
    assert.equal(await staff.comparePassword('WrongPassword'), false);
  });

  it('toSafeObject strips password and 2FA secrets', async () => {
    const staff = await StaffAccount.findOne({ email: 'staff1@domain.com' }).select('+password +twoFactor.secretEnc');
    const safe = staff.toSafeObject();
    assert.equal(safe.email, 'staff1@domain.com');
    assert.equal(safe.password, undefined);
    assert.equal(safe.secretEnc, undefined);
    assert.equal(safe.twoFactorEnabled, false);
  });

  it('enforces unique email case-insensitively', async () => {
    await assert.rejects(
      () => StaffAccount.create({ email: 'STAFF1@domain.com', username: 'staff_dup', password: 'Pass' }),
      /E11000/
    );
  });
});
