import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createSlikairConfigStore } from '../src/config/slikairConfig.js';
import { createEmailConfigStore } from '../src/config/emailConfig.js';

// Sahte DB + sahte (tersinir) şifreleme
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

function slikair(env = {}, db = fakeDb()) {
  return { db, store: createSlikairConfigStore({ ...db, env, encrypt, decrypt, ttlMs: 0 }) };
}

describe('Slikair ayar okuyucu', () => {
  test('DB yoksa env değerleri kullanılır, baseUrl varsayılanı sandbox', async () => {
    const { store } = slikair({ SLIKAIR_MERCHANT_ID: 'm1', SLIKAIR_MERCHANT_TOKEN: 'tok-env-12345' });
    const c = await store.getAll();
    assert.strictEqual(c.merchantId, 'm1');
    assert.strictEqual(c.merchantToken, 'tok-env-12345');
    assert.match(c.baseUrl, /sandbox\.slikair/);
  });

  test('DB değeri env değerinden önceliklidir', async () => {
    const { store } = slikair({ SLIKAIR_MERCHANT_ID: 'env', SLIKAIR_MERCHANT_TOKEN: 'env-token-1' });
    await store.update({ merchantId: 'db', merchantToken: 'db-token-123' });
    const c = await store.getAll();
    assert.strictEqual(c.merchantId, 'db');
    assert.strictEqual(c.merchantToken, 'db-token-123');
  });

  test('gizli alan DB\'de şifreli saklanır', async () => {
    const { store, db } = slikair();
    await store.update({ merchantToken: 'supersecret-token' });
    assert.strictEqual(db.rows['slikair.merchantToken'], 'enc:supersecret-token');
    assert.notStrictEqual(db.rows['slikair.merchantToken'], 'supersecret-token');
  });

  test('panel görünümü gizli alanı maskeler, düz değer sızmaz', async () => {
    const { store } = slikair();
    await store.update({ merchantToken: 'abcd1234wxyz9876', webhookSecret: 'whsec-0123456789' });
    const view = await store.getAdminView();
    const tok = view.find(v => v.key === 'merchantToken');
    assert.strictEqual(tok.secret, true);
    assert.strictEqual(tok.source, 'db');
    assert.ok(!JSON.stringify(view).includes('abcd1234wxyz9876'));
    assert.ok(!JSON.stringify(view).includes('whsec-0123456789'));
    assert.strictEqual(tok.value, 'abcd…9876');
  });

  test('gizli alan boş gönderilirse DEĞİŞMEZ', async () => {
    const { store } = slikair();
    await store.update({ merchantToken: 'keep-me-please' });
    await store.update({ merchantToken: '', merchantId: 'x' });
    await store.update({ merchantId: 'y' });
    assert.strictEqual((await store.getAll()).merchantToken, 'keep-me-please');
  });

  test('clear ile gizli alan silinir ve env\'e geri düşülür', async () => {
    const { store } = slikair({ SLIKAIR_MERCHANT_TOKEN: 'env-token-xyz' });
    await store.update({ merchantToken: 'db-token-abc' });
    await store.update({}, { clear: ['merchantToken'] });
    assert.strictEqual((await store.getAll()).merchantToken, 'env-token-xyz');
  });

  test('gizli olmayan alan boş gönderilirse DB kaydı silinir (env\'e dönülür)', async () => {
    const { store } = slikair({ SLIKAIR_SITE_ID: 'env-site' });
    await store.update({ siteId: 'db-site' });
    await store.update({ siteId: '' });
    assert.strictEqual((await store.getAll()).siteId, 'env-site');
  });

  test('şifresi çözülemeyen DB kaydı env\'e düşer (canlı ayar bozulmaz)', async () => {
    const { store, db } = slikair({ SLIKAIR_MERCHANT_TOKEN: 'env-token-ok' });
    db.rows['slikair.merchantToken'] = 'duz-bozuk-deger';
    assert.strictEqual((await store.getAll()).merchantToken, 'env-token-ok');
  });

  test('DB okunamazsa env\'e düşer', async () => {
    const store = createSlikairConfigStore({
      load: async () => { throw new Error('db yok'); }, save: async () => {},
      env: { SLIKAIR_SITE_ID: 's' }, encrypt, decrypt, ttlMs: 0,
    });
    assert.strictEqual((await store.getAll()).siteId, 's');
  });

  test('bilinmeyen alan reddedilir', async () => {
    const { store } = slikair();
    await assert.rejects(() => store.update({ evil: 'x' }), /Bilinmeyen/);
  });

  test('TTL cache: ttl içinde DB tekrar okunmaz, update cache\'i geçersiz kılar', async () => {
    const db = fakeDb();
    let loads = 0;
    let t = 0;
    const store = createSlikairConfigStore({
      load: async k => { loads++; return db.load(k); }, save: db.save,
      env: {}, encrypt, decrypt, now: () => t, ttlMs: 1000,
    });
    await store.getAll(); await store.getAll();
    assert.strictEqual(loads, 1);
    await store.update({ siteId: 'a' });
    assert.strictEqual((await store.getAll()).siteId, 'a');
    assert.strictEqual(loads, 2);
  });
});

describe('E-posta (SMTP) ayar okuyucu', () => {
  test('env fallback ve varsayılanlar', async () => {
    const db = fakeDb();
    const store = createEmailConfigStore({ ...db, env: { SMTP_HOST: 'smtp.mailgun.org', SMTP_USER: 'u' }, encrypt, decrypt, ttlMs: 0 });
    const c = await store.getAll();
    assert.strictEqual(c.host, 'smtp.mailgun.org');
    assert.strictEqual(c.port, '587');
    assert.strictEqual(c.secure, 'false');
    assert.strictEqual(c.from, 'noreply@vip90.bet');
  });

  test('DB > env; şifre şifreli saklanır, maskelenir, boş gönderimde değişmez', async () => {
    const db = fakeDb();
    const store = createEmailConfigStore({ ...db, env: { SMTP_HOST: 'env.host', SMTP_PASS: 'env-pass-123' }, encrypt, decrypt, ttlMs: 0 });
    await store.update({ host: 'db.host', pass: 'smtp-secret-pw' });
    assert.strictEqual(db.rows['smtp.pass'], 'enc:smtp-secret-pw');
    const c = await store.getAll();
    assert.strictEqual(c.host, 'db.host');
    assert.strictEqual(c.pass, 'smtp-secret-pw');
    const view = await store.getAdminView();
    assert.ok(!JSON.stringify(view).includes('smtp-secret-pw'));
    await store.update({ pass: '' });
    assert.strictEqual((await store.getAll()).pass, 'smtp-secret-pw');
  });
});
