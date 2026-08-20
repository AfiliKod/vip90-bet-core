import { test, describe } from 'node:test';
import assert from 'node:assert';
import { updateThemeSchema, applyThemePresetSchema } from '../src/validators/admin.js';
import { createUpdateThemeToken, createApplyThemePreset } from '../src/controllers/admin.js';
import { THEME_PRESETS } from '../src/theme/presets.js';
import { THEME_TOKEN_DEFINITIONS } from '../src/theme/registry.js';

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

describe('applyThemePresetSchema (A6)', () => {
  test('bilinen bir paket id\'si kabul edilir', () => {
    const r = applyThemePresetSchema.safeParse({ id: 'emerald-gold' });
    assert.strictEqual(r.success, true);
  });

  test('bilinmeyen paket id\'si reddedilir', () => {
    const r = applyThemePresetSchema.safeParse({ id: 'not-a-real-preset' });
    assert.strictEqual(r.success, false);
  });
});

describe('createApplyThemePreset (DI, A6)', () => {
  test('paketteki HER token için enjekte edilen setThemeToken\'ı çağırır ve ok:true döner', async () => {
    const calls = [];
    const handler = createApplyThemePreset({
      setThemeToken: async (id, value, updatedBy) => { calls.push({ id, value, updatedBy }); },
    });
    const preset = THEME_PRESETS.find(p => p.id === 'emerald-gold');

    const req = { validated: { id: 'emerald-gold' }, user: { id: 'admin-id' } };
    const res = { json: (data) => { req.resData = data; } };
    let nextErr;
    await handler(req, res, (e) => { nextErr = e; });

    assert.strictEqual(nextErr, undefined);
    assert.deepStrictEqual(req.resData, { ok: true });
    // Paket THEME_TOKEN_DEFINITIONS'taki her token'ı kapsıyor (bkz. themePresets.test.js) —
    // uygulama da hepsini tek tek setThemeToken ile yazmalı, hiçbiri atlanmamalı.
    assert.strictEqual(calls.length, THEME_TOKEN_DEFINITIONS.length);
    for (const def of THEME_TOKEN_DEFINITIONS) {
      const call = calls.find(c => c.id === def.id);
      assert.ok(call, `${def.id} için setThemeToken çağrılmadı`);
      assert.strictEqual(call.value, preset.tokens[def.id]);
      assert.strictEqual(call.updatedBy, 'admin-id');
    }
  });

  test('enjekte edilen setThemeToken hata atarsa next(err) çağrılır', async () => {
    const boom = new Error('db down');
    const handler = createApplyThemePreset({ setThemeToken: async () => { throw boom; } });
    const req = { validated: { id: 'neon-cyan' }, user: { id: 'admin-id' } };
    const res = { json: () => { throw new Error('res.json çağrılmamalıydı'); } };
    let nextErr;
    await handler(req, res, (e) => { nextErr = e; });
    assert.strictEqual(nextErr, boom);
  });
});
