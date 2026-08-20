import { test, describe } from 'node:test';
import assert from 'node:assert';
import { updateHomeContentSchema } from '../src/validators/admin.js';
import { createUpdateHomeContent } from '../src/controllers/admin.js';

describe('updateHomeContentSchema', () => {
  test('geçerli bir içerik (bilinen bölüm+banner id\'leri) kabul edilir', () => {
    const r = updateHomeContentSchema.safeParse({
      sectionOrder: ['hero', 'features'],
      banners: [{ id: 'deneme-bonusu', title: 'Yeni Başlık' }],
    });
    assert.strictEqual(r.success, true);
  });

  test('boş sectionOrder ve banners kabul edilir (her ikisi de tamamen gizlenebilir/varsayılana bırakılabilir)', () => {
    const r = updateHomeContentSchema.safeParse({ sectionOrder: [], banners: [] });
    assert.strictEqual(r.success, true);
  });

  test('tanınmayan bölüm id\'si reddedilir', () => {
    const r = updateHomeContentSchema.safeParse({ sectionOrder: ['not-a-section'], banners: [] });
    assert.strictEqual(r.success, false);
  });

  test('tanınmayan banner id\'si reddedilir', () => {
    const r = updateHomeContentSchema.safeParse({ sectionOrder: [], banners: [{ id: 'not-a-banner' }] });
    assert.strictEqual(r.success, false);
  });

  test('aşırı uzun banner başlığı reddedilir', () => {
    const r = updateHomeContentSchema.safeParse({
      sectionOrder: [],
      banners: [{ id: 'deneme-bonusu', title: 'x'.repeat(200) }],
    });
    assert.strictEqual(r.success, false);
  });

  test('sectionOrder eksikse reddedilir (kısmi obje kabul edilmez)', () => {
    const r = updateHomeContentSchema.safeParse({ banners: [] });
    assert.strictEqual(r.success, false);
  });
});

describe('createUpdateHomeContent (DI)', () => {
  test('req.validated ile enjekte edilen setHomeContent\'i çağırır ve ok:true döner', async () => {
    const calls = [];
    const handler = createUpdateHomeContent({
      setHomeContent: async (content, updatedBy) => { calls.push({ content, updatedBy }); },
    });
    const req = {
      validated: { sectionOrder: ['hero'], banners: [] },
      user: { id: 'admin-id' },
    };
    const res = { json: (data) => { req.resData = data; } };
    let nextErr;
    await handler(req, res, (e) => { nextErr = e; });

    assert.strictEqual(nextErr, undefined);
    assert.deepStrictEqual(req.resData, { ok: true });
    assert.deepStrictEqual(calls[0], {
      content: { sectionOrder: ['hero'], banners: [] },
      updatedBy: 'admin-id',
    });
  });

  test('enjekte edilen setHomeContent hata atarsa next(err) çağrılır', async () => {
    const boom = new Error('db down');
    const handler = createUpdateHomeContent({ setHomeContent: async () => { throw boom; } });
    const req = { validated: { sectionOrder: [], banners: [] }, user: { id: 'admin-id' } };
    const res = { json: () => { throw new Error('res.json çağrılmamalıydı'); } };
    let nextErr;
    await handler(req, res, (e) => { nextErr = e; });
    assert.strictEqual(nextErr, boom);
  });
});
