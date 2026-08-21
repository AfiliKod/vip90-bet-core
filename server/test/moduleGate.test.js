import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createModuleGate } from '../src/middleware/moduleGate.js';
import { createPublicModulesHandler } from '../src/routes/modules.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    set(k, v) { this.headers[k] = v; return this; },
  };
  return res;
}

describe('createModuleGate — modül kapalıyken zarif bozulma (M4)', () => {
  test('modül kullanılabilirse zincir devam eder', async () => {
    const gate = createModuleGate({ isUsable: async () => true });
    let nextCalled = false;
    await gate({}, {}, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
  });

  test('modül kapalıysa 404 DEĞİL, anlamlı 503 + MODULE_DISABLED döner', async () => {
    const gate = createModuleGate({ isUsable: async () => false, moduleId: 'betting' });
    const req = {};
    const res = mockRes();
    let nextCalled = false;
    await gate(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.error.code, 'MODULE_DISABLED');
    assert.strictEqual(res.body.error.module, 'betting');
    assert.ok(!res.headers['Cache-Control'] || !res.headers['Cache-Control'].includes('max-age'), 'hata yanıtı cache\'lenmemeli');
  });

  test('durum sorgusu patlarsa güvenli tarafta kalır (kapalı sayılır)', async () => {
    const gate = createModuleGate({ isUsable: async () => { throw new Error('db yok'); } });
    const res = mockRes();
    let nextCalled = false;
    await gate({}, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 503);
  });

  test('modül kimliği gate oluşturulurken verilir', async () => {
    const gate = createModuleGate({ isUsable: async () => false, moduleId: 'casino-content' });
    const res = mockRes();
    await gate({}, res, () => {});
    assert.strictEqual(res.body.error.module, 'casino-content');
  });
});

describe('createPublicModulesHandler — istemci menüsü için genel uç', () => {
  test('yalnızca herkese güvenli alanları döner (lisans detayı sızmaz)', async () => {
    const h = createPublicModulesHandler({
      listModules: async () => [
        { id: 'betting', title: 'Spor ve Canlı Bahis', description: 'Odds akışı.', enabled: true },
        { id: 'casino-content', title: 'Casino İçeriği', description: '', enabled: false },
      ],
      isModuleUsable: async (id) => id === 'betting',
    });
    const res = mockRes();
    await h({}, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.modules.length, 2);
    const betting = res.body.modules.find(m => m.id === 'betting');
    const casino = res.body.modules.find(m => m.id === 'casino-content');
    assert.deepStrictEqual(Object.keys(betting).sort(), ['available', 'description', 'id', 'title']);
    assert.strictEqual(betting.available, true);
    assert.strictEqual(casino.available, false);
  });

  test('depo patlarsa tümü kullanılamaz olarak raporlanır, 500 atmaz', async () => {
    const h = createPublicModulesHandler({
      listModules: async () => { throw new Error('db yok'); },
      isModuleUsable: async () => true,
    });
    const res = mockRes();
    await h({}, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.modules.length, 0); // bilinmiyorsa listeleme boş
  });
});
