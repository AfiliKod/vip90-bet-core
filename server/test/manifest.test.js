import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import { buildManifestPayload } from '../src/controllers/manifestController.js';
import manifestRoutes from '../src/routes/manifest.js';
import Tenant from '../src/models/Tenant.js';
import Brand from '../src/models/Brand.js';
import { runWithTenant } from '../src/tenancy/context.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip8_t5_manifest';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

before(async () => {
  await mongoose.connect(TEST_DB);
  await Tenant.deleteMany({});
  await Tenant.create([
    { _id: T1, key: 'tenant-one', name: 'Alpha Bet', isDefault: true, status: 'active' },
    { _id: T2, key: 'tenant-two', name: 'Beta Gaming', isDefault: false, status: 'active' },
  ]);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('buildManifestPayload generates tenant-specific manifest with correct name and theme color', async () => {
  const m1 = await runWithTenant(T1, () => buildManifestPayload({ siteName: 'Alpha Bet', primaryColor: '#10b981' }));
  assert.equal(m1.name, 'Alpha Bet');
  assert.equal(m1.short_name, 'Alpha Bet');
  assert.equal(m1.theme_color, '#10b981');
  assert.equal(m1.display, 'standalone');
  assert.ok(Array.isArray(m1.icons) && m1.icons.length >= 4);

  const m2 = await runWithTenant(T2, () => buildManifestPayload({ siteName: 'Beta Gaming', primaryColor: '#3b82f6' }));
  assert.equal(m2.name, 'Beta Gaming');
  assert.equal(m2.short_name, 'Beta Gaming');
  assert.equal(m2.theme_color, '#3b82f6');
});

test('manifest endpoint serves application/manifest+json with no-cache headers', async () => {
  const app = express();
  app.use((req, res, next) => {
    req.tenant = { id: T1, host: 'alpha.example.com' };
    runWithTenant(T1, next);
  });
  app.use(manifestRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/manifest.webmanifest`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('application/manifest+json'));
    const body = await res.json();
    assert.equal(body.name, 'Alpha Bet');
  } finally {
    server.close();
  }
});
