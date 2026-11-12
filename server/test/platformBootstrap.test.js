import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Permission from '../src/models/Permission.js';
import Role from '../src/models/Role.js';
import Tenant from '../src/models/Tenant.js';
import Setting from '../src/models/Setting.js';
import Migration from '../src/models/Migration.js';
import { runPlatformBootstrap, PLATFORM_BOOTSTRAP_MIGRATION } from '../src/platform/bootstrap.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t1';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('N1 bootstrap executes on clean DB: seeds permissions, role templates, platform settings, zero default tenant', async () => {
  const result = await runPlatformBootstrap({
    env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' },
  });

  assert.equal(result.success, true);
  assert.equal(result.migrationRecorded, true);

  // 1. Verify permissions seeded
  const permissionsCount = await Permission.countDocuments();
  assert.ok(permissionsCount > 20, 'Permissions catalogue must be seeded');
  const platformPerm = await Permission.findOne({ key: 'platform:tenants:manage' });
  assert.ok(platformPerm, 'Platform permissions must exist');

  // 2. Verify scoped role templates (§5.2)
  const platformOwnerRole = await Role.findOne({ name: 'platform_owner', scopeType: 'platform' });
  assert.ok(platformOwnerRole, 'platform_owner role must exist');
  assert.equal(platformOwnerRole.scopeId, null);

  const tenantOwnerRole = await Role.findOne({ name: 'tenant_owner', scopeType: 'tenant' });
  assert.ok(tenantOwnerRole, 'tenant_owner role template must exist');
  assert.equal(tenantOwnerRole.scopeId, null);

  // 3. Verify zero default tenant (N1 spec §6.2)
  const tenantCount = await Tenant.countDocuments();
  assert.equal(tenantCount, 0, 'No default tenant should be created in multi mode bootstrap');

  // 4. Verify platform setting defaults
  const platformSetting = await Setting.findOne({ scope: 'platform', key: 'platform_initialized' });
  assert.ok(platformSetting, 'Platform initialized setting must exist');
  assert.equal(platformSetting.value, 'true');

  // 5. Verify migration record
  const migration = await Migration.findOne({ name: PLATFORM_BOOTSTRAP_MIGRATION.name });
  assert.ok(migration, 'platform-001-bootstrap migration must be recorded');
});

test('N1 bootstrap is idempotent: re-running does not duplicate permissions or roles', async () => {
  const permCountBefore = await Permission.countDocuments();
  const roleCountBefore = await Role.countDocuments();

  const secondRun = await runPlatformBootstrap({
    env: { TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'enforce' },
  });

  assert.equal(secondRun.success, true);
  assert.equal(secondRun.alreadyApplied, true);

  const permCountAfter = await Permission.countDocuments();
  const roleCountAfter = await Role.countDocuments();

  assert.equal(permCountAfter, permCountBefore);
  assert.equal(roleCountAfter, roleCountBefore);
});