/**
 * SMS Gateway — sunucu testleri.
 *
 * Üç katman:
 *   1) Saf yardımcılar (placeholder render, telefon normalizasyonu, anahtar
 *      türetme) — ağ/DB yok.
 *   2) Twilio adaptörü — `fetchImpl` enjekte edilir, gerçek API'ye gidilmez.
 *   3) Controller DI fabrikası + şema doğrulama — sahte servis ve sahte res.
 *
 * `smsTemplate.js` servisinin DB'ye yazan kolları (list/create/send) mongoose
 * gerektirir; onlar `smsTemplateDb.test.js` dosyasında canlı test DB'sine
 * bağlanarak sınanır. Bu dosya kasıtlı olarak DB'siz tutulur.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  extractPlaceholders,
  renderTemplate,
  templateKeyFromTitle,
  DEMO_SMS_TEMPLATES,
  SmsError,
} from '../src/services/smsTemplate.js';
import { normalizePhone, createTwilioSender, createTwilioChecker, isSupportedProvider } from '../src/services/smsGateway.js';
import { listEventsForType, isValidEvent, variablesForEvent, SMS_ACTION_EVENTS, SMS_SCHEDULED_EVENTS } from '../src/services/smsEvents.js';
import { createSmsHandlers } from '../src/controllers/smsTemplate.js';
import { configMissing } from '../src/services/smsSettings.js';
import {
  createSmsTemplateSchema,
  updateSmsTemplateSchema,
  sendSmsSchema,
  updateSmsSettingsSchema,
} from '../src/validators/smsTemplate.js';

// ─── Yardımcılar ──────────────────────────────────────────────────────

describe('SMS şablon yardımcıları', () => {
  test('placeholder listesi sıra korur ve tekrarları eler', () => {
    assert.deepStrictEqual(
      extractPlaceholders('{{username}} {{amount}} {{username}} — {{currency}}'),
      ['username', 'amount', 'currency'],
    );
    assert.deepStrictEqual(extractPlaceholders(''), []);
    assert.deepStrictEqual(extractPlaceholders('tek parantez {amount} sayılmaz'), []);
  });

  test('render: bilinen değişken dolar, bilinmeyen boş kalır ve raporlanır', () => {
    const r = renderTemplate('{{username}} kazandı {{amount}} {{mystery}}', { username: 'Ali', amount: '50' });
    assert.strictEqual(r.text, 'Ali kazandı 50 ');
    assert.deepStrictEqual(r.missing, ['mystery']);
  });

  test('render: sıfır değer "eksik" sayılmaz (0 boş string değildir)', () => {
    const r = renderTemplate('Bakiye: {{balance}}', { balance: 0 });
    assert.strictEqual(r.text, 'Bakiye: 0');
    assert.deepStrictEqual(r.missing, []);
  });

  test('başlıktan camelCase key türer, çakışmada sayı ekler', () => {
    assert.strictEqual(templateKeyFromTitle('Bahis Kazandı Bildirimi'), 'bahisKazandiBildirimi');
    assert.strictEqual(
      templateKeyFromTitle('Bahis Kazandı Bildirimi', ['bahisKazandiBildirimi']),
      'bahisKazandiBildirimi2',
    );
    assert.strictEqual(templateKeyFromTitle('   '), 'sablon');
    assert.strictEqual(templateKeyFromTitle('2026 Kampanyası'), 't2026Kampanyasi');
  });
});

// ─── Yapılandırma eksik parçaları ─────────────────────────────────────

describe('configMissing', () => {
  test('hiçbir şey yoksa üç parça da eksik', () => {
    assert.deepStrictEqual(configMissing({}), ['accountSid', 'authToken', 'sender']);
  });
  test('yalnız provider girilmişse yalnız sender eksik kalır', () => {
    assert.deepStrictEqual(
      configMissing({ accountSid: 'ACx', authToken: 'tok', fromNumber: null, messagingServiceSid: null }),
      ['sender'],
    );
  });
  test('From numarası VEYA Messaging Service SID gönderici sayılır', () => {
    assert.deepStrictEqual(configMissing({ accountSid: 'ACx', authToken: 'tok', fromNumber: '+1555', messagingServiceSid: null }), []);
    assert.deepStrictEqual(configMissing({ accountSid: 'ACx', authToken: 'tok', fromNumber: null, messagingServiceSid: 'MGx' }), []);
  });
});

// ─── Olay kayıt defteri ───────────────────────────────────────────────

describe('SMS olay kayıt defteri', () => {
  test('tip ile olay eşleşmesi denetlenir (action olayı scheduled sayılamaz)', () => {
    assert.strictEqual(isValidEvent('action', 'betWon'), true);
    assert.strictEqual(isValidEvent('scheduled', 'betWon'), false);
    assert.strictEqual(isValidEvent('scheduled', 'bonusExpiring'), true);
    assert.strictEqual(isValidEvent('action', null), false);
  });

  test('olay değişkenleri yalnız tanımlı olaylar için döner', () => {
    assert.deepStrictEqual(variablesForEvent('action', 'betWon'), ['betId', 'amount', 'currency', 'market', 'odds']);
    assert.deepStrictEqual(variablesForEvent('action', 'yokBoyleBirOlay'), []);
  });

  test('demo şablonların olayları kayıt defterinde tanımlı ve içerikleri değişkenleri kullanıyor', () => {
    assert.ok(DEMO_SMS_TEMPLATES.length >= 10, 'demo şablon sayısı yetersiz');
    const seen = new Set();
    for (const doc of DEMO_SMS_TEMPLATES) {
      assert.ok(!seen.has(doc.key), `yinelenen demo anahtarı: ${doc.key}`);
      seen.add(doc.key);
      assert.ok(isValidEvent(doc.type, doc.eventKey), `${doc.key}: olay tanımsız (${doc.eventKey})`);
      const allowed = new Set(['username', ...variablesForEvent(doc.type, doc.eventKey)]);
      for (const v of extractPlaceholders(doc.content)) {
        assert.ok(allowed.has(v), `${doc.key}: "${v}" bu olayda tanımsız`);
      }
      assert.ok(doc.content.length > 0, `${doc.key}: boş içerik`);
    }
  });

  test('demo set her iki tipi de kapsar (aksiyon + zamana duyarlı)', () => {
    const types = new Set(DEMO_SMS_TEMPLATES.map(d => d.type));
    assert.ok(types.has('action'));
    assert.ok(types.has('scheduled'));
    assert.ok(DEMO_SMS_TEMPLATES.some(d => d.eventKey === 'inactiveReminder'), '"we miss you" örneği eksik');
    assert.ok(DEMO_SMS_TEMPLATES.some(d => ['betWon', 'betLost'].includes(d.eventKey)), 'bahis sonucu örneği eksik');
    assert.ok(DEMO_SMS_TEMPLATES.some(d => ['casinoSessionProfit', 'casinoSessionLoss'].includes(d.eventKey)), 'casino oturum örneği eksik');
    assert.ok(DEMO_SMS_TEMPLATES.some(d => d.eventKey === 'depositCompleted'), 'depozito örneği eksik');
    assert.ok(DEMO_SMS_TEMPLATES.some(d => d.eventKey === 'withdrawalCompleted'), 'para çekme örneği eksik');
  });
});

// ─── Telefon normalizasyonu ───────────────────────────────────────────

describe('telefon normalizasyonu', () => {
  test('E.164, 00 öneki ve ülke kodu desteklenir', () => {
    assert.strictEqual(normalizePhone('+90 532 111 22 33'), '+905321112233');
    assert.strictEqual(normalizePhone('00905321112233'), '+905321112233');
    assert.strictEqual(normalizePhone('+905321112233'), '+905321112233');
    assert.strictEqual(normalizePhone('0532 111 22 33', '90'), '+905321112233');
    assert.strictEqual(normalizePhone('+90 (532) 111-22-33'), '+905321112233');
  });

  test('ülke kodu bilinmeden ulusal numara tahmin EDİLMEZ', () => {
    assert.strictEqual(normalizePhone('05321112233'), null);
    assert.strictEqual(normalizePhone('5321112233', ''), null);
  });

  test('biçimsiz ve kısa numaralar reddedilir', () => {
    for (const bad of ['', '   ', null, undefined, '123', '+1234', 'abc', '+9053211122334567890']) {
      assert.strictEqual(normalizePhone(bad, '90'), null, `${bad} reddedilmeliydi`);
    }
  });
});

// ─── Twilio adaptörü ──────────────────────────────────────────────────

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

describe('Twilio gönderim adaptörü', () => {
  const base = { accountSid: 'ACtest', authToken: 'tok', from: '+905321112233' };

  test('doğru uç, Basic auth ve form gövdesi ile POST yapar', async () => {
    let captured = null;
    const send = createTwilioSender({
      fetchImpl: async (url, opts) => {
        captured = { url, opts };
        return jsonResponse({ sid: 'SM1', status: 'queued' });
      },
    });

    const res = await send({ ...base, to: '0532 111 22 33', body: 'Merhaba', defaultCountryCode: '90' });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.sid, 'SM1');
    assert.strictEqual(res.status, 'queued');
    assert.strictEqual(captured.url, 'https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
    assert.strictEqual(captured.opts.method, 'POST');
    assert.strictEqual(
      captured.opts.headers.Authorization,
      `Basic ${Buffer.from('ACtest:tok').toString('base64')}`,
    );
    const params = new URLSearchParams(captured.opts.body);
    assert.strictEqual(params.get('To'), '+905321112233');
    assert.strictEqual(params.get('From'), '+905321112233');
    assert.strictEqual(params.get('Body'), 'Merhaba');
    assert.strictEqual(params.get('MessagingServiceSid'), null);
  });

  test('Messaging Service verilirse From gönderilmez (Twilio ikisini kabul etmez)', async () => {
    let body = null;
    const send = createTwilioSender({
      fetchImpl: async (_url, opts) => { body = new URLSearchParams(opts.body); return jsonResponse({ sid: 'SM2', status: 'queued' }); },
    });
    await send({ ...base, from: null, messagingServiceSid: 'MG123', to: '+905321112233', body: 'x' });
    assert.strictEqual(body.get('MessagingServiceSid'), 'MG123');
    assert.strictEqual(body.get('From'), null);
  });

  test('eksik kimlik bilgisi / gönderici / geçersiz numara ağa çıkmadan hata döner', async () => {
    let called = false;
    const send = createTwilioSender({ fetchImpl: async () => { called = true; return jsonResponse({}); } });

    assert.strictEqual((await send({ to: '+905321112233', body: 'x' })).code, 'SMS_CREDENTIALS_MISSING');
    assert.strictEqual((await send({ ...base, to: '123' })).code, 'SMS_INVALID_PHONE');
    assert.strictEqual((await send({ ...base, from: null, to: '+905321112233' })).code, 'SMS_SENDER_MISSING');
    assert.strictEqual(called, false, 'geçersiz girdide ağa çıkılmamalı');
  });

  test('Twilio HTTP hatası kodu ve mesajı yüzeye taşır', async () => {
    const send = createTwilioSender({
      fetchImpl: async () => jsonResponse({ code: 21211, message: 'The To number is not valid' }, { ok: false, status: 400 }),
    });
    const res = await send({ ...base, to: '+905321112233', body: 'x' });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'TWILIO_21211');
    assert.match(res.error, /not valid/);
  });

  test('2xx dönse bile Twilio "failed" statüsü gönderilmiş sayılmaz', async () => {
    const send = createTwilioSender({
      fetchImpl: async () => jsonResponse({ sid: 'SM3', status: 'failed', error_code: 30003, error_message: 'Unreachable' }),
    });
    const res = await send({ ...base, to: '+905321112233', body: 'x' });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.status, 'failed');
    assert.match(res.error, /Unreachable/);
  });

  test('ağ hatası throw etmez, hata nesnesine döner', async () => {
    const send = createTwilioSender({
      fetchImpl: async () => { throw new Error('socket hang up'); },
    });
    const res = await send({ ...base, to: '+905321112233', body: 'x' });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'SMS_NETWORK_ERROR');
  });
});

describe('Twilio kimlik bilgisi testi (mesaj göndermez)', () => {
  test('GET Accounts ucunu çağırır ve hesap adını döner', async () => {
    let captured = null;
    const check = createTwilioChecker({
      fetchImpl: async (url, opts) => {
        captured = { url, opts };
        return jsonResponse({ status: 'active', friendly_name: 'Demo Account' });
      },
    });
    const res = await check({ accountSid: 'ACtest', authToken: 'tok' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.friendlyName, 'Demo Account');
    assert.strictEqual(captured.opts.method, 'GET');
    assert.ok(captured.url.endsWith('/2010-04-01/Accounts/ACtest.json'));
    assert.ok(!captured.url.includes('Messages.json'), 'test mesaj GÖNDERMEMELİ');
  });

  test('kimlik bilgisi yoksa ağa gitmez', async () => {
    let called = false;
    const check = createTwilioChecker({ fetchImpl: async () => { called = true; return jsonResponse({}); } });
    assert.strictEqual((await check({ accountSid: 'ACx' })).code, 'SMS_CREDENTIALS_MISSING');
    assert.strictEqual(called, false);
  });
});

// ─── Router yüzeyi ────────────────────────────────────────────────────

describe('SMS router yüzeyi', () => {
  test('admin router\'ı /sms alt router\'ını mount eder', async () => {
    const adminRouter = (await import('../src/routes/admin.js')).default;
    const mounted = adminRouter.stack.some(layer => /\/sms/.test(layer.regexp?.source ?? ''));
    assert.ok(mounted, 'admin router içinde /sms mount\'u bulunamadı');
  });

  test('beklenen yol + metot tanımları mevcut', async () => {
    const smsRouter = (await import('../src/routes/smsTemplate.js')).default;
    const has = (path, method) => smsRouter.stack.some(
      layer => layer.route?.path === path && layer.route.methods[method],
    );

    for (const path of ['/settings', '/templates', '/logs']) {
      assert.ok(has(path, 'get'), `GET ${path} yok`);
    }
    assert.ok(has('/settings', 'patch'), 'PATCH /settings yok');
    assert.ok(has('/settings/test', 'post'), 'POST /settings/test yok');
    assert.ok(has('/templates', 'post'), 'POST /templates yok');
    assert.ok(has('/templates/:id', 'patch'), 'PATCH /templates/:id yok');
    assert.ok(has('/templates/:id', 'delete'), 'DELETE /templates/:id yok');
    assert.ok(has('/templates/:id/send', 'post'), 'POST /templates/:id/send yok');
  });
});

test('desteklenmeyen sağlayıcı sessizce twilio\'ya düşmez', () => {
  assert.strictEqual(isSupportedProvider('twilio'), true);
  assert.strictEqual(isSupportedProvider('netgsm'), false);
});

// ─── Zod şemaları ─────────────────────────────────────────────────────

describe('SMS istek şemaları', () => {
  test('sistem mesajı olaysız reddedilir', () => {
    const r = createSmsTemplateSchema.safeParse({ title: 'X', type: 'action', content: 'y' });
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.error.issues[0].path.join('.'), 'eventKey');
  });

  test('sistem mesajı olaylı ve zaman ağırlıklı olaysız kabul edilir', () => {
    assert.strictEqual(createSmsTemplateSchema.safeParse({ title: 'X', type: 'action', eventKey: 'betWon', content: 'y' }).success, true);
    assert.strictEqual(createSmsTemplateSchema.safeParse({ title: 'X', type: 'scheduled', content: 'y' }).success, true);
  });

  test('bilinmeyen tip, kategori ve aşırı uzun içerik reddedilir', () => {
    assert.strictEqual(createSmsTemplateSchema.safeParse({ title: 'X', type: 'email', content: 'y' }).success, false);
    assert.strictEqual(createSmsTemplateSchema.safeParse({ title: 'X', type: 'scheduled', category: 'hacker', content: 'y' }).success, false);
    assert.strictEqual(createSmsTemplateSchema.safeParse({ title: 'X', type: 'scheduled', content: 'a'.repeat(1001) }).success, false);
  });

  test('güncelleme kısmi kabul edilir, tip değişimi tek başına geçerlidir', () => {
    assert.strictEqual(updateSmsTemplateSchema.safeParse({ isActive: false }).success, true);
    assert.strictEqual(updateSmsTemplateSchema.safeParse({ type: 'scheduled' }).success, true);
    assert.strictEqual(updateSmsTemplateSchema.safeParse({ title: '' }).success, false);
  });

  test('gönderim isteği hedef kitleyi ve ülke kodu biçimini doğrular', () => {
    assert.strictEqual(sendSmsSchema.safeParse({ audienceType: 'users', userIds: ['a'] }).success, true);
    assert.strictEqual(sendSmsSchema.safeParse({ audienceType: 'telefon' }).success, false);
    assert.strictEqual(updateSmsSettingsSchema.safeParse({ defaultCountryCode: '90' }).success, true);
    assert.strictEqual(updateSmsSettingsSchema.safeParse({ defaultCountryCode: 'TR' }).success, false);
    assert.strictEqual(updateSmsSettingsSchema.safeParse({ provider: 'netgsm' }).success, false);
  });
});

// ─── Controller (DI fabrikası) ─────────────────────────────────────────

function mockRes() {
  return {
    statusCode: 200,
    body: undefined,
    jsonCalls: 0,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.jsonCalls += 1; this.body = payload; return this; },
  };
}

function fakeService(over = {}) {
  return {
    MAX_RECIPIENTS: 2000,
    async listTemplates() {
      return { templates: [{ _id: 't1', key: 'k', type: 'scheduled' }], summary: { all: 1, active: 1, action: 0, scheduled: 1 } };
    },
    async createTemplate(data, adminId) { return { _id: 't1', ...data, createdBy: adminId }; },
    async updateTemplate(id, data) { return { _id: id, ...data }; },
    async deleteTemplate() { return true; },
    async sendTemplate(opts) { return { total: 2, sent: 2, failed: 0, skipped: 0, capped: false, missing: [], seen: opts }; },
    async listLogs() { return { logs: [{ _id: 'l1', status: 'sent' }], summary: { sent: 1, failed: 0, skipped: 0 } }; },
    ...over,
  };
}

describe('SMS controller handler\'ları', () => {
  test('liste: şablonlar + özet + olay listeleri + alıcı tavanı tek yanıtta', async () => {
    const h = createSmsHandlers({ service: fakeService() });
    const res = mockRes();
    await h.list({ query: {} }, res, () => {});
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.templates.length, 1);
    assert.strictEqual(res.body.maxRecipients, 2000);
    assert.strictEqual(res.body.events.action.length, SMS_ACTION_EVENTS.length);
    assert.strictEqual(res.body.events.scheduled.length, SMS_SCHEDULED_EVENTS.length);
  });

  test('liste: type filtresi servise aynen geçer', async () => {
    let seen = null;
    const h = createSmsHandlers({
      service: fakeService({ async listTemplates(opts) { seen = opts; return { templates: [], summary: {} }; } }),
    });
    await h.list({ query: { type: 'action', isActive: 'true', search: 'bonus' } }, mockRes());
    assert.deepStrictEqual(seen, { type: 'action', isActive: true, search: 'bonus' });
  });

  test('create: doğrulanmış gövde ve operatör kimliği servise geçer', async () => {
    let seen = null;
    const h = createSmsHandlers({
      service: fakeService({ async createTemplate(data, adminId) { seen = { data, adminId }; return {}; } }),
    });
    const res = mockRes();
    await h.create({ validated: { title: 'X', type: 'scheduled', content: 'y' }, user: { id: 'admin1' } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(seen.adminId, 'admin1');
    assert.strictEqual(seen.data.title, 'X');
  });

  test('send: route parametresi şablon id\'si olarak kullanılır', async () => {
    let seen = null;
    const h = createSmsHandlers({
      service: fakeService({ async sendTemplate(opts) { seen = opts; return { total: 0, sent: 0, failed: 0, skipped: 0, capped: false, missing: [] }; } }),
    });
    const res = mockRes();
    await h.send({
      params: { id: 'tpl9' },
      validated: { audienceType: 'segment', segmentId: 'seg1', userIds: [], variables: { amount: '10' } },
      user: { id: 'admin1' },
    }, res);
    assert.strictEqual(res.body.total, 0);
    assert.strictEqual(seen.templateId, 'tpl9');
    assert.strictEqual(seen.audienceType, 'segment');
    assert.deepStrictEqual(seen.variables, { amount: '10' });
    assert.strictEqual(seen.adminId, 'admin1');
  });

  test('logs: sorgu parametresi doğrulanır (global validate() query\'i görmez)', async () => {
    let seen = null;
    const h = createSmsHandlers({
      service: fakeService({ async listLogs(opts) { seen = opts; return { logs: [], summary: {} }; } }),
    });

    const res = mockRes();
    await h.logs({ query: { status: 'failed', limit: '10' } }, res);
    assert.deepStrictEqual(seen, { status: 'failed', limit: 10 });
    assert.strictEqual(res.statusCode, 200);

    const bad = mockRes();
    await h.logs({ query: { status: 'patladi' } }, bad);
    assert.strictEqual(bad.statusCode, 400);
    assert.strictEqual(bad.body.error.code, 'VALIDATION_ERROR');
  });

  test('async handler reddi `next`\'e aktarılır (Express 4 async throw yakalamaz)', async () => {
    // Regresyon: async handler reddedilirse Express 4 yanıtı hiç göndermez ve
    // istek asılı kalır (unhandledRejection). Canlı smoke testte yakalandı:
    // aksiyon şablonunu gönderme denemesi 400 yerine boşta asılı kalmıştı.
    const boom = new SmsError('patladı', 'SMS_BOOM');
    const throwingService = {
      MAX_RECIPIENTS: 2000,
      listTemplates: async () => { throw boom; },
      createTemplate: async () => { throw boom; },
      updateTemplate: async () => { throw boom; },
      deleteTemplate: async () => { throw boom; },
      sendTemplate: async () => { throw boom; },
      sendTestSms: async () => { throw boom; },
      listLogs: async () => { throw boom; },
    };
    const h = createSmsHandlers({
      service: throwingService,
      senders: {
        async listSenders() { throw boom; },
        async createSender() { throw boom; },
        async updateSender() { throw boom; },
        async deleteSender() { throw boom; },
        async resolveSenderGate() { throw boom; },
      },
      getSettings: async () => { throw boom; },
      getConfig: async () => { throw boom; },
      getSettingsStatus: async () => { throw boom; },
      saveSettings: async () => { throw boom; },
      createProviderChecker: () => async () => { throw boom; },
    });

    assert.deepStrictEqual(Object.keys(h).sort(), [
      'create', 'list', 'logs', 'remove', 'send', 'senderCreate', 'senderGate',
      'senderList', 'senderRemove', 'senderUpdate', 'settingsStatus', 'settingsTest',
      'settingsUpdate', 'testSend', 'update',
    ]);

    for (const name of Object.keys(h)) {
      let forwarded = null;
      const res = mockRes();
      // `next` SENKRON çağrılmalı: Express hata yakalayıp errorHandler'a versin.
      // Sarmalayıcı OLMADAN bu çağrı reddedilirdi: `await done` patlar.
      // Sarmalayıcı İLE red `next`\'e düşer, çağrı çözülür.
      const done = h[name](
        { query: {}, params: { id: 'x' }, validated: {}, user: { id: 'a' } },
        res,
        err => { forwarded = err; },
      );
      await done;
      assert.strictEqual(forwarded, boom, `${name}: red next()\'e aktarılmadı`);
      // Hata yolunda handler HİÇ yanıt yazmamalı — yanıtı global errorHandler
      // üretir (aksi hâlde "Cannot set headers after they are sent" olurdu).
      assert.strictEqual(res.body, undefined, `${name}: hata durumunda gövde yazılmamalı`);
      assert.strictEqual(res.jsonCalls, 0, `${name}: hata durumunda json() çağrılmamalıydı`);
    }
  });

  test('settingsTest: kimlik bilgisi eksikse ağa gitmeden döner + eksik parçaları listeler', async () => {
    let called = false;
    const h = createSmsHandlers({
      getConfig: async () => ({ configured: false }),
      createProviderChecker: () => async () => { called = true; return { ok: true }; },
    });
    const res = mockRes();
    await h.settingsTest({}, res);
    assert.strictEqual(res.body.ok, false);
    assert.strictEqual(res.body.code, 'SMS_NOT_CONFIGURED');
    assert.deepStrictEqual(res.body.missing, ['accountSid', 'authToken', 'sender']);
    assert.strictEqual(called, false);
  });

  test('settingsTest: yalnız provider girilmişse eksik alan "sender" olarak döner', async () => {
    const h = createSmsHandlers({
      getConfig: async () => ({ configured: false, accountSid: 'ACx', authToken: 'tok', fromNumber: null, messagingServiceSid: null }),
      createProviderChecker: () => async () => ({ ok: true }),
    });
    const res = mockRes();
    await h.settingsTest({}, res);
    assert.strictEqual(res.body.ok, false);
    assert.deepStrictEqual(res.body.missing, ['sender']);
  });

  test('settingsTest: yapılandırılmışsa sağlayıcı denetleyicisine gider', async () => {
    let seen = null;
    const h = createSmsHandlers({
      getConfig: async () => ({ provider: 'twilio', configured: true, accountSid: 'ACx', authToken: 'tok' }),
      createProviderChecker: (provider) => {
        assert.strictEqual(provider, 'twilio');
        return async (opts) => { seen = opts; return { ok: true, friendlyName: 'Demo' }; };
      },
    });
    const res = mockRes();
    await h.settingsTest({}, res);
    assert.deepStrictEqual(seen, { accountSid: 'ACx', authToken: 'tok' });
    assert.strictEqual(res.body.friendlyName, 'Demo');
  });
});