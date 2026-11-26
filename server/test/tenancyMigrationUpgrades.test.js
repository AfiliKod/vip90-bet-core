// Upgrading an existing single-mode install through the tenancy migrations (seen on
// production, 2026-11-26):
// - 0009 (platform bootstrap) does nothing in single mode but was still recorded, so a later
//   switch to multi mode would skip the bootstrap. It now defers: not recorded, re-tried later.
// - initDefaultScopedRoles collided with the legacy roles (admin, finance, support, ... with no
//   scopeType) on the legacy name_1 unique index (E11000), which aborted 0007 for super admins.
//   A legacy role with the same name now stands in for the tenant template, as resolveRole
//   in staffMigration.js already assumes.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createMigrationRunner } from '../migrations/runner.js';
import platformBootstrapMigration from '../migrations/0009_platform_bootstrap.js';
import Role from '../src/models/Role.js';
import { initDefaultScopedRoles } from '../src/services/permissions.js';

describe('migration runner: deferred migrations', () => {
  test('a migration whose up() returns { deferred: true } is not recorded and stays pending', async () => {
    const applied = [];
    const runner = createMigrationRunner({
      migrations: [
        { name: 'a', version: '1.0.0', up: async () => ({ deferred: true }) },
        { name: 'b', version: '1.1.0', up: async () => {} },
      ],
      getApplied: async () => [...applied],
      markApplied: async (m) => { applied.push(m.name); },
    });
    const res = await runner.applyAll();
    assert.deepEqual(applied, ['b']);
    assert.deepEqual(res.applied.map((m) => m.name), ['b']);
    assert.deepEqual(res.deferred.map((m) => m.name), ['a']);
    assert.deepEqual((await runner.pending()).map((m) => m.name), ['a']);
  });
});

describe('0009 platform bootstrap in single mode', () => {
  test('defers instead of being recorded as applied', async () => {
    const saved = process.env.TENANCY_MODE;
    process.env.TENANCY_MODE = 'single';
    try {
      assert.deepEqual(await platformBootstrapMigration.up(), { deferred: true });
    } finally {
      if (saved === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = saved;
    }
  });
});

describe('initDefaultScopedRoles on a legacy install', () => {
  let legacyIds;
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_tenancy_migration_upgrades');
    await mongoose.connection.dropDatabase();
    const roles = mongoose.connection.db.collection('roles');
    // The legacy shape: a global unique name index and roles without scopeType.
    await roles.createIndex({ name: 1 }, { unique: true, name: 'name_1' });
    const res = await roles.insertMany(['super_admin', 'admin', 'support', 'finance', 'casino_manager', 'content_manager']
      .map((name) => ({ name, displayName: name, permissions: [], isSystem: true })));
    legacyIds = Object.fromEntries(Object.values(res.insertedIds).map((id, i) => [['super_admin', 'admin', 'support', 'finance', 'casino_manager', 'content_manager'][i], String(id)]));
  });
  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('does not fail, keeps the legacy tenant roles and adds the missing templates', async () => {
    await initDefaultScopedRoles();
    const roles = await Role.find({}).select('_id name scopeType').lean();
    const byName = (n) => roles.filter((r) => r.name === n);
    for (const legacy of ['admin', 'support', 'finance', 'casino_manager', 'content_manager']) {
      assert.equal(byName(legacy).length, 1, `${legacy} exists once`);
      // The same document: kept as is, or stamped tenant by a later save (syncMissingPermissions).
      assert.equal(String(byName(legacy)[0]._id), legacyIds[legacy], `${legacy} is the legacy role`);
      assert.ok([null, 'tenant'].includes(byName(legacy)[0].scopeType ?? null), `${legacy} scope`);
    }
    for (const added of ['platform_owner', 'tenant_owner', 'risk_analyst', 'partner_admin']) {
      assert.equal(byName(added).length, 1, `${added} was created`);
    }
  });

  test('is idempotent', async () => {
    const before = await Role.countDocuments({});
    await initDefaultScopedRoles();
    assert.equal(await Role.countDocuments({}), before);
  });
});
