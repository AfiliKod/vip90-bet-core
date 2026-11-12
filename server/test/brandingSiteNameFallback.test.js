process.env.NODE_ENV = 'test';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import Tenant from '../src/models/Tenant.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';
import { getSiteName, setBrandingField, invalidateBranding } from '../src/branding/index.js';
import web3AuthRoutes from '../src/routes/web3Auth.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip8_t8';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const DEFAULT = new mongoose.Types.ObjectId();

let savedMode;

before(async () => {
  savedMode = process.env.TENANCY_MODE;
  process.env.TENANCY_MODE = 'multi';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  await Tenant.create([
    { _id: T1, key: 'tenant-one', name: 'Alpha Operator', status: 'active' },
    { _id: T2, key: 'tenant-two', name: 'Beta Operator', status: 'active' },
    { _id: DEFAULT, key: 'default', name: 'Default Tenant', isDefault: true, status: 'active' },
  ]);
});

after(async () => {
  setDefaultTenantId(null);
  if (savedMode === undefined) delete process.env.TENANCY_MODE;
  else process.env.TENANCY_MODE = savedMode;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('configured branding siteName wins over the tenant name', async () => {
  await runWithTenant(T1, async () => {
    await setBrandingField('siteName', 'Configured Brand', null);
    assert.equal(await getSiteName(), 'Configured Brand');
  });
});

test('unset siteName falls back to the current tenant name', async () => {
  await runWithTenant(T2, async () => {
    assert.equal(await getSiteName(), 'Beta Operator');
  });
});

const INSTALL_HOST = new URL((process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim()).hostname;

test('multi mode without tenant context falls back to the install host, never a product name', async () => {
  invalidateBranding();
  assert.equal(await getSiteName(), INSTALL_HOST);
});

test('single mode without ambient context falls back to the default tenant name', async () => {
  process.env.TENANCY_MODE = 'single';
  try {
    setDefaultTenantId(DEFAULT);
    invalidateBranding();
    assert.equal(await getSiteName(), 'Default Tenant');
    setDefaultTenantId(null);
    invalidateBranding();
    assert.equal(await getSiteName(), INSTALL_HOST);
  } finally {
    process.env.TENANCY_MODE = 'multi';
  }
});

test('wallet nonce message uses the install host when no brand name is available', async () => {
  invalidateBranding();
  const app = express();
  app.use(express.json());
  app.use(web3AuthRoutes);
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: `0x${'ab'.repeat(20)}` }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.message.startsWith(`${INSTALL_HOST} Girişi`), `message: ${body.message}`);
  } finally {
    server.close();
  }
});