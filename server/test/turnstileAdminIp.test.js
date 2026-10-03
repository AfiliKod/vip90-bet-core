import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getTurnstileConfig, publicTurnstileConfig, createTurnstileMiddleware,
} from '../src/middleware/turnstile.js';
import {
  parseAllowList, isIpAllowed, clientIp, createAdminIpAllowlist,
} from '../src/middleware/adminIpAllowlist.js';

function mockRes() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
  };
}
async function run(mw, req) {
  const res = mockRes();
  let nexted = false;
  await mw(req, res, () => { nexted = true; });
  return { res, nexted };
}
const fetchReturning = (obj, calls = []) => async (url, opts) => {
  calls.push({ url, opts });
  return { json: async () => obj };
};

describe('turnstile', () => {
  test('anahtarlar yoksa kapalı, token istenmez', async () => {
    assert.strictEqual(getTurnstileConfig({}).enabled, false);
    const mw = createTurnstileMiddleware({ env: {}, fetchImpl: () => { throw new Error('çağrılmamalı'); } });
    const { nexted } = await run(mw, { body: {} });
    assert.ok(nexted);
  });

  test('yalnız secret ya da yalnız site key yetmez', () => {
    assert.strictEqual(getTurnstileConfig({ TURNSTILE_SECRET_KEY: 's' }).enabled, false);
    assert.strictEqual(getTurnstileConfig({ TURNSTILE_SITE_KEY: 'k' }).enabled, false);
  });

  test('eski TURNSTILE_SECRET adı da kabul edilir', () => {
    assert.strictEqual(getTurnstileConfig({ TURNSTILE_SECRET: 's', TURNSTILE_SITE_KEY: 'k' }).enabled, true);
  });

  test('DISABLE_TURNSTILE=true atlar', async () => {
    const env = { TURNSTILE_SECRET_KEY: 's', TURNSTILE_SITE_KEY: 'k', DISABLE_TURNSTILE: 'true' };
    assert.strictEqual(getTurnstileConfig(env).enabled, false);
    const { nexted } = await run(createTurnstileMiddleware({ env }), { body: {} });
    assert.ok(nexted);
  });

  test('publicTurnstileConfig secret sızdırmaz', () => {
    const env = { TURNSTILE_SECRET_KEY: 'gizli', TURNSTILE_SITE_KEY: 'herkese-acik' };
    assert.deepStrictEqual(publicTurnstileConfig(env), { enabled: true, siteKey: 'herkese-acik' });
    assert.ok(!JSON.stringify(publicTurnstileConfig(env)).includes('gizli'));
    assert.deepStrictEqual(publicTurnstileConfig({}), { enabled: false, siteKey: null });
  });

  const env = { TURNSTILE_SECRET_KEY: 's', TURNSTILE_SITE_KEY: 'k' };

  test('aktifken token yoksa 400 TURNSTILE_REQUIRED', async () => {
    const mw = createTurnstileMiddleware({ env, fetchImpl: fetchReturning({ success: true }) });
    const { res, nexted } = await run(mw, { body: {} });
    assert.ok(!nexted);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'TURNSTILE_REQUIRED');
  });

  test('geçerli token geçer, secret + ip siteverify\'a gider', async () => {
    const calls = [];
    const mw = createTurnstileMiddleware({ env, fetchImpl: fetchReturning({ success: true }, calls) });
    const { nexted } = await run(mw, { body: { turnstileToken: 'tok' }, ip: '203.0.113.4' });
    assert.ok(nexted);
    const body = calls[0].opts.body;
    assert.strictEqual(body.get('secret'), 's');
    assert.strictEqual(body.get('response'), 'tok');
    assert.strictEqual(body.get('remoteip'), '203.0.113.4');
  });

  test('geçersiz token 400 TURNSTILE_FAILED', async () => {
    const mw = createTurnstileMiddleware({ env, fetchImpl: fetchReturning({ success: false }) });
    const { res, nexted } = await run(mw, { body: { turnstileToken: 'kotu' } });
    assert.ok(!nexted);
    assert.strictEqual(res.body.error.code, 'TURNSTILE_FAILED');
  });

  test('Cloudflare erişilemezse fail-open', async () => {
    const mw = createTurnstileMiddleware({ env, fetchImpl: async () => { throw new Error('ağ'); } });
    const { nexted } = await run(mw, { body: { turnstileToken: 'tok' } });
    assert.ok(nexted);
  });
});

describe('admin IP allowlist', () => {
  test('CIDR ve tekil IP eşleşmesi, IPv4-mapped IPv6', () => {
    const p = parseAllowList('10.0.0.0/8, 203.0.113.5 ,2001:db8::/32');
    assert.ok(isIpAllowed('10.20.30.40', p));
    assert.ok(isIpAllowed('::ffff:10.1.1.1', p));
    assert.ok(isIpAllowed('203.0.113.5', p));
    assert.ok(!isIpAllowed('203.0.113.6', p));
    assert.ok(isIpAllowed('2001:db8::1', p));
    assert.ok(!isIpAllowed('2001:db9::1', p));
    assert.ok(!isIpAllowed('', p));
  });

  test('geçersiz girdiler ayıklanır', () => {
    const p = parseAllowList('foo, 203.0.113.4/99, 5.6.7.8');
    assert.strictEqual(p.count, 1);
    assert.deepStrictEqual(p.invalid, ['foo', '203.0.113.4/99']);
  });

  test('ADMIN_ALLOWED_IPS yoksa herkes geçer', async () => {
    const { nexted } = await run(createAdminIpAllowlist({ env: {} }), { ip: '198.51.100.9', headers: {} });
    assert.ok(nexted);
  });

  test('tanımlıysa listedeki geçer, diğerleri 403 ADMIN_IP_NOT_ALLOWED', async () => {
    const mw = createAdminIpAllowlist({ env: { ADMIN_ALLOWED_IPS: '192.168.1.0/24' } });
    assert.ok((await run(mw, { ip: '192.168.1.7', headers: {} })).nexted);
    const { res, nexted } = await run(mw, { ip: '8.8.8.8', headers: {} });
    assert.ok(!nexted);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error.code, 'ADMIN_IP_NOT_ALLOWED');
  });

  test('tamamı geçersiz liste fail-closed', async () => {
    const mw = createAdminIpAllowlist({ env: { ADMIN_ALLOWED_IPS: 'abc' } });
    const { res } = await run(mw, { ip: '1.1.1.1', headers: {} });
    assert.strictEqual(res.statusCode, 403);
  });

  test('CF-Connecting-IP varsayılan olarak yok sayılır (sahte başlık)', async () => {
    const env = { ADMIN_ALLOWED_IPS: '1.1.1.1' };
    const req = { ip: '8.8.8.8', headers: { 'cf-connecting-ip': '1.1.1.1' } };
    assert.strictEqual(clientIp(req, env), '8.8.8.8');
    assert.strictEqual((await run(createAdminIpAllowlist({ env }), req)).res.statusCode, 403);
  });

  test('ADMIN_IP_TRUST_CF_HEADER=true ile CF-Connecting-IP kullanılır', async () => {
    const env = { ADMIN_ALLOWED_IPS: '1.1.1.1', ADMIN_IP_TRUST_CF_HEADER: 'true' };
    const req = { ip: '172.16.0.1', headers: { 'cf-connecting-ip': '1.1.1.1' } };
    assert.ok((await run(createAdminIpAllowlist({ env }), req)).nexted);
  });
});
