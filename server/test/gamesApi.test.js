import { test, describe } from 'node:test';
import assert from 'node:assert';
import { updateFeaturedGamesSchema } from '../src/validators/admin.js';
import { createUpdateFeaturedGames } from '../src/controllers/admin.js';

describe('updateFeaturedGamesSchema', () => {
  test('geçerli bir kod listesi kabul edilir', () => {
    const r = updateFeaturedGamesSchema.safeParse({ codes: ['pp_vs20starlightx', 'bg_dice'] });
    assert.strictEqual(r.success, true);
  });

  test('boş liste kabul edilir (öne çıkan yok = varsayılana düşülür)', () => {
    const r = updateFeaturedGamesSchema.safeParse({ codes: [] });
    assert.strictEqual(r.success, true);
  });

  test('string olmayan bir öğe reddedilir', () => {
    const r = updateFeaturedGamesSchema.safeParse({ codes: ['a', 42] });
    assert.strictEqual(r.success, false);
  });

  test('60 karakteri aşan bir kod reddedilir', () => {
    const r = updateFeaturedGamesSchema.safeParse({ codes: ['x'.repeat(61)] });
    assert.strictEqual(r.success, false);
  });

  test('60\'tan fazla oyun reddedilir', () => {
    const r = updateFeaturedGamesSchema.safeParse({ codes: Array.from({ length: 61 }, (_, i) => `g${i}`) });
    assert.strictEqual(r.success, false);
  });

  test('codes alanı eksikse reddedilir', () => {
    const r = updateFeaturedGamesSchema.safeParse({});
    assert.strictEqual(r.success, false);
  });
});

describe('createUpdateFeaturedGames (DI)', () => {
  test('req.validated ile enjekte edilen setFeaturedGameCodes\'u çağırır ve ok:true döner', async () => {
    const calls = [];
    const handler = createUpdateFeaturedGames({
      setFeaturedGameCodes: async (codes, updatedBy) => { calls.push({ codes, updatedBy }); },
    });
    const req = { validated: { codes: ['a', 'b'] }, user: { id: 'admin-id' } };
    const res = { json: (data) => { req.resData = data; } };
    let nextErr;
    await handler(req, res, (e) => { nextErr = e; });

    assert.strictEqual(nextErr, undefined);
    assert.deepStrictEqual(req.resData, { ok: true });
    assert.deepStrictEqual(calls[0], { codes: ['a', 'b'], updatedBy: 'admin-id' });
  });

  test('enjekte edilen setFeaturedGameCodes hata atarsa next(err) çağrılır', async () => {
    const boom = new Error('db down');
    const handler = createUpdateFeaturedGames({ setFeaturedGameCodes: async () => { throw boom; } });
    const req = { validated: { codes: [] }, user: { id: 'admin-id' } };
    const res = { json: () => { throw new Error('res.json çağrılmamalıydı'); } };
    let nextErr;
    await handler(req, res, (e) => { nextErr = e; });
    assert.strictEqual(nextErr, boom);
  });
});
