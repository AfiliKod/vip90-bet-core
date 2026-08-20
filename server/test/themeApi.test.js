import { test, describe } from 'node:test';
import assert from 'node:assert';
import { updateThemeSchema } from '../src/validators/admin.js';
import { createUpdateThemeToken } from '../src/controllers/admin.js';

describe('updateThemeSchema', () => {
  test('bilinen bir token id + değer kabul edilir', () => {
    const r = updateThemeSchema.safeParse({ id: 'primary', value: '#ff0000' });
    assert.strictEqual(r.success, true);
  });

  test('bilinmeyen token id reddedilir', () => {
    const r = updateThemeSchema.safeParse({ id: 'not-a-real-token', value: '#ff0000' });
    assert.strictEqual(r.success, false);
  });

  test('boş değer reddedilir', () => {
    const r = updateThemeSchema.safeParse({ id: 'primary', value: '' });
    assert.strictEqual(r.success, false);
  });
});

// A2 — updateThemeToken controller'ı theme/index.js'e doğrudan bağlı değil;
// registry.js/modules-registry.js'teki gibi setThemeToken enjekte edilebilir
// (createUpdateThemeToken({ setThemeToken })). Böylece ES module namespace'ini
// monkey-patch etmeye gerek kalmaz.
describe('createUpdateThemeToken (DI)', () => {
  test('req.validated ile enjekte edilen setThemeToken\'ı çağırır ve ok:true döner', async () => {
    const calls = [];
    const handler = createUpdateThemeToken({
      setThemeToken: async (id, value, updatedBy) => { calls.push({ id, value, updatedBy }); },
    });

    const req = { validated: { id: 'primary', value: '#ff0000' }, user: { id: 'admin-id' } };
    const res = { json: (data) => { req.resData = data; } };
    let nextErr;
    await handler(req, res, (e) => { nextErr = e; });

    assert.strictEqual(nextErr, undefined);
    assert.deepStrictEqual(req.resData, { ok: true });
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0], { id: 'primary', value: '#ff0000', updatedBy: 'admin-id' });
  });

  test('enjekte edilen setThemeToken hata atarsa next(err) çağrılır, sessizce yutulmaz', async () => {
    const boom = new Error('db down');
    const handler = createUpdateThemeToken({
      setThemeToken: async () => { throw boom; },
    });

    const req = { validated: { id: 'primary', value: '#ff0000' }, user: { id: 'admin-id' } };
    const res = { json: () => { throw new Error('res.json çağrılmamalıydı'); } };
    let nextErr;
    await handler(req, res, (e) => { nextErr = e; });

    assert.strictEqual(nextErr, boom);
  });
});
