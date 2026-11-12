import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { requireStaff } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/error.js';
import StaffAccount from '../src/models/StaffAccount.js';
import Partner from '../src/models/Partner.js';
import Role from '../src/models/Role.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import { signStaffAccess } from '../src/services/staffSession.js';

process.env.JWT_SECRET ||= 'test-jwt-secret';
process.env.JWT_STAFF_SECRET ||= 'test-jwt-staff-secret';
process.env.TENANCY_MODE = 'multi';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9b_t2';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function createServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/partner/test-route', requireStaff('partner'), (req, res) => {
    res.json({ ok: true, staff: req.staff, partnerId: req.partner?._id });
  });

  app.use(errorHandler);
  const server = app.listen(0);
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

test('requireStaff("partner") allows valid partner token with 2FA amr', async () => {
  const staff = await StaffAccount.create({ email: 'padmin@example.com', username: 'padmin', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'auth-partner', name: 'AP', createdBy: staff._id });
  const role = await Role.create({ name: 'custom_p_role', displayName: 'PRole', scopeType: 'partner', scopeId: partner._id });
  await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType: 'partner', scopeId: partner._id });

  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  const { server, base } = await createServer();
  try {
    const res = await fetch(`${base}/api/partner/test-route`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(String(body.staff.scopeId), String(partner._id));
  } finally {
    server.close();
  }
});

test('requireStaff("partner") rejects partner token missing 2FA otp claim in multi mode', async () => {
  const staff = await StaffAccount.create({ email: 'no2fa@example.com', username: 'no2fa', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'auth-no2fa', name: 'AP2', createdBy: staff._id });
  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd'] });

  const { server, base } = await createServer();
  try {
    const res = await fetch(`${base}/api/partner/test-route`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'TWO_FACTOR_REQUIRED');
  } finally {
    server.close();
  }
});

test('requireStaff("partner") rejects token for suspended partner', async () => {
  const staff = await StaffAccount.create({ email: 'susp@example.com', username: 'susp', password: 'pwd', status: 'active' });
  const partner = await Partner.create({ key: 'auth-susp', name: 'APS', status: 'suspended', createdBy: staff._id });
  const token = signStaffAccess(staff, { scopeType: 'partner', scopeId: partner._id, amr: ['pwd', 'otp'] });

  const { server, base } = await createServer();
  try {
    const res = await fetch(`${base}/api/partner/test-route`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'PARTNER_SUSPENDED');
  } finally {
    server.close();
  }
});
