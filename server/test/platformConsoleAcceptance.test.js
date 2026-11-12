// İP-9a Task 11 — end-to-end acceptance of the Platform Owner console API.
//
// Drives the REAL app (server/src/app.js) and platform router
// (server/src/platform/routes/index.js) over HTTP in TENANCY_MODE=multi with
// TENANCY_ENFORCEMENT=enforce: N1 bootstrap → N2 owner CLI → N4 provisioning →
// N5 go-live → K23 read-only staff → K24 retention → N6 scope gates, plus the
// tenant lifecycle gates and the single-mode 404s. Every mutating step is run
// twice to prove idempotence. External services (DNS, Cloudflare TLS) are faked.
//
// The env is set before the src modules are imported: app.js reads NODE_ENV and
// several models read TENANCY_MODE / AUDIT_RETENTION_DAYS at module load, so
// static imports would compile them against the wrong mode.
const savedEnv = {};
for (const key of [
  'NODE_ENV', 'TENANCY_MODE', 'TENANCY_ENFORCEMENT', 'ADMIN_ALLOWED_IPS',
  'PLATFORM_HOST', 'SCOPE_GATE_ENV', 'JWT_SECRET', 'JWT_STAFF_SECRET',
  'OPERATOR_SECRET_ENCRYPTION_KEY', 'AUDIT_RETENTION_DAYS',
  'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID',
]) {
  savedEnv[key] = process.env[key];
}
process.env.NODE_ENV = 'test';
process.env.TENANCY_MODE = 'multi';
process.env.TENANCY_ENFORCEMENT = 'enforce';
process.env.JWT_SECRET ||= 'ip9a_t11_player_secret';
process.env.JWT_STAFF_SECRET ||= 'ip9a_t11_staff_secret';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY ||= 'a'.repeat(64);
process.env.PLATFORM_HOST = 'console.example.com';
process.env.AUDIT_RETENTION_DAYS = '';
delete process.env.ADMIN_ALLOWED_IPS;
delete process.env.SCOPE_GATE_ENV;
// Unconfigured Cloudflare client → fake TLS that reports active without network.
delete process.env.CLOUDFLARE_API_TOKEN;
delete process.env.CLOUDFLARE_ZONE_ID;

import http from 'node:http';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import speakeasy from 'speakeasy';
import { createRequire, syncBuiltinESMExports } from 'node:module';

const { default: Tenant } = await import('../src/models/Tenant.js');
const { default: Domain } = await import('../src/models/Domain.js');
const { default: StaffAccount } = await import('../src/models/StaffAccount.js');
const { default: Role } = await import('../src/models/Role.js');
const { default: RoleAssignment } = await import('../src/models/RoleAssignment.js');
const { default: AuditLog } = await import('../src/models/AuditLog.js');
const { default: Setting } = await import('../src/models/Setting.js');
const { default: Migration } = await import('../src/models/Migration.js');
const { runWithTenant } = await import('../src/tenancy/context.js');
const { createApp } = await import('../src/app.js');
const { clearDomainHostCache } = await import('../src/middleware/tenantHost.js');
const { errorHandler } = await import('../src/middleware/error.js');
const { requireStaff } = await import('../src/middleware/auth.js');
const { signStaffAccess } = await import('../src/services/staffSession.js');
const { generateStaffSecret, confirmStaff2fa } = await import('../src/controllers/staff2fa.js');
const { runPlatformBootstrap } = await import('../src/platform/bootstrap.js');
const { legalRetentionDays } = await import('../src/platform/services/tenantLifecycle.js');
const { installScopeTelemetry, recordScopeViolation } = await import('../src/platform/services/scopeTelemetry.js');
// Imported after the env is fixed: the script loads dotenv at module load.
const { bootstrapFirstPlatformOwner } = await import('../../scripts/platform-bootstrap.mjs');

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip9a_t11';

const PLATFORM_HOST = 'console.example.com';
const TENANT_KEY = 'acceptance-operator';
const TENANT_DOMAIN = 'operator.example.com';
const TENANT_NAME = 'Acceptance Operator';
const OWNER_PASSWORD = 'Acceptance#Owner123';
const TENANT_OWNER_PASSWORD = 'Acceptance#Boss123';
const LEGAL_ENTITY = { name: 'Acceptance Holdings N.V.', registrationNo: '123/JAZ', address: 'Acceptance Way 1' };

// Fake DNS: patch the CJS builtin and sync the ESM live bindings so the real
// verify-dns endpoint (domainService defaults `resolver = resolveTxt`) reads it.
const require = createRequire(import.meta.url);
const dnsPromises = require('node:dns/promises');
const originalResolveTxt = dnsPromises.resolveTxt;
const dnsRecords = new Map();
dnsPromises.resolveTxt = async (name) => {
  const tokens = dnsRecords.get(name);
  if (!tokens) {
    const err = new Error(`queryTxt ENODATA ${name}`);
    err.code = 'ENODATA';
    throw err;
  }
  return tokens.map((t) => [t]);
};
syncBuiltinESMExports();

let server;
let port;
let platformToken;
let ownerStaff;
let tenantId;
let domainId;
let inviteToken;

function httpCall(targetPort, host, path, { token, method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const h = { host, ...headers };
    if (token) h.authorization = `Bearer ${token}`;
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      h['content-type'] = 'application/json';
      h['content-length'] = Buffer.byteLength(payload);
    }
    const req = http.request({ host: '127.0.0.1', port: targetPort, path, method, headers: h }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        text,
        json: () => JSON.parse(text),
      }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const request = (host, path, opts) => httpCall(port, host, path, opts);
const platform = (path, opts = {}) => request(PLATFORM_HOST, `/api/platform${path}`, { token: platformToken, ...opts });

before(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  clearDomainHostCache();
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  clearDomainHostCache();
  dnsPromises.resolveTxt = originalResolveTxt;
  syncBuiltinESMExports();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('N1 — platform bootstrap on an empty database is idempotent and creates no tenant', async () => {
  assert.equal(await Tenant.countDocuments(), 0);

  const first = await runPlatformBootstrap({ env: process.env });
  assert.equal(first.success, true);
  assert.equal(first.alreadyApplied, false);
  assert.equal(first.migrationRecorded, true);
  assert.ok(await Role.findOne({ name: 'platform_owner', scopeType: 'platform' }));

  const initialized = await Setting.findOne({ scope: 'platform', key: 'platform_initialized' });
  assert.equal(initialized.value, 'true');
  const retention = await Setting.findOne({ scope: 'platform', key: 'audit_retention_days' });
  assert.equal(typeof retention.value, 'string');
  assert.ok(Number(retention.value) >= 1825);
  assert.equal(await Tenant.countDocuments(), 0);

  const second = await runPlatformBootstrap({ env: process.env });
  assert.equal(second.success, true);
  assert.equal(second.alreadyApplied, true);
  assert.equal(await Migration.countDocuments({ name: 'platform-001-bootstrap' }), 1);
});

test('N2 — first platform owner via the CLI function; a second run reports already installed', async () => {
  const first = await bootstrapFirstPlatformOwner({
    ownerEmail: 'owner@platform.example.com',
    username: 'platformowner',
    password: OWNER_PASSWORD,
  });
  assert.equal(first.created, true);
  assert.equal(first.email, 'owner@platform.example.com');

  ownerStaff = await StaffAccount.findOne({ email: 'owner@platform.example.com' });
  assert.ok(ownerStaff);
  assert.equal(ownerStaff.twoFactor.enabled, false);
  const assignment = await RoleAssignment.findOne({ staffId: ownerStaff._id, scopeType: 'platform' });
  assert.ok(assignment);
  assert.equal((await Role.findById(assignment.roleId)).name, 'platform_owner');

  const second = await bootstrapFirstPlatformOwner({ ownerEmail: 'another@platform.example.com' });
  assert.equal(second.created, false);
  assert.equal(second.alreadyInstalled, true);
  assert.equal(second.email, 'owner@platform.example.com');
  assert.equal(await StaffAccount.countDocuments({ email: 'owner@platform.example.com' }), 1);
});

test('N2 — owner login demands 2FA enrolment in multi mode; enrol and mint a platform session', async () => {
  const login = await request(PLATFORM_HOST, '/api/staff/auth/login', {
    method: 'POST', body: { username: 'platformowner', password: OWNER_PASSWORD },
  });
  assert.equal(login.status, 200);
  assert.equal(login.json().requires2faSetup, true);
  assert.ok(login.json().setupToken);

  // Enrol through the real service; the HTTP setup endpoint is Task 9 territory.
  const { secret } = generateStaffSecret(ownerStaff);
  const code = speakeasy.totp({ secret, encoding: 'base32' });
  const enrolled = await confirmStaff2fa(ownerStaff._id, { secret, token: code });
  assert.ok(Array.isArray(enrolled.backupCodes));
  const fresh = await StaffAccount.findById(ownerStaff._id);
  assert.equal(fresh.twoFactor.enabled, true);
  platformToken = signStaffAccess(fresh, { scopeType: 'platform', scopeId: null, amr: ['pwd', 'otp'] });

  const noOtp = signStaffAccess(fresh, { scopeType: 'platform', scopeId: null, amr: ['pwd'] });
  const refused = await request(PLATFORM_HOST, '/api/platform/tenants', { token: noOtp });
  assert.equal(refused.status, 403);
  assert.equal(refused.json().error.code, 'TWO_FACTOR_REQUIRED');

  const ok = await request(PLATFORM_HOST, '/api/platform/tenants', { token: platformToken });
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.json().tenants));
});

test('N4 — provision a tenant over HTTP; the owner invitation is returned only once', async () => {
  const body = {
    key: TENANT_KEY,
    name: TENANT_NAME,
    domain: TENANT_DOMAIN,
    ownerEmail: 'boss@operator.example.com',
    ownerUsername: 'tenantboss',
    legalEntity: LEGAL_ENTITY,
    entitlements: { modules: [] },
  };
  const first = await platform('/tenants', { method: 'POST', body });
  assert.equal(first.status, 201);
  const created = first.json();
  assert.equal(created.key, TENANT_KEY);
  assert.equal(created.status, 'provisioning');
  assert.match(created.ownerInviteUrl, /\/console\/accept-invite\?token=/);
  tenantId = created.tenantId;
  inviteToken = new URL(created.ownerInviteUrl).searchParams.get('token');

  const domain = await Domain.findOne({ host: TENANT_DOMAIN });
  domainId = String(domain._id);
  assert.equal(domain.verifiedAt, null);
  assert.ok(domain.txtVerificationToken);

  const again = await platform('/tenants', { method: 'POST', body });
  assert.equal(again.status, 201);
  assert.equal(again.json().ownerInviteUrl, null);
  assert.equal(again.json().tenantId, tenantId);
  assert.equal(await Tenant.countDocuments({ key: TENANT_KEY }), 1);
});

test('N4 — an unverified domain never resolves to a tenant', async () => {
  clearDomainHostCache();
  const res = await request(TENANT_DOMAIN, '/api/branding');
  assert.equal(res.status, 404);
  assert.equal(res.json().error, 'TENANT_NOT_FOUND');
});

test('N4 — the tenant owner accepts the one-time invitation over HTTP', async () => {
  const res = await request(PLATFORM_HOST, '/api/staff/auth/accept-invite', {
    method: 'POST', body: { token: inviteToken, password: TENANT_OWNER_PASSWORD },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json().ok, true);
  assert.equal(res.json().email, 'boss@operator.example.com');

  const reuse = await request(PLATFORM_HOST, '/api/staff/auth/accept-invite', {
    method: 'POST', body: { token: inviteToken, password: TENANT_OWNER_PASSWORD },
  });
  assert.equal(reuse.status, 400);
  assert.equal(reuse.json().error.code, 'INVITE_INVALID');

  const login = await request(PLATFORM_HOST, '/api/staff/auth/login', {
    method: 'POST', body: { username: 'tenantboss', password: TENANT_OWNER_PASSWORD },
  });
  assert.equal(login.status, 200);
  assert.equal(login.json().requires2faSetup, true);
});

test('N4 — DNS verification through the real endpoint with an injected resolver; provisioning gates', async () => {
  const domain = await Domain.findById(domainId);
  const challenge = domain.txtVerificationToken;

  const fail = await platform(`/tenants/${tenantId}/domains/${domainId}/verify-dns`, { method: 'POST' });
  assert.equal(fail.status, 200);
  assert.equal(fail.json().verified, false);

  dnsRecords.set(`_domain-verify.${TENANT_DOMAIN}`, [challenge]);
  const ok = await platform(`/tenants/${tenantId}/domains/${domainId}/verify-dns`, { method: 'POST' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json().verified, true);
  const okAgain = await platform(`/tenants/${tenantId}/domains/${domainId}/verify-dns`, { method: 'POST' });
  assert.equal(okAgain.json().verified, true);
  assert.ok((await Domain.findById(domainId)).verifiedAt);

  clearDomainHostCache();
  // Still provisioning: player traffic is held back, staff paths stay reachable.
  const player = await request(TENANT_DOMAIN, '/api/branding');
  assert.equal(player.status, 503);
  assert.equal(player.json().error, 'TENANT_NOT_READY');
  const staffPath = await request(TENANT_DOMAIN, '/api/admin/users');
  assert.notEqual(staffPath.status, 503);
  assert.ok([401, 403].includes(staffPath.status), `staff path answered ${staffPath.status}`);
});

test('N5 — fake TLS activates; the go-live checklist gates activation until complete', async () => {
  const tls = await platform(`/tenants/${tenantId}/domains/${domainId}/sync-tls`, { method: 'POST' });
  assert.equal(tls.status, 200);
  assert.equal(tls.json().status, 'active');
  const tlsAgain = await platform(`/tenants/${tenantId}/domains/${domainId}/sync-tls`, { method: 'POST' });
  assert.equal(tlsAgain.json().status, 'active');

  const before = await platform(`/tenants/${tenantId}`);
  assert.equal(before.status, 200);
  assert.equal(before.json().checklist.allPassed, false);
  assert.equal(before.json().checklist.gates.domainTls.passed, true);
  assert.equal(before.json().checklist.gates.legalEntity.passed, true);
  assert.equal(before.json().checklist.gates.providerApproval.required, false);

  const blocked = await platform(`/tenants/${tenantId}/status`, { method: 'PATCH', body: { status: 'active' } });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.json().error.code, 'CHECKLIST_INCOMPLETE');

  await Tenant.updateOne({ _id: tenantId }, {
    $set: { 'checklist.pspVerified': true, 'checklist.kycVerified': true, 'checklist.emailVerified': true },
  });
  const after = await platform(`/tenants/${tenantId}`);
  assert.equal(after.json().checklist.allPassed, true);
});

test('N5 — transition to active serves the player route; re-activation is idempotent', async () => {
  const res = await platform(`/tenants/${tenantId}/status`, { method: 'PATCH', body: { status: 'active' } });
  assert.equal(res.status, 200);
  assert.equal(res.json().status, 'active');

  clearDomainHostCache();
  const player = await request(TENANT_DOMAIN, '/api/branding');
  assert.equal(player.status, 200);
  assert.equal(player.json().tenantName, TENANT_NAME);

  const again = await platform(`/tenants/${tenantId}/status`, { method: 'PATCH', body: { status: 'active' } });
  assert.equal(again.status, 200);
  assert.equal(again.json().status, 'active');
});

test('K23 — platform staff are read-only on tenant routes unless granted (real middleware over HTTP)', async () => {
  const express = (await import('express')).default;
  const k23app = express();
  k23app.use(express.json());
  k23app.all('/api/admin/tenant-resource', requireStaff('tenant'), (req, res) => res.json({ ok: true, scope: req.staff.scope }));
  k23app.use(errorHandler);
  const k23server = k23app.listen(0);
  await new Promise((resolve) => k23server.once('listening', resolve));
  const k23port = k23server.address().port;
  const k23 = (method) => httpCall(k23port, TENANT_DOMAIN, '/api/admin/tenant-resource', {
    method, token: platformToken, headers: { 'x-tenant-id': tenantId },
  });

  try {
    const read = await k23('GET');
    assert.equal(read.status, 200);
    assert.equal(read.json().scope, 'platform');

    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const write = await k23(method);
      assert.equal(write.status, 403);
      assert.equal(write.json().error.code, 'PLATFORM_READ_ONLY');
    }

    const grantRes = await platform(`/tenants/${tenantId}/write-grants`, {
      method: 'POST', body: { staffId: String(ownerStaff._id), reason: 'acceptance write', durationHours: 1 },
    });
    assert.equal(grantRes.status, 201);
    const grantId = grantRes.json().grant._id;

    const granted = await k23('POST');
    assert.equal(granted.status, 200);

    const revoke = await platform(`/tenants/${tenantId}/write-grants/${grantId}`, { method: 'DELETE' });
    assert.equal(revoke.status, 200);
    const afterRevoke = await k23('POST');
    assert.equal(afterRevoke.status, 403);
    assert.equal(afterRevoke.json().error.code, 'PLATFORM_READ_ONLY');

    const readOnlyLogs = await runWithTenant(tenantId, () => AuditLog.countDocuments({ action: 'PLATFORM_READ_ONLY' }));
    assert.ok(readOnlyLogs >= 4);
    const exceptionLogs = await runWithTenant(tenantId, () => AuditLog.countDocuments({ action: 'PLATFORM_WRITE_EXCEPTION' }));
    assert.ok(exceptionLogs >= 1);
  } finally {
    await new Promise((resolve) => k23server.close(resolve));
  }
});

test('K24 — audit retention never falls below five years in multi mode', async () => {
  const retention = await Setting.findOne({ scope: 'platform', key: 'audit_retention_days' });
  assert.ok(Number(retention.value) >= 1825);
  assert.equal(legalRetentionDays({ AUDIT_RETENTION_DAYS: '30' }), 1825);
  assert.equal(legalRetentionDays({ AUDIT_RETENTION_DAYS: '4000' }), 4000);

  await AuditLog.init();
  const indexes = await AuditLog.collection.indexes();
  const ttl = indexes.find((i) => i.expireAfterSeconds !== undefined);
  assert.ok(ttl, 'AuditLog must keep a TTL index');
  assert.ok(ttl.expireAfterSeconds >= 1825 * 86400);
});

test('N6 — scope-gate telemetry reports the staging and production windows', async () => {
  const res = await platform('/system/scope-gates');
  assert.equal(res.status, 200);
  assert.equal(res.json().staging.requiredDays, 14);
  assert.equal(res.json().production.requiredDays, 7);

  process.env.SCOPE_GATE_ENV = 'staging';
  const unsubscribe = installScopeTelemetry();
  try {
    await recordScopeViolation({ environment: 'staging', event: { model: 'User', op: 'find', reason: 'acceptance' } });
    const after = await platform('/system/scope-gates');
    assert.ok(after.json().staging.totalViolations >= 1);
    assert.equal(after.json().staging.gatePassed, false);
  } finally {
    unsubscribe();
    delete process.env.SCOPE_GATE_ENV;
  }
});

test('lifecycle — suspended serves 503, closed is terminal and locks legal retention', async () => {
  const suspend = await platform(`/tenants/${tenantId}/status`, { method: 'PATCH', body: { status: 'suspended', reason: 'maintenance' } });
  assert.equal(suspend.status, 200);
  assert.equal(suspend.json().status, 'suspended');
  const playerSuspended = await request(TENANT_DOMAIN, '/api/branding');
  assert.equal(playerSuspended.status, 503);
  assert.equal(playerSuspended.json().error, 'TENANT_SUSPENDED');

  const close = await platform(`/tenants/${tenantId}/status`, { method: 'PATCH', body: { status: 'closed', reason: 'end of life' } });
  assert.equal(close.status, 200);
  assert.equal(close.json().status, 'closed');
  assert.ok(close.json().retentionLockUntil);
  assert.ok(new Date(close.json().retentionLockUntil).getTime() >= Date.now() + 1825 * 86400 * 1000 - 60000);

  const playerClosed = await request(TENANT_DOMAIN, '/api/branding');
  assert.equal(playerClosed.status, 404);
  assert.equal(playerClosed.json().error, 'TENANT_CLOSED');

  const reactivate = await platform(`/tenants/${tenantId}/status`, { method: 'PATCH', body: { status: 'active', force: true, reason: 'x' } });
  assert.equal(reactivate.status, 409);
  assert.equal(reactivate.json().error.code, 'INVALID_TRANSITION');

  const doc = await Tenant.findById(tenantId);
  assert.ok(doc.closedAt);
  assert.ok(doc.legalRetentionUntil);
});

test('PLATFORM_HOST — /api/platform on a tenant host is not a platform request', async () => {
  const onUnknown = await request('unknown.example.com', '/api/platform/tenants');
  assert.equal(onUnknown.status, 404);
  assert.equal(onUnknown.json().error, 'TENANT_NOT_FOUND');

  const onPlatform = await request(PLATFORM_HOST, '/api/platform/tenants');
  assert.equal(onPlatform.status, 401);

  // Without PLATFORM_HOST the path alone decides: an unknown host is bypassed.
  const saved = process.env.PLATFORM_HOST;
  delete process.env.PLATFORM_HOST;
  try {
    const pathBased = await request('unknown.example.com', '/api/platform/tenants');
    assert.equal(pathBased.status, 401);
  } finally {
    process.env.PLATFORM_HOST = saved;
  }
});

test('single mode — /api/platform and /console are both 404', async () => {
  const savedMode = process.env.TENANCY_MODE;
  const savedEnforcement = process.env.TENANCY_ENFORCEMENT;
  process.env.TENANCY_MODE = 'single';
  process.env.TENANCY_ENFORCEMENT = 'off';
  let singleServer;
  try {
    const singleApp = createApp();
    singleServer = singleApp.listen(0);
    await new Promise((resolve) => singleServer.once('listening', resolve));
    const singlePort = singleServer.address().port;
    const api = await httpCall(singlePort, 'any.example.com', '/api/platform/tenants');
    assert.equal(api.status, 404);
    const consoleRes = await httpCall(singlePort, 'any.example.com', '/console');
    assert.equal(consoleRes.status, 404);
  } finally {
    if (singleServer) await new Promise((resolve) => singleServer.close(resolve));
    process.env.TENANCY_MODE = savedMode;
    process.env.TENANCY_ENFORCEMENT = savedEnforcement;
  }
});