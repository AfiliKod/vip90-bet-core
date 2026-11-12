import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import StaffAccount from '../src/models/StaffAccount.js';
import RoleAssignment from '../src/models/RoleAssignment.js';
import Role from '../src/models/Role.js';
import { bootstrapFirstPlatformOwner, parseBootstrapArgs } from '../../scripts/platform-bootstrap.mjs';
import { runPlatformBootstrap } from '../src/platform/bootstrap.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t2';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
  await runPlatformBootstrap({ env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' } });
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('parseBootstrapArgs correctly extracts CLI flags', () => {
  const args = ['--owner-email', 'owner@example.com', '--username', 'rootowner', '--password-stdin'];
  const opts = parseBootstrapArgs(args);
  assert.equal(opts.ownerEmail, 'owner@example.com');
  assert.equal(opts.username, 'rootowner');
  assert.equal(opts.passwordStdin, true);
  assert.throws(() => parseBootstrapArgs(['--password', 'x']), /password-stdin/);
});

test('N2 provisions first platform owner with platform_owner role and inactive 2FA (forces 2FA setup on login)', async () => {
  const result = await bootstrapFirstPlatformOwner({
    ownerEmail: 'owner@example.com',
    username: 'platformowner',
    password: 'InitialPassword123!',
  });

  assert.equal(result.created, true);
  assert.equal(result.email, 'owner@example.com');

  const staff = await StaffAccount.findOne({ email: 'owner@example.com' });
  assert.ok(staff, 'StaffAccount document must be created');
  assert.equal(staff.twoFactor.enabled, false, '2FA must start disabled to trigger requires2faSetup flow');

  const assignment = await RoleAssignment.findOne({ staffId: staff._id, scopeType: 'platform' });
  assert.ok(assignment, 'Role assignment must exist');
  const role = await Role.findById(assignment.roleId);
  assert.equal(role.name, 'platform_owner');
});

test('N2 bootstrap CLI is idempotent: second run reports already installed without duplicating', async () => {
  const result = await bootstrapFirstPlatformOwner({
    ownerEmail: 'another@example.com',
  });

  assert.equal(result.created, false);
  assert.equal(result.alreadyInstalled, true);
  assert.equal(result.email, 'owner@example.com');

  const count = await StaffAccount.countDocuments();
  assert.equal(count, 1, 'Only one platform owner account should exist');
});
