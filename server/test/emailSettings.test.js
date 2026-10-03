import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createEmailSettingsHandlers } from '../src/controllers/integrationSettings.js';
import { createEmailConfigStore } from '../src/config/emailConfig.js';
import { updateEmailSettingsSchema } from '../src/validators/admin.js';
import { sendTestEmail, _setCreateTransport } from '../src/services/email.js';
import { emailConfig } from '../src/config/emailConfig.js';

function mockRes() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe('POST /admin/settings/email/test (handler)', () => {
  test('admin\'in KENDİ e-postasına gönderir, sonucu döner', async () => {
    const sent = [];
    const h = createEmailSettingsHandlers({
      store: {}, getAdminEmail: async id => (id === 'a1' ? 'admin@x.co' : null),
      sendTest: async to => { sent.push(to); },
    });
    const res = mockRes();
    await h.test({ user: { id: 'a1' }, body: { to: 'victim@evil.co' } }, res, e => { throw e; });
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
