process.env.TENANCY_MODE = 'multi';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY ||= 'a'.repeat(64);

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { default: Setting } = await import('../src/models/Setting.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { default: Brand } = await import('../src/models/Brand.js');
const { runWithTenant, runAsPlatform } = await import('../src/tenancy/context.js');
const { createSecretSettingsStore, mongoLoad, mongoSave } = await import('../src/config/secretSettingsStore.js');
const { runSettingsMigration } = await import('../src/tenancy/settingsMigration.js');

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t2';

describe('Task 2: secretSettingsStore tenancy and isolation', () => {
  let t1, t2, b1;

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await mongoose.connection.dropDatabase();
    await runSettingsMigration({ connection: mongoose.connection });
    t1 = await Tenant.create({ name: 'Tenant 1', key: 't1' });
    t2 = await Tenant.create({ name: 'Tenant 2', key: 't2' });
    b1 = await runWithTenant(t1._id, async () => {
      return Brand.create({ name: 'Brand 1', slug: 'b1', tenantId: t1._id });
    });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('keeps caches completely isolated between tenants', async () => {
    const store = createSecretSettingsStore({
      prefix: 'testStore',
      fields: [
        { name: 'apiKey', env: 'TEST_API_KEY', secret: true },
        { name: 'endpoint', env: 'TEST_ENDPOINT', default: 'https://default.test' },
      ],
      load: mongoLoad,
      save: mongoSave,
      env: { TENANCY_MODE: 'multi', TEST_API_KEY: 'env-leak-secret' },
    });

    // Write T1 setting
    await runWithTenant(t1._id, async () => {
      await store.update({ apiKey: 't1-secret-key', endpoint: 'https://t1.test' });
    });

    // Write T2 setting
    await runWithTenant(t2._id, async () => {
      await store.update({ apiKey: 't2-secret-key', endpoint: 'https://t2.test' });
    });

    // Read T1 in T1 context
    await runWithTenant(t1._id, async () => {
      const all = await store.getAll();
      assert.equal(all.apiKey, 't1-secret-key');
      assert.equal(all.endpoint, 'https://t1.test');
    });

    // Read T2 in T2 context
    await runWithTenant(t2._id, async () => {
      const all = await store.getAll();
      assert.equal(all.apiKey, 't2-secret-key');
      assert.equal(all.endpoint, 'https://t2.test');
    });
  });

  it('never falls through to env in multi mode for tenant credentials', async () => {
    const store = createSecretSettingsStore({
      prefix: 'smtp',
      fields: [
        { name: 'pass', env: 'SMTP_PASS', secret: true },
        { name: 'host', env: 'SMTP_HOST', default: '' },
      ],
      load: mongoLoad,
      save: mongoSave,
      env: { TENANCY_MODE: 'multi', SMTP_PASS: 'super-secret-host-pass', SMTP_HOST: 'smtp.env.test' },
    });

    await runWithTenant(t1._id, async () => {
      const all = await store.getAll();
      assert.equal(all.pass, ''); // MUST NOT receive env secret!
      assert.equal(all.host, '');

      const adminView = await store.getAdminView();
      const passEntry = adminView.find(e => e.key === 'pass');
      assert.equal(passEntry.source, 'unset');
      assert.equal(passEntry.configured, false);
    });
  });

  it('allows env fall-through in single mode', async () => {
    const store = createSecretSettingsStore({
      prefix: 'smtp',
      fields: [
        { name: 'pass', env: 'SMTP_PASS', secret: true },
        { name: 'host', env: 'SMTP_HOST', default: '' },
      ],
      load: mongoLoad,
      save: mongoSave,
      env: { TENANCY_MODE: 'single', SMTP_PASS: 'single-env-pass', SMTP_HOST: 'smtp.single.test' },
    });

    const all = await store.getAll();
    assert.equal(all.pass, 'single-env-pass');
    assert.equal(all.host, 'smtp.single.test');
  });

  it('respects scope precedence: brand > tenant > platform > legacy', async () => {
    const store = createSecretSettingsStore({
      prefix: 'theme',
      fields: [
        { name: 'primaryColor', env: 'THEME_PRIMARY' },
      ],
      load: mongoLoad,
      save: mongoSave,
      env: { TENANCY_MODE: 'multi' },
    });

    // 1. Legacy un-scoped row
    await Setting.collection.insertOne({ key: 'theme.primaryColor', value: '#legacy00' });
    store.invalidate();

    // Query in T1 context without brand -> should see legacy
    await runWithTenant(t1._id, async () => {
      const all = await store.getAll();
      assert.equal(all.primaryColor, '#legacy00');
    });

    // 2. Platform setting overrides legacy
    await Setting.create({ scope: 'platform', tenantId: null, brandId: null, key: 'theme.primaryColor', value: '#platform' });
    store.invalidate();

    await runWithTenant(t1._id, async () => {
      const all = await store.getAll();
      assert.equal(all.primaryColor, '#platform');
    });

    // 3. Tenant setting overrides platform
    await runWithTenant(t1._id, async () => {
      await store.update({ primaryColor: '#tenant1' });
      const all = await store.getAll();
      assert.equal(all.primaryColor, '#tenant1');
    });

    // T2 still sees platform
    await runWithTenant(t2._id, async () => {
      const all = await store.getAll();
      assert.equal(all.primaryColor, '#platform');
    });

    // 4. Brand setting overrides tenant
    await runWithTenant(t1._id, async () => {
      await store.update({ primaryColor: '#brand1' }, { brandId: b1._id, scope: 'brand' });
    });

    // Read with brandId in T1 context
    await runWithTenant(t1._id, async () => {
      const brandAll = await store.getAll();
      assert.equal(brandAll.primaryColor, '#brand1');
    }, { brandId: b1._id });

    // Without brandId, T1 still sees tenant-level
    await runWithTenant(t1._id, async () => {
      const tenantAll = await store.getAll();
      assert.equal(tenantAll.primaryColor, '#tenant1');
    });
  });

  it('allows explicit tenantId/brandId in options and supports snapshot', async () => {
    const store = createSecretSettingsStore({
      prefix: 'configTest',
      fields: [
        { name: 'token', env: 'TOKEN', secret: true },
      ],
      load: mongoLoad,
      save: mongoSave,
      env: { TENANCY_MODE: 'multi' },
    });

    await store.update({ token: 'secret-for-t1' }, { tenantId: t1._id });

    // Explicit tenantId without runWithTenant
    const t1Values = await store.getAll({ tenantId: t1._id });
    assert.equal(t1Values.token, 'secret-for-t1');

    const snap = await store.snapshot({ tenantId: t1._id });
    assert.equal(snap.token, 'secret-for-t1');

    const adminView = await store.getAdminView({ tenantId: t1._id });
    assert.equal(adminView[0].configured, true);
    assert.equal(adminView[0].source, 'db');
  });

  it('allows platform fields to read env in multi mode', async () => {
    const store = createSecretSettingsStore({
      prefix: 'opsAlerts',
      scope: 'platform',
      fields: [
        { name: 'webhookUrl', env: 'OPS_WEBHOOK_URL', scope: 'platform' },
      ],
      load: mongoLoad,
      save: mongoSave,
      env: { TENANCY_MODE: 'multi', OPS_WEBHOOK_URL: 'https://ops.telegram.test/alert' },
    });

    const all = await store.getAll();
    assert.equal(all.webhookUrl, 'https://ops.telegram.test/alert');
  });

  it('supports clear option to remove setting for that tenant', async () => {
    const store = createSecretSettingsStore({
      prefix: 'clearTest',
      fields: [
        { name: 'apiKey', env: 'API_KEY', secret: true },
        { name: 'label', env: 'LABEL' },
      ],
      load: mongoLoad,
      save: mongoSave,
      env: { TENANCY_MODE: 'multi' },
    });

    await runWithTenant(t1._id, async () => {
      await store.update({ apiKey: 'k1', label: 'l1' });
    });
    await runWithTenant(t2._id, async () => {
      await store.update({ apiKey: 'k2', label: 'l2' });
    });

    // Clear apiKey for T1
    await runWithTenant(t1._id, async () => {
      await store.update({}, { clear: ['apiKey'] });
      const all = await store.getAll();
      assert.equal(all.apiKey, '');
      assert.equal(all.label, 'l1');
    });

    // T2 should still have apiKey
    await runWithTenant(t2._id, async () => {
      const all = await store.getAll();
      assert.equal(all.apiKey, 'k2');
      assert.equal(all.label, 'l2');
    });
  });
});
