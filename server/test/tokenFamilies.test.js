import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import StaffAccount from '../src/models/StaffAccount.js';
import User from '../src/models/User.js';
import { signStaffAccess, signStaffRefresh, verifyStaffAccess, verifyStaffRefresh } from '../src/services/staffSession.js';
import { signAccess } from '../src/services/session.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip3_t5';

describe('Two Token Families & Staff Session', () => {
  process.env.JWT_SECRET = 'test_player_jwt_secret_32_bytes_long!!';
  process.env.JWT_STAFF_SECRET = 'test_staff_jwt_secret_32_bytes_long!!';
  process.env.JWT_REFRESH_SECRET = 'test_player_refresh_secret_32_long!!';

  it('signs staff access token with aud staff and JWT_STAFF_SECRET', () => {
    const staff = { _id: new mongoose.Types.ObjectId(), tokenVersion: 1 };
    const tenantId = new mongoose.Types.ObjectId();
    const token = signStaffAccess(staff, { scopeType: 'tenant', scopeId: tenantId, amr: ['pwd', 'otp'] });
    const payload = verifyStaffAccess(token);
    assert.equal(payload.sub, String(staff._id));
    assert.equal(payload.typ, 'staff');
    assert.equal(payload.aud, 'staff');
    assert.equal(payload.scp, 'tenant');
    assert.equal(payload.sid, String(tenantId));
    assert.deepEqual(payload.amr, ['pwd', 'otp']);

    // Player secret cannot verify staff token
    assert.throws(() => jwt.verify(token, process.env.JWT_SECRET), jwt.JsonWebTokenError);
  });

  it('signs player access token with aud player and JWT_SECRET', () => {
    const tenantId = new mongoose.Types.ObjectId();
    const user = { _id: new mongoose.Types.ObjectId(), role: 'user', tokenVersion: 2, tenantId };
    const token = signAccess(user, ['pwd']);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    assert.equal(payload.typ, 'player');
    assert.equal(payload.aud, 'player');
    assert.equal(payload.id, String(user._id));
    assert.equal(String(payload.tid), String(tenantId));

    // Staff secret cannot verify player token
    assert.throws(() => jwt.verify(token, process.env.JWT_STAFF_SECRET), jwt.JsonWebTokenError);
  });
});
