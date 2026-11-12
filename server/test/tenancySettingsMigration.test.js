import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import Setting from '../src/models/Setting.js';
import Tenant from '../src/models/Tenant.js';
import Migration from '../src/models/Migration.js';
import { listTenantIndexes } from '../src/tenancy/indexRegistry.js';
import { runSettingsMigration, PLATFORM_KEYS } from '../src/tenancy/settingsMigration.js';

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t1';

describe('Task 1: Setting model evolution & G6 migration', () => {
  let defaultTenant;

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await Setting.deleteMany({});
    await Tenant.deleteMany({});
    await Migration.deleteMany({});
    defaultTenant = await Tenant.create({ name: 'Default', key: 'default', isDefault: true });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('registers Setting compound index in indexRegistry', () => {
    const indexes = listTenantIndexes().filter(i => i.modelName === 'Setting');
    assert.equal(indexes.length, 1);
    assert.deepEqual(indexes[0].keys, { tenantId: 1, scope: 1, brandId: 1, key: 1 });
    assert.equal(indexes[0].options.unique, true);
    assert.equal(indexes[0].options.name, 'tenant_setting_scope_brand_key_uniq');
  });

  it('migrates legacy rows to correct scope and tenantId', async () => {
    // Legacy row with no scope/tenantId
    await Setting.collection.insertOne({ key: 'smtp.host', value: 'mail.legacy.test' });
    await Setting.collection.insertOne({ key: 'TELEGRAM_BOT_TOKEN', value: 'bot123' });

    const result = await runSettingsMigration({ connection: mongoose.connection });
    assert.equal(result.processed >= 2, true);

    const smtpRow = await Setting.findOne({ key: 'smtp.host' }).lean();
    assert.equal(smtpRow.scope, 'tenant');
    assert.equal(String(smtpRow.tenantId), String(defaultTenant._id));
    assert.equal(smtpRow.brandId, null);

    const botRow = await Setting.findOne({ key: 'TELEGRAM_BOT_TOKEN' }).lean();
    assert.equal(botRow.scope, 'platform');
    assert.equal(botRow.tenantId, null);
    assert.equal(botRow.brandId, null);

    const mig = await Migration.findOne({ name: 'tenancy-005-settings' });
    assert.ok(mig);
  });

  it('migration is idempotent', async () => {
    const rerun = await runSettingsMigration({ connection: mongoose.connection });
    assert.equal(rerun.alreadyRan, true);
  });

  it('categorizes alert.* and platform.* prefixed keys as platform', async () => {
    await Migration.deleteMany({ name: 'tenancy-005-settings' });
    await Setting.collection.insertOne({ key: 'alert.ops.channel', value: 'x' });
    await Setting.collection.insertOne({ key: 'platform.maintenance', value: 'y' });

    const result = await runSettingsMigration({ connection: mongoose.connection });
    assert.equal(result.processed >= 2, true);

    for (const key of ['alert.ops.channel', 'platform.maintenance']) {
      const row = await Setting.findOne({ key }).lean();
      assert.equal(row.scope, 'platform');
      assert.equal(row.tenantId, null);
      assert.equal(row.brandId, null);
    }
  });

  it('builds the compound unique index in the database', async () => {
    const indexes = await Setting.collection.listIndexes().toArray();
    const compound = indexes.find(i => i.name === 'tenant_setting_scope_brand_key_uniq');
    assert.ok(compound, 'tenant_setting_scope_brand_key_uniq must exist after G6');
    assert.equal(compound.unique, true);
    assert.deepEqual(compound.key, { tenantId: 1, scope: 1, brandId: 1, key: 1 });
  });
});

// Reviewer correction (2026-11-12): the mode is fixed at boot, so both modes are
// exercised by importing the model in a child process with TENANCY_MODE set.
const execFileAsync = promisify(execFile);
const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));
const SETTING_PATH = fileURLToPath(new URL('../src/models/Setting.js', import.meta.url));
const MIGRATION_PATH = fileURLToPath(new URL('../src/tenancy/settingsMigration.js', import.meta.url));

function childUri(mode) {
  const url = new URL(TEST_MONGO);
  url.pathname = `${url.pathname}_${mode}`;
  return url.toString();
}

function buildChildScript(mode, uri) {
  return `
import mongoose from 'mongoose';
import Setting from ${JSON.stringify(SETTING_PATH)};

const out = {};
await mongoose.connect(${JSON.stringify(uri)});
try {
  await Setting.init();
  const indexes = await Setting.collection.listIndexes().toArray();
  const keyIndex = indexes.find(i => i.name === 'key_1');
  out.keyIndexExists = Boolean(keyIndex);
  out.keyIndexUnique = keyIndex?.unique === true;
  out.compoundAutoBuilt = indexes.some(i => i.name === 'tenant_setting_scope_brand_key_uniq');

  const t1 = new mongoose.Types.ObjectId();
  const t2 = new mongoose.Types.ObjectId();
  await Setting.create({ key: 'dup.probe', value: 'a', scope: 'tenant', tenantId: t1 });
  try {
    await Setting.create({ key: 'dup.probe', value: 'b', scope: 'tenant', tenantId: t2 });
    out.duplicateKeyAcrossTenantsAllowed = true;
  } catch (err) {
    out.duplicateKeyAcrossTenantsAllowed = false;
    out.duplicateErrorCode = err.code ?? null;
  }

  if (${JSON.stringify(mode)} === 'multi') {
    const { runSettingsMigration } = await import(${JSON.stringify(MIGRATION_PATH)});
    const first = await runSettingsMigration({ connection: mongoose.connection });
    out.migration = { processed: first.processed, compoundIndexBuilt: first.compoundIndexBuilt, alreadyRan: first.alreadyRan === true };
    const second = await runSettingsMigration({ connection: mongoose.connection });
    out.migrationRerunAlreadyRan = second.alreadyRan === true;
    const after = await Setting.collection.listIndexes().toArray();
    const compound = after.find(i => i.name === 'tenant_setting_scope_brand_key_uniq');
    out.compoundBuiltByMigration = compound?.unique === true;
    try {
      await Setting.create({ key: 'dup.probe', value: 'c', scope: 'tenant', tenantId: t1 });
      out.compoundRejectsSameTenantDuplicate = false;
    } catch (err) {
      out.compoundRejectsSameTenantDuplicate = err.code === 11000;
    }
  }
} finally {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
console.log(JSON.stringify(out));
`;
}

async function probeMode(mode) {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '-e', buildChildScript(mode, childUri(mode))],
    { cwd: SERVER_DIR, env: { ...process.env, TENANCY_MODE: mode }, timeout: 60_000 },
  );
  const lines = stdout.trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

describe('Task 1 (reviewer correction): Setting.key uniqueness depends on TENANCY_MODE at boot', () => {
  it('single mode: fresh install auto-builds unique key_1 and rejects duplicate keys', async () => {
    const out = await probeMode('single');
    assert.equal(out.keyIndexExists, true);
    assert.equal(out.keyIndexUnique, true);
    assert.equal(out.compoundAutoBuilt, false, 'compound index is migration-built, never autoIndex');
    assert.equal(out.duplicateKeyAcrossTenantsAllowed, false);
    assert.equal(out.duplicateErrorCode, 11000);
  });

  it('multi mode: no unique key_1, same key per tenant allowed, G6 builds the compound unique', async () => {
    const out = await probeMode('multi');
    assert.equal(out.keyIndexUnique, false);
    assert.equal(out.compoundAutoBuilt, false, 'compound index is migration-built, never autoIndex');
    assert.equal(out.duplicateKeyAcrossTenantsAllowed, true);
    assert.deepEqual(out.migration, { processed: 0, compoundIndexBuilt: true, alreadyRan: false });
    assert.equal(out.migrationRerunAlreadyRan, true);
    assert.equal(out.compoundBuiltByMigration, true);
    assert.equal(out.compoundRejectsSameTenantDuplicate, true);
  });
});

// Keep the plan's PLATFORM_KEYS import meaningful: the platform set is part of the contract.
describe('Task 1: PLATFORM_KEYS contract', () => {
  it('exports the platform key set', () => {
    for (const key of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'ALERT_WEBHOOK_URL', 'ALERT_EMAIL_TO']) {
      assert.ok(PLATFORM_KEYS.includes(key), `${key} must be a platform key`);
    }
  });
});