import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import { transitionTenantStatus } from '../src/platform/services/tenantLifecycle.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t6';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('transitionTenantStatus rejects active when checklist incomplete without force', async () => {
  const tenant = await Tenant.create({ key: 'eta', name: 'Eta', status: 'provisioning' });

  await assert.rejects(
    async () => transitionTenantStatus(tenant._id, 'active', { actorStaffId: new mongoose.Types.ObjectId() }),
    /CHECKLIST_INCOMPLETE/
  );
});

test('transitionTenantStatus allows closure with export and legal retention lock (K26)', async () => {
  const tenant = await Tenant.create({ key: 'theta', name: 'Theta', status: 'active' });
  const result = await transitionTenantStatus(tenant._id, 'closed', {
    actorStaffId: new mongoose.Types.ObjectId(),
    reason: 'Contract termination',
  });

  assert.equal(result.status, 'closed');
  const updated = await Tenant.findById(tenant._id);
  assert.ok(updated.closedAt instanceof Date);
  assert.ok(result.retentionLockUntil instanceof Date);
});