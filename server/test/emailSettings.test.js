import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createEmailSettingsHandlers } from '../src/controllers/integrationSettings.js';
import { createEmailConfigStore, emailEnvView } from '../src/config/emailConfig.js';
import { updateEmailSettingsSchema, testEmailSchema } from '../src/validators/admin.js';
import { sendTestEmail, formatFrom, _setCreateTransport } from '../src/services/email.js';
import { emailConfig } from '../src/config/emailConfig.js';

function mockRes() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe('POST /admin/settings/email/test (handler)', () => {
  test('gövdede alıcı varsa ona gönderir (Test / send sekmesi)', async () => {
    const sent = [];
    const h = createEmailSettingsHandlers({
      store: {}, getAdminEmail: async () => 'admin@x.co',
      sendTest: async to => { sent.push(to); },
    });
    const res = mockRes();
    await h.test({ user: { id: 'a1' }, validated: { to: 'operator@x.co' } }, res, e => { throw e; });
    assert.deepStrictEqual(sent, ['operator@x.co']);
    assert.deepStrictEqual(res.body, { ok: true, to: 'operator@x.co' });
  });

  test('alıcı yoksa eskisi gibi admin\'in KENDİ e-postasına gönderir', async () => {
    const sent = [];
    const h = createEmailSettingsHandlers({
      store: {}, getAdminEmail: async id => (id === 'a1' ? 'admin@x.co' : null),
      sendTest: async to => { sent.push(to); },
    });
    const res = mockRes();
    await h.test({ user: { id: 'a1' }, validated: {} }, res, e => { throw e; });
    assert.deepStrictEqual(sent, ['admin@x.co']);
    assert.deepStrictEqual(res.body, { ok: true, to: 'admin@x.co' });
  });

  test('SMTP tanımsızsa 400, gönderim hatasında 502', async () => {
    let err;
    const mk = sendTest => createEmailSettingsHandlers({ store: {}, getAdminEmail: async () => 'a@x.co', sendTest });
    await mk(async () => { const e = new Error('x'); e.code = 'SMTP_NOT_CONFIGURED'; throw e; })
      .test({ user: { id: 'a' } }, mockRes(), e => { err = e; });
    assert.strictEqual(err.status, 400);
    await mk(async () => { throw new Error('auth failed'); })
      .test({ user: { id: 'a' } }, mockRes(), e => { err = e; });
    assert.strictEqual(err.status, 502);
  });

  test('admin e-postası yoksa 400', async () => {
    let err;
    await createEmailSettingsHandlers({ store: {}, getAdminEmail: async () => null, sendTest: async () => {} })
      .test({ user: { id: 'a' } }, mockRes(), e => { err = e; });
    assert.strictEqual(err.status, 400);
  });
});

describe('PUT /admin/settings/email (handler)', () => {
  test('güncelleme yanıtı şifreyi maskeli döner; boş şifre değiştirmez', async () => {
    const rows = {};
    const store = createEmailConfigStore({
      load: async ks => Object.fromEntries(ks.filter(k => rows[k] != null).map(k => [k, rows[k]])),
      save: async (k, v) => { if (v == null) delete rows[k]; else rows[k] = v; },
      env: {}, encrypt: v => `e:${v}`, decrypt: v => v.slice(2), ttlMs: 0,
    });
    const h = createEmailSettingsHandlers({ store });
    const res = mockRes();
    await h.update({ user: { id: 'a' }, validated: { host: 'h', port: 2525, secure: true, pass: 'pw-1234567890' } }, res, e => { throw e; });
    assert.ok(!JSON.stringify(res.body).includes('pw-1234567890'));
    assert.strictEqual(rows['smtp.port'], '2525');
    assert.strictEqual(rows['smtp.secure'], 'true');
    await h.update({ user: { id: 'a' }, validated: { pass: '' } }, mockRes(), e => { throw e; });
    assert.strictEqual(rows['smtp.pass'], 'e:pw-1234567890');
  });

  test('doğrulayıcı geçersiz port/from/bilinmeyen alanı reddeder', () => {
    assert.ok(!updateEmailSettingsSchema.safeParse({ port: 70000 }).success);
    assert.ok(!updateEmailSettingsSchema.safeParse({ from: 'not-an-email' }).success);
    assert.ok(!updateEmailSettingsSchema.safeParse({ evil: 1 }).success);
    assert.ok(updateEmailSettingsSchema.safeParse({ host: 'h', port: '587', secure: false, from: 'a@b.co' }).success);
  });

  test('provider/fromName alanları kabul edilir, bilinmeyen provider reddedilir', () => {
    assert.ok(updateEmailSettingsSchema.safeParse({ provider: 'mailgun', fromName: 'VIP90' }).success);
    assert.ok(updateEmailSettingsSchema.safeParse({ provider: '' }).success);
    assert.ok(!updateEmailSettingsSchema.safeParse({ provider: 'carrier-pigeon' }).success);
    assert.ok(!updateEmailSettingsSchema.safeParse({ fromName: 'x'.repeat(101) }).success);
  });

  test('gatewayEnabled anahtarı boolean/string kabul edilir, anlamsız değer reddedilir', () => {
    assert.ok(updateEmailSettingsSchema.safeParse({ gatewayEnabled: false }).success);
    assert.ok(updateEmailSettingsSchema.safeParse({ gatewayEnabled: true }).success);
    assert.ok(updateEmailSettingsSchema.safeParse({ gatewayEnabled: 'false' }).success);
    assert.ok(updateEmailSettingsSchema.safeParse({ gatewayEnabled: '' }).success);
    assert.ok(!updateEmailSettingsSchema.safeParse({ gatewayEnabled: 'yes' }).success);
  });

  test('gatewayEnabled DB\'ye string yazılır; boş gönderim kaydı siler (default true)', async () => {
    const rows = {};
    const store = createEmailConfigStore({
      load: async ks => Object.fromEntries(ks.filter(k => rows[k] != null).map(k => [k, rows[k]])),
      save: async (k, v) => { if (v == null) delete rows[k]; else rows[k] = v; },
      env: {}, encrypt: v => `e:${v}`, decrypt: v => v.slice(2), ttlMs: 0,
    });
    const h = createEmailSettingsHandlers({ store });
    const res = mockRes();
    await h.update({ user: { id: 'a' }, validated: { gatewayEnabled: false } }, res, e => { throw e; });
    assert.strictEqual(rows['smtp.gatewayEnabled'], 'false', 'boolean false stringe çevrilmeden yazılmamalı');
    const view = Object.fromEntries(res.body.settings.map(s => [s.key, s]));
    assert.strictEqual(view.gatewayEnabled.value, 'false');
    assert.strictEqual(view.gatewayEnabled.source, 'db');
    // Boş gönderim → DB kaydı silinir, default 'true' (eski davranış) geri gelir
    await h.update({ user: { id: 'a' }, validated: { gatewayEnabled: '' } }, mockRes(), e => { throw e; });
    assert.ok(!('smtp.gatewayEnabled' in rows));
    const view2 = Object.fromEntries((await store.getAdminView()).map(s => [s.key, s]));
    assert.strictEqual(view2.gatewayEnabled.value, 'true');
    assert.strictEqual(view2.gatewayEnabled.source, 'default');
  });

  test('provider/fromName DB\'ye yazılır, yanıtta maskelenmez (secret değil)', async () => {
    const rows = {};
    const store = createEmailConfigStore({
      load: async ks => Object.fromEntries(ks.filter(k => rows[k] != null).map(k => [k, rows[k]])),
      save: async (k, v) => { if (v == null) delete rows[k]; else rows[k] = v; },
      env: {}, encrypt: v => `e:${v}`, decrypt: v => v.slice(2), ttlMs: 0,
    });
    const h = createEmailSettingsHandlers({ store });
    const res = mockRes();
    await h.update({ user: { id: 'a' }, validated: { provider: 'mailgun', fromName: 'VIP90' } }, res, e => { throw e; });
    assert.strictEqual(rows['smtp.provider'], 'mailgun');
    assert.strictEqual(rows['smtp.fromName'], 'VIP90');
    const view = Object.fromEntries(res.body.settings.map(s => [s.key, s]));
    assert.strictEqual(view.provider.value, 'mailgun');
    assert.strictEqual(view.fromName.value, 'VIP90');
    assert.strictEqual(view.provider.secret, false);
  });

  test('testEmailSchema geçerli alıcıyı kabul eder, geçersizi reddeder', () => {
    assert.ok(testEmailSchema.safeParse({}).success);
    assert.ok(testEmailSchema.safeParse({ to: 'a@b.co' }).success);
    assert.ok(testEmailSchema.safeParse({ to: '' }).success);
    assert.ok(!testEmailSchema.safeParse({ to: 'not-an-email' }).success);
    assert.ok(!testEmailSchema.safeParse({ evil: 1 }).success);
  });
});

describe('formatFrom — From başlığı', () => {
  test('fromName tanımlıysa site adını ezer, adresi korur', () => {
    assert.strictEqual(formatFrom('VIP90', 'Site Adı', 'noreply@vip90.bet'), '"VIP90" <noreply@vip90.bet>');
  });

  test('fromName boşsa site adı kullanılır (eski davranış)', () => {
    assert.strictEqual(formatFrom('', 'Site Adı', 'a@b.co'), '"Site Adı" <a@b.co>');
    assert.strictEqual(formatFrom(undefined, 'Site Adı', 'a@b.co'), '"Site Adı" <a@b.co>');
  });

  test('isim yoksa düz adres, tırnak/kayıt karakteri temizlenir', () => {
    assert.strictEqual(formatFrom('', '', 'a@b.co'), '<a@b.co>');
    assert.strictEqual(formatFrom('VIP"90\\', '', 'a@b.co'), '"VIP90" <a@b.co>');
    assert.strictEqual(formatFrom('', '', ''), '<noreply@vip90.bet>');
  });
});

describe('email.js transport (mock) — ayar değişince yeniden kurulur', () => {
  test('sendTestEmail mock transport kullanır; ayar değişince yeni transport kurulur; host yoksa hata', async () => {
    const created = [];
    const sentMails = [];
    _setCreateTransport(opts => { created.push(opts); return { sendMail: async m => { sentMails.push(m); return {}; } }; });
    const savedGetAll = emailConfig.getAll;
    let cfg = { host: 'h1', port: '587', secure: 'false', user: 'u', pass: 'p', from: 'f@x.co' };
    emailConfig.getAll = async () => cfg;
    try {
      await sendTestEmail('a@x.co');
      await sendTestEmail('a@x.co');
      assert.strictEqual(created.length, 1, 'aynı ayarla transport yeniden kurulmamalı');
      assert.strictEqual(sentMails.length, 2);
      assert.match(sentMails[0].from, /<f@x\.co>/);
      cfg = { ...cfg, host: 'h2', port: '465', secure: 'true' };
      await sendTestEmail('a@x.co');
      assert.strictEqual(created.length, 2);
      assert.strictEqual(created[1].host, 'h2');
      assert.strictEqual(created[1].secure, true);
      cfg = { ...cfg, host: '' };
      await assert.rejects(() => sendTestEmail('a@x.co'), e => e.code === 'SMTP_NOT_CONFIGURED');
    } finally {
      emailConfig.getAll = savedGetAll;
      _setCreateTransport(null);
    }
  });
});

describe('emailEnvView — sunucu SMTP görünümü (gateway kapalıyken)', () => {
  test('yalnız env + alan varsayılanları; tanımsız alan dahil edilmez', () => {
    const v = emailEnvView({ SMTP_HOST: 'h', SMTP_PORT: '25' });
    assert.strictEqual(v.host, 'h');
    assert.strictEqual(v.port, '25');
    assert.strictEqual(v.secure, 'false');            // EMAIL_FIELDS default
    assert.strictEqual(v.from, 'noreply@vip90.bet');   // EMAIL_FIELDS default
    assert.strictEqual(v.gatewayEnabled, 'true');      // default
    assert.ok(!('user' in v), 'tanımsız env alanı görünümde yer almamalı');
  });

  test('boş env → host yok (transporter kurulmaz)', () => {
    assert.ok(!('host' in emailEnvView({})));
  });
});

describe('email.js transport — Email Gateway anahtarı (gatewayEnabled)', () => {
  test('kapalıyken transport yalnız .env değerine kurulur; açılıp DB değerine döner', async () => {
    const created = [];
    _setCreateTransport(opts => { created.push(opts); return { sendMail: async () => ({}) }; });
    const savedGetAll = emailConfig.getAll;
    const ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_FROM_NAME', 'SMTP_PROVIDER', 'SMTP_GATEWAY_ENABLED'];
    const savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
    try {
      process.env.SMTP_HOST = 'env.host.example';
      process.env.SMTP_FROM = 'env@x.co';
      // DB'de farklı host var ama gateway KAPALI → env kazanır (DB yok sayılır)
      emailConfig.getAll = async () => ({ host: 'db.host.example', port: '25', secure: 'true', user: 'dbu', pass: 'dbp', from: 'db@x.co', gatewayEnabled: 'false' });
      await sendTestEmail('a@x.co');
      assert.strictEqual(created.length, 1);
      assert.strictEqual(created[0].host, 'env.host.example');
      // Gateway AÇIK → getAll (DB > env) değeri; mod imzada → transport yeniden kurulur
      emailConfig.getAll = async () => ({ host: 'db.host.example', port: '25', secure: 'true', user: 'dbu', pass: 'dbp', from: 'db@x.co', gatewayEnabled: 'true' });
      await sendTestEmail('a@x.co');
      assert.strictEqual(created.length, 2, 'mod değişince transport yeniden kurulmalı');
      assert.strictEqual(created[1].host, 'db.host.example');
      // Gateway kapalı + env host yok → SMTP_NOT_CONFIGURED
      delete process.env.SMTP_HOST;
      emailConfig.getAll = async () => ({ host: 'db.host.example', gatewayEnabled: 'false' });
      await assert.rejects(() => sendTestEmail('a@x.co'), e => e.code === 'SMTP_NOT_CONFIGURED');
    } finally {
      emailConfig.getAll = savedGetAll;
      _setCreateTransport(null);
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
