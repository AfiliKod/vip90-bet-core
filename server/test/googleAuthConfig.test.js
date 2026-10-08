/**
 * Google ile giriş ayarları (Modules → Google Login kartı): DB > env,
 * aç/kapa anahtarı, varsayılan redirect URI ve admin uçlarının yanıtı.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAuthConfigStore, getGoogleAuthSettings, defaultRedirectUri } from '../src/config/googleAuthConfig.js';
import { createGoogleAuthSettingsHandlers } from '../src/controllers/integrationSettings.js';
import { updateGoogleAuthSettingsSchema } from '../src/validators/admin.js';

function fakeDb() {
  const rows = {};
  return {
    rows,
    load: async keys => Object.fromEntries(keys.filter(k => rows[k] != null).map(k => [k, rows[k]])),
    save: async (key, value) => { if (value == null) delete rows[key]; else rows[key] = value; },
  };
}
const encrypt = v => `enc:${v}`;
const decrypt = v => { if (!String(v).startsWith('enc:')) throw new Error('bozuk'); return v.slice(4); };
const make = (env = {}, db = fakeDb()) => ({ db, env, store: createGoogleAuthConfigStore({ ...db, env, encrypt, decrypt, ttlMs: 0 }) });

describe('Google giriş ayarları', () => {
  test('hiçbir şey tanımlı değilse giriş kullanılamaz ama anahtar varsayılan açık', async () => {
    const { store, env } = make();
    const c = await getGoogleAuthSettings(store, env);
    assert.equal(c.enabled, true);
    assert.equal(c.active, false);
  });

  test('yalnız .env ile yapılandırılmış kurulum eskisi gibi çalışır', async () => {
    const { store, env } = make({ GOOGLE_CLIENT_ID: 'id-env', GOOGLE_CLIENT_SECRET: 'secret-env', GOOGLE_REDIRECT_URI: 'https://ex.example/cb' });
    const c = await getGoogleAuthSettings(store, env);
    assert.equal(c.active, true);
    assert.equal(c.clientId, 'id-env');
    assert.equal(c.redirectUri, 'https://ex.example/cb');
  });

  test('panel değerleri .env\'den önceliklidir, sır şifreli saklanır', async () => {
    const { store, env, db } = make({ GOOGLE_CLIENT_ID: 'id-env', GOOGLE_CLIENT_SECRET: 'secret-env' });
    await store.update({ clientId: 'id-db', clientSecret: 'secret-db-123456' });
    const c = await getGoogleAuthSettings(store, env);
    assert.equal(c.clientId, 'id-db');
    assert.equal(c.clientSecret, 'secret-db-123456');
    assert.equal(db.rows['googleAuth.clientSecret'], 'enc:secret-db-123456');
  });

  test('anahtar kapalıysa kimlik bilgileri olsa da giriş kullanılamaz', async () => {
    const { store, env } = make({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
    await store.update({ enabled: 'false' });
    const c = await getGoogleAuthSettings(store, env);
    assert.equal(c.enabled, false);
    assert.equal(c.active, false);
  });

  test('redirect URI boşsa CLIENT_URL\'deki ilk origin\'den türetilir', async () => {
    assert.equal(defaultRedirectUri({ CLIENT_URL: 'https://app.example.com/, https://www.example.com' }), 'https://app.example.com/api/auth/google/callback');
    const { store, env } = make({ CLIENT_URL: 'https://app.example.com' });
    assert.equal((await getGoogleAuthSettings(store, env)).redirectUri, 'https://app.example.com/api/auth/google/callback');
  });
});

describe('Admin uçları: /admin/settings/google-auth', () => {
  const run = async (handler, body) => {
    const res = { body: null, json(b) { this.body = b; return this; } };
    let err = null;
    await handler({ validated: body, body, user: { id: 'a1' } }, res, e => { err = e; });
    if (err) throw err;
    return res.body;
  };

  test('anahtar boolean olarak kaydedilir, yanıtta sır sızmaz', async () => {
    const { store, env } = make({ CLIENT_URL: 'https://app.example.com' });
    const h = createGoogleAuthSettingsHandlers({ store, env });
    const out = await run(h.update, { enabled: false, clientId: 'cid', clientSecret: 'very-secret-value' });
    assert.equal(out.settings.find(s => s.key === 'enabled').value, 'false');
    assert.equal(out.active, false);
    assert.equal(out.defaultRedirectUri, 'https://app.example.com/api/auth/google/callback');
    assert.ok(!JSON.stringify(out).includes('very-secret-value'));
    const on = await run(h.update, { enabled: true });
    assert.equal(on.active, true);
  });

  test('şema: bilinmeyen alan ve http(s) olmayan redirect reddedilir', () => {
    assert.equal(updateGoogleAuthSettingsSchema.safeParse({ foo: 1 }).success, false);
    assert.equal(updateGoogleAuthSettingsSchema.safeParse({ redirectUri: 'javascript:alert(1)' }).success, false);
    assert.equal(updateGoogleAuthSettingsSchema.safeParse({ redirectUri: '' }).success, true);
    assert.equal(updateGoogleAuthSettingsSchema.safeParse({ enabled: true, clear: ['clientSecret'] }).success, true);
  });
});
