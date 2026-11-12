import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Domain from '../src/models/Domain.js';
import Tenant from '../src/models/Tenant.js';
import { getDomainOrigins, invalidateDomainOrigins } from '../src/tenancy/corsDomains.js';

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip4_t6';

describe('Task 6: Dynamic CORS allowlist from Domain', () => {
  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await Domain.deleteMany({});
    await Tenant.deleteMany({});
    const tenant = await Tenant.create({ name: 'T1', key: 't1' });
    await Domain.create({ host: 'operator-a.com', tenantId: tenant._id, isPrimary: true });
    await Domain.create({ host: 'localhost:5173', tenantId: tenant._id });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('generates allowed origins including www apex expansion', async () => {
    invalidateDomainOrigins();
    const origins = await getDomainOrigins({ env: { TENANCY_MODE: 'multi' } });

    assert.ok(origins.has('https://operator-a.com'));
    assert.ok(origins.has('https://www.operator-a.com'));
    assert.ok(origins.has('http://localhost:5173'));
    assert.equal(origins.has('https://malicious-site.com'), false);
  });

  it('single mode keeps the historical CLIENT_URL allowlist and ignores Domain rows', async () => {
    invalidateDomainOrigins();
    const origins = await getDomainOrigins({
      env: {
        TENANCY_MODE: 'single',
        CLIENT_URL: 'https://app.example,https://www.shop.example',
        GAME_HOST_URL: 'https://games.example',
        RAILWAY_PUBLIC_DOMAIN: 'railway.example',
      },
    });

    assert.deepEqual([...origins].sort(), [
      'https://app.example',
      'https://games.example',
      'https://railway.example',
      'https://shop.example',
      'https://www.app.example',
      'https://www.shop.example',
    ].sort());
    assert.equal(origins.has('https://operator-a.com'), false);
    assert.equal(origins.has('http://localhost:5173'), false);
  });
});
