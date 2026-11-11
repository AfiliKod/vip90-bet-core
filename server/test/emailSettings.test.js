import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createEmailSettingsHandlers } from '../src/controllers/integrationSettings.js';
import { createEmailConfigStore, emailEnvView } from '../src/config/emailConfig.js';
import { updateEmailSettingsSchema, testEmailSchema } from '../src/validators/admin.js';
import { sendTestEmail, sendEmail, formatFrom, fromParts, _setCreateTransport, _setCreateMailtrapClient } from '../src/services/email.js';
import { emailConfig, resolveEmailMode } from '../src/config/emailConfig.js';

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
    await mk(async () => { const e = new Error('x'); e.code = 'MAIL_PROVIDER_NOT_CONFIGURED'; throw e; })
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
      await assert.rejects(() => sendTestEmail('a@x.co'), e => e.code === 'MAIL_PROVIDER_NOT_CONFIGURED');
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
    const ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_FROM_NAME', 'SMTP_PROVIDER', 'SMTP_GATEWAY_ENABLED', 'MAILTRAP_TOKEN', 'MAILTRAP_SANDBOX', 'MAILTRAP_INBOX_ID'];
    const savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
    // Token'ın kendisi modu değiştirir: bu test SMTP'yi ölçer, env'de token kalmasın.
    delete process.env.MAILTRAP_TOKEN;
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
      // Gateway kapalı + env host/token yok → MAIL_PROVIDER_NOT_CONFIGURED
      delete process.env.SMTP_HOST;
      emailConfig.getAll = async () => ({ host: 'db.host.example', gatewayEnabled: 'false' });
      await assert.rejects(() => sendTestEmail('a@x.co'), e => e.code === 'MAIL_PROVIDER_NOT_CONFIGURED');
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

describe('resolveEmailMode — gönderme mekanizması seçimi', () => {
  test('token + provider mailtrap → mailtrap API', () => {
    assert.strictEqual(resolveEmailMode({ token: 't', provider: 'mailtrap' }), 'mailtrap');
  });

  test('token var, SMTP host yok → mailtrap API (token-only kurulum)', () => {
    assert.strictEqual(resolveEmailMode({ token: 't' }), 'mailtrap');
  });

  test('host var ve sağlayıcı mailtrap DEĞİL → SMTP; token yalnızca yanıltmaca', () => {
    assert.strictEqual(resolveEmailMode({ host: 'smtp.mailgun.org', provider: 'mailgun', token: 't' }), 'smtp');
    assert.strictEqual(resolveEmailMode({ host: 'h', token: 't' }), 'smtp');
  });

  test('mailtrap seçiliyse eski SMTP host değeri de olsa API kazanır', () => {
    assert.strictEqual(resolveEmailMode({ host: 'smtp.mailgun.org', provider: 'mailtrap', token: 't' }), 'mailtrap');
  });

  test('ikisi de yok → none (email.js mock\'a düşer)', () => {
    assert.strictEqual(resolveEmailMode({ host: '', token: '' }), 'none');
    assert.strictEqual(resolveEmailMode({}), 'none');
  });
});

describe('email.js Mailtrap API yolu (mock client)', () => {
  function withMailtrapClient(cfg, fn) {
    const created = [];
    const sent = [];
    const warns = [];
    const savedWarn = console.warn;
    _setCreateMailtrapClient((opts) => {
      created.push(opts);
      return {
        send: async (m) => {
          sent.push(m);
          return { messages: [{ email: m.to[0].email }] };
        },
      };
    });
    const savedGetAll = emailConfig.getAll;
    emailConfig.getAll = async () => cfg;
    console.warn = (...a) => warns.push(a.join(' '));
    return (async () => {
      try { return await fn({ created, sent, warns }); }
      finally {
        emailConfig.getAll = savedGetAll;
        _setCreateMailtrapClient(null);
        console.warn = savedWarn;
      }
    })();
  }

  const base = { provider: 'mailtrap', token: 'tok-1', from: 'postmaster@vip90.bet', fromName: 'VIP90 Bet', gatewayEnabled: 'true' };

  test('mesaj biçimi: from {email,name} ve to [{email}] (SMTP düz stringi değil)', () =>
    withMailtrapClient({ ...base }, async ({ sent }) => {
      await sendEmail({ to: 'player@x.co', subject: 's', html: '<p>hi</p>' });
      assert.deepStrictEqual(sent[0].from, { email: 'postmaster@vip90.bet', name: 'VIP90 Bet' });
      assert.deepStrictEqual(sent[0].to, [{ email: 'player@x.co' }]);
      assert.strictEqual(sent[0].subject, 's');
      assert.match(sent[0].html, /<p>hi<\/p>/);
    }));

  test('fromName boşsa site adı From adına düşer (formatFrom ile aynı kural)', () =>
    withMailtrapClient({ ...base, fromName: '' }, async ({ sent }) => {
      await sendEmail({ to: 'player@x.co', subject: 's', html: 'x' });
      assert.strictEqual(sent[0].from.email, 'postmaster@vip90.bet');
      assert.ok(sent[0].from.name && sent[0].from.name !== '', 'boş ad gönderilmemeli');
    }));

  test('token değişince client yeniden kurulur, aynı tokenla kurulmaz', () =>
    withMailtrapClient({ ...base }, async ({ created, sent }) => {
      await sendTestEmail('a@x.co');
      await sendTestEmail('b@x.co');
      assert.strictEqual(created.length, 1, 'aynı tokenla client yeniden kurulmamalı');
      assert.strictEqual(created[0].token, 'tok-1');
      assert.ok(!created[0].sandbox, 'sandbox varsayılanı kapalı');
      await sendEmail({ to: 'c@x.co', subject: 's', html: 'x', __token: undefined });
      assert.strictEqual(sent.length, 3);
    }));

  test('sandbox açık → client sandbox+testInboxId ile kurulur ve uyarı basılır', () =>
    withMailtrapClient({ ...base, useSandbox: 'true', sandboxInboxId: '42' }, async ({ created, warns }) => {
      await sendTestEmail('a@x.co');
      assert.strictEqual(created[0].sandbox, true);
      assert.strictEqual(created[0].testInboxId, 42);
      assert.match(warns.join('\n'), /SANDBOX/, 'Sandbox açıkken sessiz kalmamalı');
    }));

  test('sandbox açık ama inbox yok → MAILTRAP_SANDBOX_INBOX_MISSING (canlı API\'ye düşmez)', () =>
    withMailtrapClient({ ...base, useSandbox: 'true', sandboxInboxId: '' }, async ({ created }) => {
      assert.strictEqual(created.length, 0);
      await assert.rejects(() => sendTestEmail('a@x.co'), e => e.code === 'MAILTRAP_SANDBOX_INBOX_MISSING');
    }));

  test('Mailtrap yolu SMTP transport\'unu kurmaz (host dolu olsa da)', () =>
    withMailtrapClient({ ...base, host: 'smtp.mailgun.org', port: '587' }, async ({ sent }) => {
      const savedCreateTransport = _setCreateTransport;
      let smtpUsed = 0;
      _setCreateTransport(() => { smtpUsed += 1; return { sendMail: async () => ({}) }; });
      try {
        await sendTestEmail('a@x.co');
      } finally {
        _setCreateTransport(null);
        void savedCreateTransport;
      }
      assert.strictEqual(smtpUsed, 0);
      assert.strictEqual(sent.length, 1);
    }));

  test('gateway kapalıyken token .env\'den çözülür (DB token\'ı yok sayılır)', async () => {
    const ENV_KEYS = ['SMTP_HOST', 'SMTP_FROM', 'SMTP_PROVIDER', 'SMTP_GATEWAY_ENABLED', 'MAILTRAP_TOKEN', 'MAILTRAP_SANDBOX', 'MAILTRAP_INBOX_ID'];
    const saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
    const created = [];
    try {
      process.env.MAILTRAP_TOKEN = 'env-tok';
      process.env.SMTP_PROVIDER = 'mailtrap';
      process.env.SMTP_GATEWAY_ENABLED = 'false';
      process.env.SMTP_FROM = 'env@x.co';
      delete process.env.SMTP_HOST;
      _setCreateMailtrapClient(opts => { created.push(opts); return { send: async () => ({}) }; });
      const savedGetAll = emailConfig.getAll;
      // DB'de başka bir token var: gateway kapalı → hiç girmemeli.
      emailConfig.getAll = async () => ({ token: 'db-tok', provider: 'mailgun', gatewayEnabled: 'false' });
      try {
        await sendTestEmail('a@x.co');
        assert.strictEqual(created.length, 1);
        assert.strictEqual(created[0].token, 'env-tok');
      } finally {
        emailConfig.getAll = savedGetAll;
      }
    } finally {
      _setCreateMailtrapClient(null);
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe('fromParts — API From nesnesi', () => {
  test('ad/ adres ayrımı ve tırnak temizliği formatFrom ile aynı kaynaklı', () => {
    assert.deepStrictEqual(fromParts('VIP"90', 'Site', 'a@b.co'), { name: 'VIP90', email: 'a@b.co' });
    assert.deepStrictEqual(fromParts('', '', ''), { name: '', email: 'noreply@vip90.bet' });
    // formatFrom aynı parçalardan türer (tek kaynak bozulmasın)
    assert.strictEqual(formatFrom('VIP90', 'Site', 'a@b.co'), '"VIP90" <a@b.co>');
  });
});
