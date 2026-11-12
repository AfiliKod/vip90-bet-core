process.env.TENANCY_MODE = 'multi';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY ||= 'b'.repeat(64);

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { default: Setting } = await import('../src/models/Setting.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { runWithTenant } = await import('../src/tenancy/context.js');
const { slikairConfig } = await import('../src/config/slikairConfig.js');
const { googleAuthConfig } = await import('../src/config/googleAuthConfig.js');
const { kycConfig } = await import('../src/config/kyc.js');
const { smsSettings } = await import('../src/services/smsSettings.js');

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t3';

describe('Task 3: Credential stores multi-tenant isolation', () => {
  let t1, t2;

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await mongoose.connection.dropDatabase();
    t1 = await Tenant.create({ name: 'T1', key: 't1' });
    t2 = await Tenant.create({ name: 'T2', key: 't2' });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('isolates Slikair, Google, KYC and SMS credentials across tenants', async () => {
    await runWithTenant(t1._id, async () => {
      await slikairConfig.update({ merchantId: 'm_t1', secretKey: 'sec_t1' });
      await googleAuthConfig.update({ clientId: 'g_t1.apps.google.com', clientSecret: 'gsec_t1' });
      await kycConfig.save({ SUMSUB_APP_TOKEN: 'sum_t1', SUMSUB_SECRET_KEY: 'sumsec_t1' });
      await smsSettings.update({ 'sms.twilio.accountSid': 'AC_t1', 'sms.twilio.authToken': 'tw_sec_t1' });
    });

    await runWithTenant(t2._id, async () => {
      await slikairConfig.update({ merchantId: 'm_t2', secretKey: 'sec_t2' });
      await googleAuthConfig.update({ clientId: 'g_t2.apps.google.com', clientSecret: 'gsec_t2' });
      await kycConfig.save({ SUMSUB_APP_TOKEN: 'sum_t2', SUMSUB_SECRET_KEY: 'sumsec_t2' });
      await smsSettings.update({ 'sms.twilio.accountSid': 'AC_t2', 'sms.twilio.authToken': 'tw_sec_t2' });
    });

    await runWithTenant(t1._id, async () => {
      const slk = await slikairConfig.getAll();
      assert.equal(slk.merchantId, 'm_t1');
      assert.equal(slk.secretKey, 'sec_t1');

      const g = await googleAuthConfig.getAll();
      assert.equal(g.clientId, 'g_t1.apps.google.com');

      const kycToken = await kycConfig.get('SUMSUB_APP_TOKEN');
      assert.equal(kycToken, 'sum_t1');

      const twilioSid = await smsSettings.plain('sms.twilio.accountSid');
      assert.equal(twilioSid, 'AC_t1');
    });

    await runWithTenant(t2._id, async () => {
      const slk = await slikairConfig.getAll();
      assert.equal(slk.merchantId, 'm_t2');
      assert.equal(slk.secretKey, 'sec_t2');

      const kycToken = await kycConfig.get('SUMSUB_APP_TOKEN');
      assert.equal(kycToken, 'sum_t2');
    });

    const kycDbRow = await Setting.findOne({ tenantId: t1._id, key: 'SUMSUB_SECRET_KEY' }).lean();
    assert.ok(kycDbRow.value.startsWith('enc:v1:'));
  });
});
