import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.TENANCY_MODE = 'single';
const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip9c_t9_single';
const { createApp } = await import('../src/app.js');

let server;
let base;
before(async () => {
  await mongoose.connect(TEST_DB);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('single mode serves no billing, report or partner statement routes', async () => {
  for (const path of [
    '/api/platform/billing/statements',
    '/api/platform/reports/cross-tenant?from=2026-11-01&to=2026-11-30',
    '/api/partner/statements',
  ]) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 404, path);
  }
});
