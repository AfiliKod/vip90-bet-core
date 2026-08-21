import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createModuleHandlers } from '../src/controllers/modules.js';

// ─── Sahte depolar ──────────────────────────────────────────────────

function fakeModuleStore({ enabled = {} } = {}) {
  const flags = { ...enabled };
  const calls = { set: [], invalidated: 0 };
  return {
    calls,
    async list() {
      return [
        { id: 'betting', title: 'Spor ve Canlı Bahis', description: '', enabled: flags.betting === true },
        { id: 'casino-content', title: 'Casino İçeriği', description: '', enabled: flags['casino-content'] === true },
      ];
    },
    async isEnabled(id) { return flags[id] === true; },
    async setModuleEnabled(id, value, by) {
      calls.set.push({ id, value, by });
      flags[id] = value;
    },
    invalidate() { calls.invalidated++; },
  };
}

function fakeLicenseStore({ licensed = {} } = {}) {
  return {
    async list() {
      return [
        { id: 'betting', licensed: licensed.betting !== false, source: 'live', expiresAt: null },
        { id: 'casino-content', licensed: licensed['casino-content'] !== false, source: 'cached', expiresAt: null },
      ];
    },
    invalidate() {},
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

const deps = () => {
  const ms = fakeModuleStore();
  const ls = fakeLicenseStore();
  return {
    moduleStore: ms,
    licenseStore: ls,
    setModuleEnabled: (id, value, by) => ms.setModuleEnabled(id, value, by),
    invalidateModules: () => ms.invalidate(),
  };
};

describe('admin modül ekranı handler\'ları', () => {
  test('liste: modül durumu ile lisans bilgisi birleşik döner', async () => {
    const h = createModuleHandlers(deps());
    const res = mockRes();
    await h.list({}, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.modules.length, 2);
    const betting = res.body.modules.find(m => m.id === 'betting');
    assert.strictEqual(betting.enabled, false);
    assert.strictEqual(betting.licensed, true);
    assert.strictEqual(betting.title, 'Spor ve Canlı Bahis');
  });

  test('toggle: geçerli istek setModuleEnabled\'ı kullanıcı kimliğiyle çağırır', async () => {
    const depsObj = deps();
    const h = createModuleHandlers(depsObj);
    const res = mockRes();
    await h.update({ params: { id: 'betting' }, body: { enabled: true }, user: { id: 'admin-1' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(depsObj.moduleStore.calls.set, [{ id: 'betting', value: true, by: 'admin-1' }]);
  });

  test('toggle: bilinmeyen modül 400 döner', async () => {
    const h = createModuleHandlers(deps());
    const res = mockRes();
    await h.update({ params: { id: 'olmayan' }, body: { enabled: true }, user: { id: 'a' } }, res);
    assert.strictEqual(res.statusCode, 400);
  });

  test('toggle: enabled boolean değilse 400 döner', async () => {
    const h = createModuleHandlers(deps());
    const res = mockRes();
    await h.update({ params: { id: 'betting' }, body: { enabled: 'evet' }, user: { id: 'a' } }, res);
    assert.strictEqual(res.statusCode, 400);
  });

  test('yenile: her iki deponun önbelleği temizlenir, taze liste döner', async () => {
    const depsObj = deps();
    const h = createModuleHandlers(depsObj);
    const res = mockRes();
    await h.refresh({}, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(depsObj.moduleStore.calls.invalidated >= 1);
    assert.ok(Array.isArray(res.body.modules));
  });
});
