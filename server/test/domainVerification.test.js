import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Domain from '../src/models/Domain.js';
import Tenant from '../src/models/Tenant.js';
import { verifyDomainDns, syncDomainTls } from '../src/platform/services/domainService.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t5';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('verifyDomainDns marks domain as verified when TXT record matches token', async () => {
  const tenant = await Tenant.create({ key: 'delta', name: 'Delta' });
  const domain = await Domain.create({
    host: 'delta.example.com',
    tenantId: tenant._id,
    txtVerificationToken: 'challenge-token-12345',
    verifiedAt: null,
  });

  const fakeResolver = async (hostname) => {
    if (hostname === '_domain-verify.delta.example.com' || hostname === 'delta.example.com') {
      return [['challenge-token-12345']];
    }
    return [];
  };

  const result = await verifyDomainDns(domain._id, { resolver: fakeResolver });
  assert.equal(result.verified, true);

  const updated = await Domain.findById(domain._id);
  assert.ok(updated.verifiedAt instanceof Date);
});

test('syncDomainTls updates tls status from Cloudflare for SaaS client', async () => {
  const domain = await Domain.findOne({ host: 'delta.example.com' });

  const fakeCfClient = {
    async getCustomHostnameStatus() {
      return { status: 'active', ssl: { status: 'active' } };
    },
  };

  const tlsResult = await syncDomainTls(domain._id, { cfClient: fakeCfClient });
  assert.equal(tlsResult.status, 'active');

  const updated = await Domain.findById(domain._id);
  assert.equal(updated.tls.status, 'active');
});
