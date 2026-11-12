process.env.TENANCY_MODE = 'multi';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY ||= 'a'.repeat(64);

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { default: Setting } = await import('../src/models/Setting.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { runWithTenant, runAsPlatform } = await import('../src/tenancy/context.js');
const { settings: opsSettings } = await import('../src/services/settings.js');
const { getCryptoSettings, updateCryptoSettings } = await import('../src/services/cryptoSettings.js');
const { brandingStore } = await import('../src/branding/index.js');
const { moduleStore } = await import('../src/modules/index.js');
const { runSettingsMigration } = await import('../src/tenancy/settingsMigration.js');

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t4';

describe('Task 4: Content, module and platform ops alert isolation', () => {
  let t1, t2;

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await Setting.deleteMany({});
    await Tenant.deleteMany({});
    await runSettingsMigration({ connection: mongoose.connection });
    t1 = await Tenant.create({ name: 'T1', key: 't1' });
    t2 = await Tenant.create({ name: 'T2', key: 't2' });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('keeps platform alert settings global while tenant settings are isolated', async () => {
    // Platform alert setting
    await runAsPlatform('test-alerts', async () => {
      await Setting.create({ scope: 'platform', tenantId: null, key: 'TELEGRAM_CHAT_ID', value: '-100123' });
    });

    const alertChat = await opsSettings.get('TELEGRAM_CHAT_ID');
    assert.equal(alertChat, '-100123');

    // Tenant 1 sets crypto and branding
    await runWithTenant(t1._id, async () => {
      await updateCryptoSettings({ usdtTryRate: 35.5 });
      await Setting.create({ scope: 'tenant', tenantId: t1._id, key: 'branding.siteName', value: 'BetBrand1' });
      brandingStore.invalidate();
    });

    // Tenant 2 sets different crypto and branding
    await runWithTenant(t2._id, async () => {
      await updateCryptoSettings({ usdtTryRate: 40.0 });
      await Setting.create({ scope: 'tenant', tenantId: t2._id, key: 'branding.siteName', value: 'BetBrand2' });
      brandingStore.invalidate();
    });

    // Read back in T1
    await runWithTenant(t1._id, async () => {
      const c = await getCryptoSettings();
      assert.equal(c.usdtTryRate, 35.5);
      const b = await brandingStore.getValues();
      assert.equal(b.siteName, 'BetBrand1');
    });

    // Read back in T2
    await runWithTenant(t2._id, async () => {
      const c = await getCryptoSettings();
      assert.equal(c.usdtTryRate, 40.0);
      const b = await brandingStore.getValues();
      assert.equal(b.siteName, 'BetBrand2');
    });
  });
});