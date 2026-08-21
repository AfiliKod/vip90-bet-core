import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createShowcaseHandler, SHOWCASE_ITEMS } from '../src/demo/showcase.js';

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

describe('createShowcaseHandler — "modül gerektirir" rozeti verisi', () => {
  test('kapalı modüle bağlı içerik requiresModule:true taşır', async () => {
    const h = createShowcaseHandler({
      isModuleEnabled: async (id) => id !== 'betting', // betting kapalı
    });
    const res = mockRes();
    await h({}, res);
    const sportsbook = res.body.items.find(i => i.moduleId === 'betting');
    assert.strictEqual(sportsbook.requiresModule, true);
    assert.strictEqual(sportsbook.available, false);
  });

  test('açık modül içeriği rozetsizdir', async () => {
    const h = createShowcaseHandler({ isModuleEnabled: async () => true });
    const res = mockRes();
    await h({}, res);
    for (const item of res.body.items) {
      assert.strictEqual(item.requiresModule, false);
      assert.strictEqual(item.available, true);
    }
  });

  test('çekirdek platform içeriği (moduleId:null) her zaman açıktır', async () => {
    const h = createShowcaseHandler({ isModuleEnabled: async () => false }); // hepsi kapalı
    const res = mockRes();
    await h({}, res);
    const core = res.body.items.filter(i => i.moduleId === null);
    assert.ok(core.length > 0, 'çekirdek vitrin kalemi olmalı');
    for (const c of core) assert.strictEqual(c.requiresModule, false);
  });

  test('modül durumu okunamazsa tüm modüllü içerik "gerektirir" der (fail-closed gösterim)', async () => {
    const h = createShowcaseHandler({
      isModuleEnabled: async () => { throw new Error('db yok'); },
    });
    const res = mockRes();
    await h({}, res);
    assert.strictEqual(res.statusCode, 200); // asla 500 değil
    const tagged = res.body.items.filter(i => i.moduleId !== null);
    for (const t of tagged) assert.strictEqual(t.requiresModule, true);
  });

  test('vitrin kalemleri üç satılabilir modülü ve çekirdeği kapsar', () => {
    const ids = SHOWCASE_ITEMS.map(i => i.moduleId);
    for (const m of ['betting', 'casino-content', 'live-casino']) {
      assert.ok(ids.includes(m), `${m} vitrinde yok`);
    }
    assert.ok(ids.includes(null), 'çekirdek kalem yok');
  });
});
