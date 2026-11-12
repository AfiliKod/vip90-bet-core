import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Domain from '../src/models/Domain.js';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getTenantBaseUrl, invalidateTenantBaseUrl } from '../src/tenancy/tenantBaseUrl.js';

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t5';

describe('Task 5: getTenantBaseUrl and Domain resolution', () => {
  let t1, t2;

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await Domain.deleteMany({});
    await Tenant.deleteMany({});
    t1 = await Tenant.create({ name: 'Tenant 1', key: 't1' });
    t2 = await Tenant.create({ name: 'Tenant 2', key: 't2' });

    await Domain.create({ host: 'tenant1.bet', tenantId: t1._id, isPrimary: true, verifiedAt: new Date() });
    await Domain.create({ host: 'tenant2.bet', tenantId: t2._id, isPrimary: true, verifiedAt: new Date() });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('multi mode: resolves the verified primary domain in tenant context', async () => {
    invalidateTenantBaseUrl();
    const prevMode = process.env.TENANCY_MODE;
    process.env.TENANCY_MODE = 'multi';
    try {
    await runWithTenant(t1._id, async () => {
      const url = await getTenantBaseUrl();
      assert.equal(url, 'https://tenant1.bet');
    });

    await runWithTenant(t2._id, async () => {
      const url = await getTenantBaseUrl();
      assert.equal(url, 'https://tenant2.bet');
    });
    } finally {
      if (prevMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = prevMode;
      invalidateTenantBaseUrl();
    }
  });

  it('single mode: always the first CLIENT_URL origin, even when Domain rows exist (parity)', async () => {
    invalidateTenantBaseUrl();
    const prev = { m: process.env.TENANCY_MODE, c: process.env.CLIENT_URL };
    process.env.TENANCY_MODE = 'single';
    process.env.CLIENT_URL = 'https://app.example.com,https://www.example.com';
    try {
      const url = await runWithTenant(t1._id, () => getTenantBaseUrl());
      assert.equal(url, 'https://app.example.com');
    } finally {
      if (prev.m === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = prev.m;
      if (prev.c === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = prev.c;
    }
  });

  it('falls back to CLIENT_URL in single mode when no domain exists', async () => {
    invalidateTenantBaseUrl();
    const prevEnv = process.env.TENANCY_MODE;
    process.env.TENANCY_MODE = 'single';
    process.env.CLIENT_URL = 'https://fallback.vip90.bet,https://admin.vip90.bet';

    const unassignedId = new mongoose.Types.ObjectId();
    const url = await getTenantBaseUrl(unassignedId);
    assert.equal(url, 'https://fallback.vip90.bet');

    process.env.TENANCY_MODE = prevEnv;
  });
});
