process.env.TENANCY_MODE = 'multi';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY ||= 'a'.repeat(64);

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { default: Setting } = await import('../src/models/Setting.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { runWithTenant } = await import('../src/tenancy/context.js');
const { emailConfig } = await import('../src/config/emailConfig.js');
const { sendEmail, getSender, _setCreateTransport, _resetEmailTransportersForTests } = await import('../src/services/email.js');
const { runSettingsMigration } = await import('../src/tenancy/settingsMigration.js');

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t7';

describe('Task 7: Per-tenant e-mail transporter pool', () => {
  let t1, t2;
  const transportsCreated = [];

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await mongoose.connection.dropDatabase();
    await runSettingsMigration({ connection: mongoose.connection });
    t1 = await Tenant.create({ name: 'Tenant 1', key: 't1' });
    t2 = await Tenant.create({ name: 'Tenant 2', key: 't2' });

    _setCreateTransport((opts) => {
      transportsCreated.push(opts);
      return {
        sendMail: async (mail) => ({ messageId: `msg-${opts.host}-${Date.now()}`, mail }),
      };
    });
  });

  after(async () => {
    _resetEmailTransportersForTests();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('creates two distinct transporters for two tenants with different SMTP settings', async () => {
    // Configure T1 SMTP
    await runWithTenant(t1._id, async () => {
      await emailConfig.update({
        host: 'smtp.tenant1.test',
        port: '587',
        user: 'user_t1',
        pass: 'pass_t1',
        from: 'noreply@tenant1.test',
        fromName: 'Brand One',
      });
    });

    // Configure T2 SMTP
    await runWithTenant(t2._id, async () => {
      await emailConfig.update({
        host: 'smtp.tenant2.test',
        port: '465',
        secure: 'true',
        user: 'user_t2',
        pass: 'pass_t2',
        from: 'noreply@tenant2.test',
        fromName: 'Brand Two',
      });
    });

    // Send from T1
    await runWithTenant(t1._id, async () => {
      const res = await sendEmail({ to: 'player@example.com', subject: 'T1 Welcome', html: '<p>T1</p>' });
      assert.ok(res.messageId.includes('smtp.tenant1.test'));
    });

    // Send from T2
    await runWithTenant(t2._id, async () => {
      const res = await sendEmail({ to: 'player@example.com', subject: 'T2 Welcome', html: '<p>T2</p>' });
      assert.ok(res.messageId.includes('smtp.tenant2.test'));
    });

    assert.equal(transportsCreated.length, 2);
    assert.equal(transportsCreated[0].host, 'smtp.tenant1.test');
    assert.equal(transportsCreated[1].host, 'smtp.tenant2.test');
    assert.equal(transportsCreated[1].secure, true);
  });

  it('changing Tenant 1 settings invalidates only Tenant 1 transporter while preserving Tenant 2', async () => {
    // Update T1 port and pass
    await runWithTenant(t1._id, async () => {
      await emailConfig.update({
        port: '2525',
        pass: 'new_pass_t1',
      });
    });

    // Send from T2 again - should reuse existing transporter (no new transport created)
    await runWithTenant(t2._id, async () => {
      const res = await sendEmail({ to: 'player@example.com', subject: 'T2 Again', html: '<p>T2</p>' });
      assert.ok(res.messageId.includes('smtp.tenant2.test'));
    });
    assert.equal(transportsCreated.length, 2, 'T2 transporter should be preserved without recreation');

    // Send from T1 again - should create a new transporter with updated port
    await runWithTenant(t1._id, async () => {
      const res = await sendEmail({ to: 'player@example.com', subject: 'T1 Updated', html: '<p>T1</p>' });
      assert.ok(res.messageId.includes('smtp.tenant1.test'));
    });
    assert.equal(transportsCreated.length, 3, 'T1 transporter should be recreated with new settings');
    assert.equal(transportsCreated[2].port, 2525);
  });

  it('multi-mode env protection: unconfigured tenant resolves to mode none and does not leak host env', async () => {
    const unconfiguredTenant = await Tenant.create({ name: 'Tenant Unconfigured', key: 't-unconfigured' });
    const originalHost = process.env.SMTP_HOST;
    const originalPass = process.env.SMTP_PASS;
    process.env.SMTP_HOST = 'smtp.host-leak-attempt.test';
    process.env.SMTP_PASS = 'host-leak-pass';

    try {
      await runWithTenant(unconfiguredTenant._id, async () => {
        const senderInfo = await getSender();
        assert.equal(senderInfo.mode, 'none', 'unconfigured tenant in multi mode must resolve to mode none');
        assert.equal(senderInfo.sender, null);

        const res = await sendEmail({ to: 'player@example.com', subject: 'Unconfigured', html: '<p>None</p>' });
        assert.equal(res.mock, true, 'unconfigured tenant in multi mode falls back to mock delivery');
      });
    } finally {
      if (originalHost === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = originalHost;
      if (originalPass === undefined) delete process.env.SMTP_PASS; else process.env.SMTP_PASS = originalPass;
    }
  });

  it('sendEmail accepts tenantId explicitly in options', async () => {
    // Call sendEmail without ambient tenant context but with explicit tenantId: t2._id
    const res = await sendEmail({
      to: 'player@example.com',
      subject: 'Explicit TenantId',
      html: '<p>Explicit</p>',
      tenantId: t2._id,
    });
    assert.ok(res.messageId.includes('smtp.tenant2.test'));
  });
});
