import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createDemoAdminBlock } from '../src/middleware/demoAdmin.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

describe('createDemoAdminBlock — sınırlı demo yönetici', () => {
  test('isDemoAdmin bayraklı yönetici yıkıcı işlemden 403 DEMO_ADMIN_READONLY ile döner', async () => {
    const block = createDemoAdminBlock({
      getUserById: async () => ({ username: 'demo_admin', role: 'admin', isDemoAdmin: true }),
    });
    const res = mockRes();
    let nextArg;
    await block({ user: { id: 'u1' } }, res, (e) => { nextArg = e; });
    assert.ok(nextArg, 'hata olmadan geçmemeli');
    assert.strictEqual(nextArg.code, 'DEMO_ADMIN_READONLY');
    assert.strictEqual(nextArg.status ?? res.statusCode, 403);
  });

  test('tam admin aynı işlemden hatasız geçer', async () => {
    const block = createDemoAdminBlock({
      getUserById: async () => ({ username: 'admin', role: 'admin', isDemoAdmin: false }),
    });
    const res = mockRes();
    let nextArg;
    let called = false;
    await block({ user: { id: 'u2' } }, res, (e) => { nextArg = e; called = true; });
    assert.strictEqual(called, true);
    assert.strictEqual(nextArg, undefined);
  });

  test('kullanıcı bulunamazsa (null) engelleme davranışı değişmez', async () => {
    const block = createDemoAdminBlock({ getUserById: async () => null });
    const res = mockRes();
    let nextArg;
    await block({ user: { id: 'ghost' } }, res, (e) => { nextArg = e; });
    // null user means isDemoAdmin is undefined/false — should pass through
    assert.strictEqual(nextArg, undefined);
  });

  test('sorgu patlarsa da fail-closed davranır', async () => {
    const block = createDemoAdminBlock({
      getUserById: async () => { throw new Error('db yok'); },
    });
    const res = mockRes();
    let nextArg;
    await block({ user: { id: 'u3' } }, res, (e) => { nextArg = e; });
    assert.ok(nextArg, 'fail-closed: hata döndürmeli');
    assert.strictEqual(nextArg.code, 'DEMO_CHECK_FAILED');
  });
});
