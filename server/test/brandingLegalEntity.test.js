import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import brandingRoutes from '../src/routes/branding.js';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant } from '../src/tenancy/context.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip8_t7_legal';
const T1 = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(TEST_DB);
  await Tenant.deleteMany({});
  await Tenant.create({
    _id: T1,
    key: 'custom-tenant',
    name: 'Custom Operator',
    isDefault: false,
    status: 'active',
    legalEntity: {
      name: 'Custom Gaming N.V.',
      registrationNo: '12345/JAZ',
      address: 'Kaya Grandi 24, Bonaire',
    },
  });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('GET /api/branding includes legalEntity and tenantName for current tenant', async () => {
  const app = express();
  app.use((req, res, next) => {
    runWithTenant(T1, next);
  });
  app.use('/api/branding', brandingRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/branding`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.values);
    assert.equal(body.tenantName, 'Custom Operator');
    assert.equal(body.legalEntity?.name, 'Custom Gaming N.V.');
    assert.equal(body.legalEntity?.registrationNo, '12345/JAZ');
    assert.equal(body.legalEntity?.address, 'Kaya Grandi 24, Bonaire');
  } finally {
    server.close();
  }
});