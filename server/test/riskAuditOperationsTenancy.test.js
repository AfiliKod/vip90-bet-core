import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import RiskProfile from '../src/models/RiskProfile.js';
import RiskSignal from '../src/models/RiskSignal.js';
import RiskFinding from '../src/models/RiskFinding.js';
import RiskEvaluation from '../src/models/RiskEvaluation.js';
import RiskRule from '../src/models/RiskRule.js';
import AuditLog from '../src/models/AuditLog.js';
import AdminAction from '../src/models/AdminAction.js';
import { ReconciliationJob, ReconciliationItem } from '../src/models/Reconciliation.js';
import { runWithTenant, runAsPlatform } from '../src/tenancy/context.js';
import { isTenantCollection } from '../src/tenancy/tenantScoped.js';
import { listTenantIndexes } from '../src/tenancy/indexRegistry.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_t6';
const T1 = new mongoose.Types.ObjectId();

let savedEnforcement;

before(async () => {
  savedEnforcement = process.env.TENANCY_ENFORCEMENT;
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
  else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Risk, Audit and Reconciliation collections are registered as tenant collections', () => {
  for (const c of ['riskprofiles', 'risksignals', 'riskfindings', 'riskevaluations', 'riskrules',
                   'auditlogs', 'adminactions', 'reconciliationjobs', 'reconciliationitems']) {
    assert.ok(isTenantCollection(c), `expected ${c} to be tenant collection`);
  }

  // Reviewer correction: autoIndex is unchanged, compound indexes not in schema, registered in indexRegistry
  const models = [
    { model: RiskProfile, name: 'RiskProfile', expected: ['tenant_playerId_uniq', 'tenant_brandId'] },
    { model: RiskSignal, name: 'RiskSignal', expected: ['tenant_playerId_createdAt'] },
    { model: RiskFinding, name: 'RiskFinding', expected: ['tenant_playerId_status'] },
    { model: RiskEvaluation, name: 'RiskEvaluation', expected: ['tenant_playerId_createdAt'] },
    { model: RiskRule, name: 'RiskRule', expected: ['tenant_name_uniq'] },
    { model: AuditLog, name: 'AuditLog', expected: ['tenant_createdAt'] },
    { model: AdminAction, name: 'AdminAction', expected: ['tenant_createdAt'] },
    { model: ReconciliationJob, name: 'ReconciliationJob', expected: ['tenant_status_createdAt'] },
    { model: ReconciliationItem, name: 'ReconciliationItem', expected: ['tenant_jobId_status'] },
  ];

  const registered = listTenantIndexes();

  for (const { model, name, expected } of models) {
    // 1. autoIndex is unchanged (null / undefined, never false)
    assert.notEqual(model.schema.options.autoIndex, false, `${name} autoIndex must not be false`);
    assert.ok(model.schema.options.autoIndex == null, `${name} autoIndex must be unchanged`);

    // 2. Compound indexes are NOT in schema.indexes()
    const schemaIndexNames = model.schema.indexes().map(([keys, opts]) => opts?.name || Object.keys(keys).join('_'));
    for (const expName of expected) {
      assert.ok(!schemaIndexNames.includes(expName), `${name} schema must not contain compound index ${expName}`);
    }

    // 3. listTenantIndexes contains the expected indexes
    for (const expName of expected) {
      const found = registered.find(idx => idx.modelName === name && idx.options?.name === expName);
      assert.ok(found, `listTenantIndexes must contain ${name}.${expName}`);
      assert.equal(Object.keys(found.keys)[0], 'tenantId', `${name}.${expName} keys must start with tenantId`);
      assert.ok(found.options.name.startsWith('tenant_'), `${name}.${expName} name must start with tenant_`);
    }
  }
});

test('RiskRule supports platform templates (tenantId null) and tenant copies (tenantId set)', async () => {
  const template = await runAsPlatform('seed-rules', () =>
    RiskRule.create({ name: 'Max Daily Loss', category: 'financial', action: 'REVIEW', tenantId: null, reasonCode: 'R1' })
  );
  assert.equal(template.tenantId, null);

  const tenantRule = await runWithTenant(T1, () =>
    RiskRule.create({ name: 'Max Daily Loss', category: 'financial', action: 'REVIEW', reasonCode: 'R2' })
  );
  assert.equal(String(tenantRule.tenantId), String(T1));
});

test('AuditLog supports platform logs and tenant logs', async () => {
  const platLog = await runAsPlatform('platform-admin', () =>
    AuditLog.create({
      actorType: 'system',
      actorUsername: 'platform_system',
      actorScope: 'platform',
      action: 'BOOT_CHECK',
      category: 'system',
      tenantId: null,
    })
  );
  assert.equal(platLog.tenantId, null);
  assert.equal(platLog.actorScope, 'platform');

  const tenantLog = await runWithTenant(T1, () =>
    AuditLog.create({
      actorType: 'admin',
      actorUsername: 'tenant_admin',
      actorScope: 'tenant',
      action: 'UPDATE_SETTINGS',
      category: 'system',
    })
  );
  assert.equal(String(tenantLog.tenantId), String(T1));
});
