import { test, describe } from 'node:test';
import assert from 'node:assert';
import { updateBrandingSchema } from '../src/validators/admin.js';
import { createUpdateBrandingField } from '../src/controllers/admin.js';

// Küçük ama gerçek bir 1x1 PNG data URL — boyut testleri için taban.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('updateBrandingSchema', () => {
  test('geçerli site adı kabul edilir', () => {
    const r = updateBrandingSchema.safeParse({ id: 'siteName', value: 'VIP90.bet Pro' });
    assert.strictEqual(r.success, true);
  });

  test('bilinmeyen alan id\'si reddedilir', () => {
    const r = updateBrandingSchema.safeParse({ id: 'notARealField', value: 'x' });
    assert.strictEqual(r.success, false);
  });

  test('60 karakteri aşan site adı reddedilir', () => {
    const r = updateBrandingSchema.safeParse({ id: 'siteName', value: 'x'.repeat(61) });
    assert.strictEqual(r.success, false);
  });

  test('geçerli küçük bir data: URL logo kabul edilir', () => {
    const r = updateBrandingSchema.safeParse({ id: 'logo', value: TINY_PNG });
    assert.strictEqual(r.success, true);
  });

  test('data: URL olmayan bir görsel değeri reddedilir', () => {
    const r = updateBrandingSchema.safeParse({ id: 'logo', value: 'https://example.com/logo.png' });
    assert.strictEqual(r.success, false);
  });

  test('maxBytes\'ı aşan görsel reddedilir', () => {
    // favicon maxBytes 100_000 — bunu aşan bir base64 payload üret.
    const bigBase64 = Buffer.alloc(150_000, 1).toString('base64');
    const r = updateBrandingSchema.safeParse({ id: 'favicon', value: `data:image/png;base64,${bigBase64}` });
    assert.strictEqual(r.success, false);
  });
});

describe('createUpdateBrandingField (DI)', () => {
  test('req.validated ile enjekte edilen setBrandingField\'ı çağırır ve ok:true döner', async () => {
    const calls = [];
    const handler = createUpdateBrandingField({
      setBrandingField: async (id, value, updatedBy) => { calls.push({ id, value, updatedBy }); },
    });

    const req = { validated: { id: 'siteName', value: 'VIP90.bet Pro' }, user: { id: 'admin-id' } };
    const res = { json: (data) => { req.resData = data; } };
    let nextErr;
    await handler(req, res, (e) => { nextErr = e; });

    assert.strictEqual(nextErr, undefined);
    assert.deepStrictEqual(req.resData, { ok: true });
    assert.deepStrictEqual(calls[0], { id: 'siteName', value: 'VIP90.bet Pro', updatedBy: 'admin-id' });
  });

  test('enjekte edilen setBrandingField hata atarsa next(err) çağrılır', async () => {
    const boom = new Error('db down');
    const handler = createUpdateBrandingField({ setBrandingField: async () => { throw boom; } });
    const req = { validated: { id: 'siteName', value: 'x' }, user: { id: 'admin-id' } };
    const res = { json: () => { throw new Error('res.json çağrılmamalıydı'); } };
    let nextErr;
    await handler(req, res, (e) => { nextErr = e; });
    assert.strictEqual(nextErr, boom);
  });
});
