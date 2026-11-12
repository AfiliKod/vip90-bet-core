import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Tenant from '../src/models/Tenant.js';
import Domain from '../src/models/Domain.js';
import { evaluateGoLiveChecklist } from '../src/platform/services/goLiveChecklist.js';

const TEST_MONGO_URI = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9a_t6';

test.before(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(TEST_MONGO_URI);
  await mongoose.connection.dropDatabase();
});

test.after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('evaluateGoLiveChecklist reports incomplete gates for newly provisioned tenant', async () => {
  const tenant = await Tenant.create({
    key: 'eps',
    name: 'Eps Casino',
    status: 'provisioning',
  });

  const checklist = await evaluateGoLiveChecklist(tenant._id);
  assert.equal(checklist.allPassed, false);
  assert.equal(checklist.gates.legalEntity.passed, false);
  assert.equal(checklist.gates.domainTls.passed, false);
});

test('evaluateGoLiveChecklist passes when all 6 gates are satisfied including K22 provider approval', async () => {
  const tenant = await Tenant.create({
    key: 'zeta',
    name: 'Zeta Casino',
    status: 'provisioning',
    legalEntity: { name: 'Zeta Corp', registrationNo: '112233', address: 'Malta' },
    providerApproval: { approved: true, approvedAt: new Date(), documentRef: 'AGREEMENT-2026-01' },
    checklist: { pspVerified: true, kycVerified: true, emailVerified: true },
  });

  await Domain.create({
    host: 'zeta.example.com',
    tenantId: tenant._id,
    isPrimary: true,
    verifiedAt: new Date(),
    tls: { status: 'active', provider: 'cloudflare' },
  });

  const checklist = await evaluateGoLiveChecklist(tenant._id);
  assert.equal(checklist.allPassed, true);
});
test('provider approval is required only for tenants with a casino content module', async () => {
  const { evaluateGoLiveChecklist } = await import('../src/platform/services/goLiveChecklist.js');
  const plain = await Tenant.create({ key: 'kappa', name: 'Kappa', status: 'provisioning' });
  assert.equal((await evaluateGoLiveChecklist(plain._id)).gates.providerApproval.passed, true);
  const casino = await Tenant.create({ key: 'lambda', name: 'Lambda', status: 'provisioning', entitlements: { modules: ['casino-content'] } });
  assert.equal((await evaluateGoLiveChecklist(casino._id)).gates.providerApproval.passed, false);
});
