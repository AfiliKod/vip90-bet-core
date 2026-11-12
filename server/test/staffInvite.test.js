import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import StaffAccount from '../src/models/StaffAccount.js';
import StaffInvite from '../src/platform/models/StaffInvite.js';
import { createStaffInvite, acceptStaffInvite, INVITE_TTL_MS } from '../src/platform/services/staffInvite.js';
import staffAuthRoutes from '../src/routes/staffAuth.js';
import { errorHandler } from '../src/middleware/error.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t4_invite';
let staff;

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await Promise.all([StaffAccount.init(), StaffInvite.init()]);
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  await Promise.all([StaffAccount.deleteMany({}), StaffInvite.deleteMany({})]);
  staff = await StaffAccount.create({ email: 'owner@t1.example.com', username: 'owner', password: 'unknown-random-pass' });
});

test('only the token hash is stored and the token sets the password once', async () => {
  const { token } = await createStaffInvite(staff._id);
  const row = await StaffInvite.findOne({ staffId: staff._id }).lean();
  assert.notEqual(row.tokenHash, token);
  assert.equal(row.tokenHash.length, 64);

  await acceptStaffInvite({ token, password: 'a-long-new-password' });
  const updated = await StaffAccount.findById(staff._id).select('+password');
  assert.equal(await updated.comparePassword('a-long-new-password'), true);
  assert.equal(updated.tokenVersion, 1);

  await assert.rejects(acceptStaffInvite({ token, password: 'another-long-password' }), { code: 'INVITE_INVALID' });
});

test('an expired invitation is rejected', async () => {
  const issuedAt = new Date(Date.now() - INVITE_TTL_MS - 1000);
  const { token } = await createStaffInvite(staff._id, { now: issuedAt });
  await assert.rejects(acceptStaffInvite({ token, password: 'a-long-new-password' }), { code: 'INVITE_INVALID' });
});

test('a new invitation revokes the previous unused one', async () => {
  const first = await createStaffInvite(staff._id);
  const second = await createStaffInvite(staff._id);
  await assert.rejects(acceptStaffInvite({ token: first.token, password: 'a-long-new-password' }), { code: 'INVITE_INVALID' });
  await acceptStaffInvite({ token: second.token, password: 'a-long-new-password' });
});

test('short passwords and suspended accounts are refused', async () => {
  const { token } = await createStaffInvite(staff._id);
  await assert.rejects(acceptStaffInvite({ token, password: 'short' }), { code: 'PASSWORD_TOO_SHORT' });
  await StaffAccount.updateOne({ _id: staff._id }, { status: 'suspended' });
  await assert.rejects(acceptStaffInvite({ token, password: 'a-long-new-password' }), { code: 'INVITE_INVALID' });
});

test('POST /api/staff/auth/accept-invite sets the password over HTTP', async () => {
  const { token } = await createStaffInvite(staff._id);
  const app = express();
  app.use(express.json());
  app.use('/api/staff/auth', staffAuthRoutes);
  app.use(errorHandler);
  const server = app.listen(0);
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/staff/auth/accept-invite`;
    const bad = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'nope', password: 'a-long-new-password' }) });
    assert.equal(bad.status, 400);
    const ok = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: 'a-long-new-password' }) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).email, 'owner@t1.example.com');
  } finally {
    server.close();
  }
});
