// İP-8 Task 9 — acceptance gate: two tenants, TENANCY_MODE=multi,
// TENANCY_ENFORCEMENT=enforce, driven over real HTTP.
//
// The env is set before the src modules are imported: app.js reads NODE_ENV and
// Role.js reads TENANCY_MODE at module load, so static imports would compile
// them against the wrong mode.
const savedEnv = {
  NODE_ENV: process.env.NODE_ENV,
  TENANCY_MODE: process.env.TENANCY_MODE,
  TENANCY_ENFORCEMENT: process.env.TENANCY_ENFORCEMENT,
  ADMIN_ALLOWED_IPS: process.env.ADMIN_ALLOWED_IPS,
};
process.env.NODE_ENV = 'test';
process.env.TENANCY_MODE = 'multi';
process.env.TENANCY_ENFORCEMENT = 'enforce';
process.env.JWT_SECRET ||= 'ip8_acceptance_player_secret';
process.env.JWT_STAFF_SECRET ||= 'ip8_acceptance_staff_secret';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY ||= 'a'.repeat(64);
delete process.env.ADMIN_ALLOWED_IPS;

import http from 'node:http';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { default: User } = await import('../src/models/User.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { default: Domain } = await import('../src/models/Domain.js');
const { default: Transaction } = await import('../src/models/Transaction.js');
const { default: Role } = await import('../src/models/Role.js');
const { default: Permission } = await import('../src/models/Permission.js');
const { runWithTenant, runAsPlatform } = await import('../src/tenancy/context.js');
const { TenantScopeError } = await import('../src/tenancy/errors.js');
const { readTenancyConfig, validateTenancyStartup } = await import('../src/config/tenancy.js');
const { createApp } = await import('../src/app.js');
const { createSpaFallback } = await import('../src/seo/http.js');
const { buildManifestPayload } = await import('../src/controllers/manifestController.js');
const { getSiteName, setBrandingField, invalidateBranding } = await import('../src/branding/index.js');
const { signAccess } = await import('../src/services/session.js');
const { clearDomainHostCache } = await import('../src/middleware/tenantHost.js');

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip8_t9';
const __dirname = dirname(fileURLToPath(import.meta.url));
// The real client artifact: a neutral <title> the server must replace per tenant.
const INDEX_PATH = join(__dirname, '../../client/index.html');

const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const HOST1 = 'alpha.example.com';
const HOST2 = 'beta.example.com';
const BRAND1 = 'Alpha Configured Brand';
const TENANT_NAME1 = 'Alpha Operator';
const TENANT_NAME2 = 'Beta Operator';
const LEGAL1 = { name: 'Alpha Holdings N.V.', registrationNo: '111/JAZ', address: 'Alpha Way 1' };
const LEGAL2 = { name: 'Beta Entertainment N.V.', registrationNo: '222/JAZ', address: 'Beta Road 2' };

let server;
let port;
let player1;
let player2;
let admin1;
let admin2;
let token1;
let token2;
let adminToken1;
let adminToken2;
let ledger1 = [];
let ledger2 = [];
let secondLedger1;
const calls = [];

/** Real HTTP request with the tenant's Host header; a 5xx is always a failure. */
function request(host, path, { token, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { host };
    if (token) headers.authorization = `Bearer ${token}`;
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        calls.push({ host, path, status: res.statusCode });
        assert.ok(
          res.statusCode < 500,
          `${method} ${path} (Host: ${host}) answered ${res.statusCode}: ${text.slice(0, 400)}`,
        );
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text,
          json: () => JSON.parse(text),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  clearDomainHostCache();

  await Tenant.create([
    { _id: T1, key: 'acceptance-one', name: TENANT_NAME1, status: 'active', legalEntity: LEGAL1 },
    { _id: T2, key: 'acceptance-two', name: TENANT_NAME2, status: 'active', legalEntity: LEGAL2 },
  ]);
  await Domain.create([
    { host: HOST1, tenantId: T1, isPrimary: true, purpose: 'player', verifiedAt: new Date() },
    { host: HOST2, tenantId: T2, isPrimary: true, purpose: 'player', verifiedAt: new Date() },
  ]);

  // T1 configures a site name; T2 leaves it unset and must fall back to its tenant name.
  await runWithTenant(T1, () => setBrandingField('siteName', BRAND1, null));
  invalidateBranding();

  const permission = await Permission.create({
    key: 'admin:users:read', name: 'Read players', category: 'users',
  });
  const role1 = await Role.create({
    name: 'acceptance-admin-one', displayName: 'Acceptance Admin One',
    scopeType: 'tenant', scopeId: T1, permissions: [permission._id],
  });
  const role2 = await Role.create({
    name: 'acceptance-admin-two', displayName: 'Acceptance Admin Two',
    scopeType: 'tenant', scopeId: T2, permissions: [permission._id],
  });

  player1 = await runWithTenant(T1, () => User.create({
    username: 'accept_alpha_player', email: 'player@alpha.example.com',
    password: 'Acceptance#123', balance: 1500,
  }));
  const second1 = await runWithTenant(T1, () => User.create({
    username: 'accept_alpha_second', email: 'second@alpha.example.com',
    password: 'Acceptance#123', balance: 10,
  }));
  admin1 = await runWithTenant(T1, () => User.create({
    username: 'accept_alpha_admin', email: 'admin@alpha.example.com',
    password: 'Acceptance#123', role: 'admin', roles: [role1._id],
  }));

  player2 = await runWithTenant(T2, () => User.create({
    username: 'accept_beta_player', email: 'player@beta.example.com',
    password: 'Acceptance#123', balance: 2750,
  }));
  const second2 = await runWithTenant(T2, () => User.create({
    username: 'accept_beta_second', email: 'second@beta.example.com',
    password: 'Acceptance#123', balance: 20,
  }));
  admin2 = await runWithTenant(T2, () => User.create({
    username: 'accept_beta_admin', email: 'admin@beta.example.com',
    password: 'Acceptance#123', role: 'admin', roles: [role2._id],
  }));

  ledger1 = await runWithTenant(T1, () => Transaction.create([
    {
      userId: player1._id, type: 'deposit', amount: 1000, balanceBefore: 0, balanceAfter: 1000,
      idempotencyKey: 'accept-t1-dep-1', note: 'alpha first deposit',
    },
    {
      userId: player1._id, type: 'deposit', amount: 500, balanceBefore: 1000, balanceAfter: 1500,
      idempotencyKey: 'accept-t1-dep-2', note: 'alpha second deposit',
    },
  ]));
  secondLedger1 = await runWithTenant(T1, () => Transaction.create({
    userId: second1._id, type: 'deposit', amount: 10, balanceBefore: 0, balanceAfter: 10,
    idempotencyKey: 'accept-t1-second', note: 'alpha other player',
  }));
  ledger2 = await runWithTenant(T2, () => Transaction.create([
    {
      userId: player2._id, type: 'deposit', amount: 2750, balanceBefore: 0, balanceAfter: 2750,
      idempotencyKey: 'accept-t2-dep-1', note: 'beta first deposit',
    },
  ]));
  await runWithTenant(T2, () => Transaction.create({
    userId: second2._id, type: 'deposit', amount: 20, balanceBefore: 0, balanceAfter: 20,
    idempotencyKey: 'accept-t2-second', note: 'beta other player',
  }));

  token1 = signAccess(player1);
  token2 = signAccess(player2);
  adminToken1 = signAccess(admin1);
  adminToken2 = signAccess(admin2);

  const app = createApp();
  // client/dist is not built in a source checkout, so the production SPA fallback
  // is mounted here against the real client/index.html.
  app.get('*', createSpaFallback({ indexPath: INDEX_PATH, getSiteName }));
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  clearDomainHostCache();
  invalidateBranding();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('multi mode forces enforce, rejects log/off at startup and throws on unscoped queries', async () => {
  assert.equal(readTenancyConfig({ TENANCY_MODE: 'multi' }).enforcement, 'enforce');
  assert.equal(readTenancyConfig({ TENANCY_MODE: 'multi', TENANCY_ENFORCEMENT: 'log' }).enforcement, 'enforce');

  const base = {
    TENANCY_MODE: 'multi',
    JWT_STAFF_SECRET: 'acceptance-staff-secret',
    OPERATOR_SECRET_ENCRYPTION_KEY: 'a'.repeat(64),
  };
  for (const bad of ['log', 'off']) {
    const problems = validateTenancyStartup({ ...base, TENANCY_ENFORCEMENT: bad });
    assert.ok(
      problems.some(p => p.includes('requires TENANCY_ENFORCEMENT=enforce')),
      `TENANCY_ENFORCEMENT=${bad} must be a startup error, got ${JSON.stringify(problems)}`,
    );
  }
  assert.deepEqual(validateTenancyStartup({ ...base, TENANCY_ENFORCEMENT: 'enforce' }), []);
  assert.deepEqual(validateTenancyStartup(base), []);

  // No ambient context: an unscoped read on a tenant model must throw.
  await assert.rejects(() => User.find({ username: 'accept_alpha_player' }), TenantScopeError);
  await assert.rejects(() => Transaction.countDocuments({}), TenantScopeError);
  // An explicit foreign tenant filter is rejected too, not silently honoured.
  await assert.rejects(
    () => runWithTenant(T1, () => User.find({ tenantId: T2 })),
    TenantScopeError,
  );
});

test('scoped reads stay inside their tenant and never see the other tenant rows', async () => {
  await runWithTenant(T1, async () => {
    const own = await User.findOne({ username: 'accept_alpha_player' });
    assert.equal(String(own._id), String(player1._id));
    assert.equal(String(own.tenantId), String(T1));
    assert.equal(await User.findOne({ username: 'accept_beta_player' }), null);
    assert.equal(await User.countDocuments({}), 3);
  });
  await runWithTenant(T2, async () => {
    const own = await User.findOne({ username: 'accept_beta_player' });
    assert.equal(String(own._id), String(player2._id));
    assert.equal(String(own.tenantId), String(T2));
    assert.equal(await User.findOne({ username: 'accept_alpha_player' }), null);
    assert.equal(await User.countDocuments({}), 3);
  });
  const total = await runAsPlatform('acceptance fixture count', () => User.countDocuments({}));
  assert.equal(total, 6);
});

test('GET /api/users/me returns the requesting tenant player balance only', async () => {
  const res1 = await request(HOST1, '/api/users/me', { token: token1 });
  assert.equal(res1.status, 200);
  const me1 = res1.json().user;
  assert.equal(me1.username, 'accept_alpha_player');
  assert.equal(me1.balance, 1500);
  assert.equal(String(me1.tenantId), String(T1));

  const res2 = await request(HOST2, '/api/users/me', { token: token2 });
  assert.equal(res2.status, 200);
  const me2 = res2.json().user;
  assert.equal(me2.username, 'accept_beta_player');
  assert.equal(me2.balance, 2750);
  assert.equal(String(me2.tenantId), String(T2));

  assert.notEqual(me1.balance, me2.balance);
  assert.ok(!res1.text.includes('accept_beta_player'));
  assert.ok(!res2.text.includes('accept_alpha_player'));
});

test('GET /api/users/me/transactions lists only the own tenant ledger rows', async () => {
  const res1 = await request(HOST1, '/api/users/me/transactions', { token: token1 });
  assert.equal(res1.status, 200);
  const body1 = res1.json();
  assert.equal(body1.total, 2);
  assert.deepEqual(
    body1.transactions.map(t => String(t._id)).sort(),
    ledger1.map(t => String(t._id)).sort(),
  );
  assert.deepEqual(body1.transactions.map(t => t.amount).sort((a, b) => a - b), [500, 1000]);
  for (const tx of body1.transactions) {
    assert.equal(String(tx.userId), String(player1._id));
    assert.equal(String(tx.tenantId), String(T1));
  }
  assert.ok(!res1.text.includes(String(ledger2[0]._id)));
  assert.ok(!res1.text.includes(String(secondLedger1._id)));
  assert.ok(!res1.text.includes('beta first deposit'));

  const res2 = await request(HOST2, '/api/users/me/transactions', { token: token2 });
  assert.equal(res2.status, 200);
  const body2 = res2.json();
  assert.equal(body2.total, 1);
  assert.equal(String(body2.transactions[0]._id), String(ledger2[0]._id));
  assert.equal(body2.transactions[0].amount, 2750);
  assert.equal(String(body2.transactions[0].tenantId), String(T2));
  assert.ok(!res2.text.includes(String(ledger1[0]._id)));
  assert.ok(!res2.text.includes('alpha first deposit'));
});

test('a player token issued for one tenant is rejected on the other tenant host', async () => {
  const cross1 = await request(HOST2, '/api/users/me', { token: token1 });
  assert.equal(cross1.status, 401);
  assert.equal(cross1.json().error.code, 'CROSS_TENANT_TOKEN');

  const cross2 = await request(HOST1, '/api/users/me/transactions', { token: token2 });
  assert.equal(cross2.status, 401);
  assert.equal(cross2.json().error.code, 'CROSS_TENANT_TOKEN');
});

test('GET /api/admin/users lists only the admin tenant players', async () => {
  const res1 = await request(HOST1, '/api/admin/users?limit=50', { token: adminToken1 });
  assert.equal(res1.status, 200);
  const body1 = res1.json();
  assert.equal(body1.total, 3);
  assert.deepEqual(
    body1.users.map(u => u.username).sort(),
    ['accept_alpha_admin', 'accept_alpha_player', 'accept_alpha_second'],
  );
  for (const row of body1.users) assert.equal(String(row.tenantId), String(T1));

  const res2 = await request(HOST2, '/api/admin/users?limit=50', { token: adminToken2 });
  assert.equal(res2.status, 200);
  const body2 = res2.json();
  assert.equal(body2.total, 3);
  assert.deepEqual(
    body2.users.map(u => u.username).sort(),
    ['accept_beta_admin', 'accept_beta_player', 'accept_beta_second'],
  );
  for (const row of body2.users) assert.equal(String(row.tenantId), String(T2));

  const names1 = new Set(body1.users.map(u => u.username));
  assert.ok(body2.users.every(u => !names1.has(u.username)));
  assert.ok(!res1.text.includes('accept_beta_player'));
  assert.ok(!res2.text.includes('accept_alpha_player'));

  // An admin token is a player-family token: it cannot cross hosts either.
  const crossAdmin = await request(HOST2, '/api/admin/users', { token: adminToken1 });
  assert.equal(crossAdmin.status, 401);
  assert.equal(crossAdmin.json().error.code, 'CROSS_TENANT_TOKEN');
});

test('GET /manifest.webmanifest carries the requesting tenant brand', async () => {
  const res1 = await request(HOST1, '/manifest.webmanifest');
  assert.equal(res1.status, 200);
  assert.ok(res1.headers['content-type'].includes('application/manifest+json'));
  const m1 = res1.json();
  assert.equal(m1.name, BRAND1);
  assert.equal(m1.short_name, BRAND1);
  assert.equal(m1.start_url, '/');
  assert.ok(Array.isArray(m1.icons) && m1.icons.length >= 4);
  assert.ok(!res1.text.includes(TENANT_NAME2));

  const res2 = await request(HOST2, '/manifest.webmanifest');
  assert.equal(res2.status, 200);
  const m2 = res2.json();
  // No site name configured: the tenant name is the fallback, never a product name.
  assert.equal(m2.name, TENANT_NAME2);
  assert.equal(m2.short_name, TENANT_NAME2);
  assert.ok(!res2.text.includes(BRAND1));
  assert.notEqual(m1.name, m2.name);

  const direct1 = await runWithTenant(T1, () => buildManifestPayload());
  const direct2 = await runWithTenant(T2, () => buildManifestPayload());
  assert.equal(direct1.name, BRAND1);
  assert.equal(direct2.name, TENANT_NAME2);
});

test('GET / renders the tenant title and OpenGraph tags into index.html', async () => {
  const res1 = await request(HOST1, '/');
  assert.equal(res1.status, 200);
  assert.ok(res1.headers['content-type'].includes('text/html'));
  assert.match(res1.text, new RegExp(`<title>${BRAND1}</title>`));
  assert.match(res1.text, new RegExp(`property="og:site_name" content="${BRAND1}"`));
  assert.match(res1.text, new RegExp(`property="og:title" content="${BRAND1}"`));
  assert.match(res1.text, new RegExp(`property="og:url" content="http://${HOST1}/"`));
  assert.equal((res1.text.match(/<title>/g) || []).length, 1);
  assert.ok(!res1.text.includes(TENANT_NAME2));
  assert.ok(!res1.text.includes(HOST2));
  assert.ok(!res1.text.includes('<title>Platform</title>'));

  const res2 = await request(HOST2, '/');
  assert.equal(res2.status, 200);
  assert.match(res2.text, new RegExp(`<title>${TENANT_NAME2}</title>`));
  assert.match(res2.text, new RegExp(`property="og:site_name" content="${TENANT_NAME2}"`));
  assert.match(res2.text, new RegExp(`property="og:url" content="http://${HOST2}/"`));
  assert.equal((res2.text.match(/<title>/g) || []).length, 1);
  assert.ok(!res2.text.includes(BRAND1));
  assert.ok(!res2.text.includes(HOST1));
});

test('GET /api/branding serves the tenant legal entity and name', async () => {
  const res1 = await request(HOST1, '/api/branding');
  assert.equal(res1.status, 200);
  const body1 = res1.json();
  assert.equal(body1.tenantName, TENANT_NAME1);
  assert.deepEqual(body1.legalEntity, LEGAL1);
  assert.equal(body1.values.siteName, BRAND1);
  assert.ok(!res1.text.includes(LEGAL2.name));
  assert.ok(!res1.text.includes(TENANT_NAME2));

  const res2 = await request(HOST2, '/api/branding');
  assert.equal(res2.status, 200);
  const body2 = res2.json();
  assert.equal(body2.tenantName, TENANT_NAME2);
  assert.deepEqual(body2.legalEntity, LEGAL2);
  assert.equal(body2.values.siteName, TENANT_NAME2);
  assert.ok(!res2.text.includes(LEGAL1.name));
  assert.ok(!res2.text.includes(BRAND1));
});

test('an unregistered host never reaches a tenant', async () => {
  const api = await request('unknown.example.com', '/api/branding');
  assert.equal(api.status, 404);
  assert.equal(api.json().error, 'TENANT_NOT_FOUND');

  const page = await request('unknown.example.com', '/');
  assert.equal(page.status, 404);
  assert.equal(page.json().error, 'TENANT_NOT_FOUND');

  // An unverified domain is not a tenant binding either (spec §9 G-11).
  await Domain.create({ host: 'pending.example.com', tenantId: T1, verifiedAt: null });
  clearDomainHostCache();
  const pending = await request('pending.example.com', '/api/branding');
  assert.equal(pending.status, 404);
  assert.equal(pending.json().error, 'TENANT_NOT_FOUND');
});

test('every acceptance request stayed inside its tenant without a scope failure', async () => {
  assert.ok(calls.length >= 15, `expected a full HTTP sweep, got ${calls.length} requests`);
  assert.ok(calls.some(c => c.host === HOST1));
  assert.ok(calls.some(c => c.host === HOST2));
  assert.deepEqual(calls.filter(c => c.status >= 500), []);
});
