import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  MAIL_EVENTS,
  COMMON_VARIABLES,
  DEFAULT_TEMPLATES,
  CATEGORY_ACTION,
  CATEGORY_SCHEDULED,
  eventCategory,
  eventVariables,
  renderTemplate,
  renderTemplateDocument,
  buildSampleVars,
  ensureDefaultMailTemplates,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateByEvent,
  invalidateMailTemplateCache,
} from '../src/services/mailTemplates.js';
import { sendBulk, sendActionMail, resolveAudience, getBatchLimit } from '../src/services/systemMail.js';
import { buildQueryFromCriteria } from '../src/services/playerSegment.js';
import SystemMailTemplate from '../src/models/SystemMailTemplate.js';
import User from '../src/models/User.js';
import SystemMailLog from '../src/models/SystemMailLog.js';
import {
  createMailTemplateSchema,
  updateMailTemplateSchema,
  sendMailTemplateSchema,
  previewMailSchema,
} from '../src/validators/adminMailTemplates.js';

// Klasördeki testlerin çoğu in-memory Mongo kullanmaz; lokal MongoDB hedefi
// izole bir veritabanına bağlanır ve test sonunda silinir.
const TEST_DB = 'mongodb://localhost:27017/betzone_test_systemmail';

describe('mailTemplates — render', () => {
  it('değişkenleri kaçırır ve HTML olarak kaçırır', () => {
    const out = renderTemplate('Merhaba {{name}} <b>{{city}}</b> {{yok}}', { name: '<i>Ayşe</i>', city: 'İzmir' });
    // Yalnızca DEĞERLER kaçırılır; şablonun kendi HTML'i olduğu gibi kalır.
    assert.equal(out, 'Merhaba &lt;i&gt;Ayşe&lt;/i&gt; <b>İzmir</b> ');
  });

  it('başlıkta HTML kaçırma uygulanmaz (konu düz metindir)', () => {
    const out = renderTemplate('Konu {{name}}', { name: '<b>X</b>' }, { escape: false });
    assert.equal(out, 'Konu <b>X</b>');
  });

  it('{{#if}} / {{#unless}} bloklarını ve iç içeliği çözer', () => {
    const tpl = '{{#if a}}A{{#if b}}B{{/if}}C{{/if}}{{#unless a}}D{{/unless}}';
    assert.equal(renderTemplate(tpl, { a: true, b: true }), 'ABC');
    assert.equal(renderTemplate(tpl, { a: true, b: false }), 'AC');
    assert.equal(renderTemplate(tpl, { a: false }), 'D');
  });

  it('gerçekçi olmayan yanlışlıkla sonsuz döngüye girmez', () => {
    // Blok gövdesindeki başka bir blok etiketi düz metin gibi davranır.
    const out = renderTemplate('{{#if a}}x{{/if}}{{/if}}', { a: true });
    assert.equal(out, 'x{{/if}}');
  });

  it('CTA doluysa buton + yedek bağlantı ekler, boşken eklemez', () => {
    const withCta = renderTemplateDocument(
      { subject: 'S', body: '<p class="m-p">gövde</p>', ctaLabel: 'Git', ctaUrl: 'https://x.test/p' },
      {},
      { siteName: 'VIP' },
    );
    assert.match(withCta.html, /https:\/\/x\.test\/p/);
    assert.match(withCta.html, /Git/);

    const withoutCta = renderTemplateDocument(
      { subject: 'S', body: '<p class="m-p">gövde</p>', ctaLabel: 'Git', ctaUrl: '' },
      {},
      {},
    );
    assert.ok(!withoutCta.html.includes('Git'), 'bağlantı yokken buton basılmamalı');
  });

  it('preheader gövdeye gizlenir', () => {
    const { html } = renderTemplateDocument(
      { subject: 'S', preheader: 'Önizleme metni', body: '<p class="m-p">gövde</p>' },
      {},
      {},
    );
    assert.match(html, /Önizleme metni/);
  });
});

describe('mailTemplates — katalog ve varsayılan içerik', () => {
  it('her olay bir kategoriye sahiptir', () => {
    for (const [event, meta] of Object.entries(MAIL_EVENTS)) {
      assert.ok(
        meta.category === CATEGORY_ACTION || meta.category === CATEGORY_SCHEDULED,
        `${event} geçerli kategoriye sahip değil`,
      );
      assert.equal(eventCategory(event), meta.category);
    }
  });

  it('varsayılan şablonlar bilinen olaylar için tanımlıdır', () => {
    assert.ok(DEFAULT_TEMPLATES.length >= 5, 'en az 5 demo şablon tohumlanmalı');
    for (const tpl of DEFAULT_TEMPLATES) {
      assert.ok(MAIL_EVENTS[tpl.event], `${tpl.event} katalogda yok`);
      assert.equal(tpl.category, eventCategory(tpl.event), `${tpl.event} kategorisi katalogla çelişiyor`);
      assert.ok(tpl.name && tpl.subject && tpl.body, `${tpl.event} eksik alan`);
    }
  });

  it('demo şablonlar hem aksiyon hem zamana duyarlı örnek içerir', () => {
    const cats = new Set(DEFAULT_TEMPLATES.map(t => t.category));
    assert.ok(cats.has(CATEGORY_ACTION), 'aksiyon örneği yok');
    assert.ok(cats.has(CATEGORY_SCHEDULED), 'zamana duyarlı örneği yok');
  });

  it('demo içerikte kullanılan tüm değişkenler katalogda mevcuttur', () => {
    for (const tpl of DEFAULT_TEMPLATES) {
      const pool = new Set(eventVariables(tpl.event));
      const used = new Set();
      const body = `${tpl.subject}\n${tpl.preheader || ''}\n${tpl.body}\n${tpl.ctaUrl || ''}`;
      for (const m of body.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)) used.add(m[1]);
      for (const v of used) {
        assert.ok(pool.has(v), `${tpl.event} şablonu katalogda olmayan {{${v}}} kullanıyor`);
      }
      for (const v of COMMON_VARIABLES) assert.ok(pool.has(v), `${tpl.event} ortak değişkenleri içermiyor`);
    }
  });

  it('örnek değişkenler her olay için üretilir', () => {
    for (const event of Object.keys(MAIL_EVENTS)) {
      const vars = buildSampleVars(event);
      assert.equal(typeof vars.username, 'string');
      assert.equal(typeof vars.siteName, 'string');
      for (const v of eventVariables(event)) assert.ok(v in vars, `${event}: örnek {{${v}}} yok`);
    }
  });
});

describe('mailTemplates — validatörler', () => {
  it('bilinmeyen olayı reddeder', () => {
    const r = createMailTemplateSchema.safeParse({ event: 'nope.event', name: 'X', subject: 'S', body: 'B' });
    assert.equal(r.success, false);
  });

  it('geçerli olayla oluşturmayı kabul eder', () => {
    const r = createMailTemplateSchema.safeParse({ event: 'bet.settled', name: 'X', subject: 'S', body: 'B' });
    assert.equal(r.success, true);
  });

  it('güncellemede olay alanını reddeder (bağ sabittir)', () => {
    const r = updateMailTemplateSchema.safeParse({ event: 'bet.settled' });
    assert.equal(r.success, false);
  });

  it('kısmi güncelleme kabul edilir', () => {
    assert.equal(updateMailTemplateSchema.safeParse({ name: 'Yeni ad' }).success, true);
    assert.equal(updateMailTemplateSchema.safeParse({}).success, true);
  });

  it('kitle tipini doğrular', () => {
    assert.equal(sendMailTemplateSchema.safeParse({ audience: { type: 'all' } }).success, true);
    assert.equal(sendMailTemplateSchema.safeParse({ audience: { type: 'inactive', inactiveDays: 7 } }).success, true);
    assert.equal(sendMailTemplateSchema.safeParse({ audience: { type: 'bogus' } }).success, false);
  });

  it('önizleme isteğinde bilinmeyen olayı reddeder', () => {
    assert.equal(previewMailSchema.safeParse({ event: 'nope', subject: 'S', body: 'B' }).success, false);
    assert.equal(previewMailSchema.safeParse({ subject: 'S', body: 'B' }).success, true);
  });
});

describe('systemMail — gönderim guardları', () => {
  it('aksiyon kategorisi elle gönderime kapalıdır', async () => {
    await assert.rejects(
      () => sendBulk({ _id: new mongoose.Types.ObjectId(), category: CATEGORY_ACTION, enabled: true, event: 'bet.settled' }),
      (e) => e.code === 'MAIL_ACTION_TRIGGER_ONLY' && e.status === 400,
    );
  });

  it('pasif şablon gönderilemez', async () => {
    await assert.rejects(
      () => sendBulk({ _id: new mongoose.Types.ObjectId(), category: CATEGORY_SCHEDULED, enabled: false, event: 'campaign.broadcast' }),
      (e) => e.code === 'MAIL_TEMPLATE_DISABLED' && e.status === 400,
    );
  });

  it('sistem anahtarı kapalıyken 503 döner', async () => {
    const prev = process.env.MAIL_SYSTEM_DISABLED;
    process.env.MAIL_SYSTEM_DISABLED = 'true';
    try {
      await assert.rejects(
        () => sendBulk({ _id: new mongoose.Types.ObjectId(), category: CATEGORY_SCHEDULED, enabled: true, event: 'campaign.broadcast' }),
        (e) => e.code === 'MAIL_SYSTEM_DISABLED' && e.status === 503,
      );
    } finally {
      if (prev === undefined) delete process.env.MAIL_SYSTEM_DISABLED;
      else process.env.MAIL_SYSTEM_DISABLED = prev;
    }
  });

  it('aksiyon olayına pasif/eksik şablonla fallback yolundan devam eder', async () => {
    // DB yokken `no_db` ile erken döner — çağıranı düşürmez.
    const res = await sendActionMail('user.welcome', { to: 'yok@example.com' });
    assert.ok(['skipped', 'sent', 'mock'].includes(res.status));
    assert.notEqual(res.status, 'failed');
  });

  it('aksiyon olmayan olayı reddeder', async () => {
    const res = await sendActionMail('campaign.broadcast', { to: 'yok@example.com' });
    assert.equal(res.status, 'skipped');
    // DB bağlı değilse kategori kontrolüne de erişmeden `no_db` ile döner.
    assert.ok(['no_db', 'not_action_event'].includes(res.reason), res.reason);
  });

  it('geçersiz kitle kimliğiyle sorgu çalıştırmaz', async () => {
    const r = await resolveAudience({ type: 'users', userIds: ['bozuk-id'] });
    assert.equal(r.matched, 0);
    assert.equal(r.users.length, 0);
  });

  it('toplu gönderim sınırı ortam değişkeniyle kısılır', () => {
    const prev = process.env.MAIL_SEND_BATCH_LIMIT;
    try {
      process.env.MAIL_SEND_BATCH_LIMIT = '25';
      assert.equal(getBatchLimit(), 25);
      process.env.MAIL_SEND_BATCH_LIMIT = '999999';
      assert.equal(getBatchLimit(), 5000);
      process.env.MAIL_SEND_BATCH_LIMIT = 'yok';
      assert.equal(getBatchLimit(), 500);
    } finally {
      if (prev === undefined) delete process.env.MAIL_SEND_BATCH_LIMIT;
      else process.env.MAIL_SEND_BATCH_LIMIT = prev;
    }
  });
});

describe('mailTemplates — CRUD (DB)', () => {
  before(async () => {
    await mongoose.connect(TEST_DB);
    await SystemMailTemplate.deleteMany({});
    await SystemMailLog.deleteMany({});
    invalidateMailTemplateCache();
  });

  after(async () => {
    await SystemMailTemplate.deleteMany({});
    await SystemMailLog.deleteMany({});
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await SystemMailTemplate.deleteMany({});
    invalidateMailTemplateCache();
  });

  it('eksik demo şablonları tohumlar ve ikinci çağrıda eklemez', async () => {
    const first = await ensureDefaultMailTemplates();
    assert.equal(first.inserted, DEFAULT_TEMPLATES.length);

    const second = await ensureDefaultMailTemplates();
    assert.equal(second.inserted, 0);
    assert.equal(await SystemMailTemplate.countDocuments(), DEFAULT_TEMPLATES.length);
  });

  it('mevcut içeriği ezmez (admin düzenlemesi korunur)', async () => {
    await ensureDefaultMailTemplates();
    const tpl = await SystemMailTemplate.findOne({ event: 'campaign.broadcast' });
    tpl.subject = 'Admin düzenlemesi';
    await tpl.save();

    await ensureDefaultMailTemplates();
    const after = await SystemMailTemplate.findOne({ event: 'campaign.broadcast' });
    assert.equal(after.subject, 'Admin düzenlemesi');
  });

  it('listeleme kategoriye göre filtreler ve sayaç döner', async () => {
    await ensureDefaultMailTemplates();
    const all = await listTemplates({ limit: 50 });
    assert.equal(all.templates.length, DEFAULT_TEMPLATES.length);
    assert.equal(all.stats.action > 0, true);
    assert.equal(all.stats.scheduled > 0, true);

    const scheduled = await listTemplates({ limit: 50, category: CATEGORY_SCHEDULED });
    assert.ok(scheduled.templates.every(t => t.category === CATEGORY_SCHEDULED));

    const found = await listTemplates({ search: 'kampanya', limit: 50 });
    assert.ok(found.templates.length >= 1, 'arama sonuç vermedi');
  });

  it('aynı olay için ikinci şablon oluşturmaz', async () => {
    await ensureDefaultMailTemplates();
    await assert.rejects(
      () => createTemplate({ event: 'campaign.broadcast', name: 'X', subject: 'S', body: 'B' }),
      (e) => e.code === 'MAIL_EVENT_TAKEN' && e.status === 409,
    );
  });

  it('sistem şablonu silinemez, güncellenebilir', async () => {
    await ensureDefaultMailTemplates();
    const sys = await SystemMailTemplate.findOne({ event: 'bet.settled' });
    const updated = await updateTemplate(sys._id, { subject: 'Yeni konu' }, null);
    assert.equal(updated.subject, 'Yeni konu');
    assert.equal(updated.event, 'bet.settled');

    await assert.rejects(() => deleteTemplate(sys._id), (e) => e.code === 'MAIL_SYSTEM_TEMPLATE');
  });

  it('olay başına tek şablon garantisi DB indexiyle de geçerlidir', async () => {
    await ensureDefaultMailTemplates();
    const tpl = await SystemMailTemplate.findOne({ event: 'campaign.inactiveUsers' }).lean();
    assert.ok(tpl);
    // Unique index'i zorla
    await assert.rejects(
      () => SystemMailTemplate.create([{ ...tpl, _id: undefined, name: 'kopya' }]),
      (e) => e.code === 11000,
    );
  });

  it('önbellek 30sn içinde aynı dokümanı döner ve invalidasyonla yenilenir', async () => {
    await ensureDefaultMailTemplates();
    const a = await getTemplateByEvent('user.emailVerify');
    const b = await getTemplateByEvent('user.emailVerify');
    assert.equal(a, b);

    await SystemMailTemplate.updateOne({ event: 'user.emailVerify' }, { subject: 'Değişti' });
    invalidateMailTemplateCache('user.emailVerify');
    const c = await getTemplateByEvent('user.emailVerify');
    assert.equal(c.subject, 'Değişti');
  });

  it('zamanlanmış kitle verisi kaydedilir ve okunur', async () => {
    const doc = await createTemplate({
      event: 'campaign.reactivation',
      name: 'Geri kazanım',
      subject: 'Tekrar bekleriz',
      body: '<p class="m-p">Merhaba {{username}}</p>',
      audience: { type: 'inactive', inactiveDays: 30 },
      schedule: { enabled: true, intervalHours: 72 },
    }, null);
    assert.equal(doc.category, CATEGORY_SCHEDULED);
    assert.equal(doc.audience.type, 'inactive');
    assert.equal(doc.audience.inactiveDays, 30);
    assert.equal(doc.schedule.intervalHours, 72);
    assert.equal(doc.isSystem, false);

    const listed = await listTemplates({ limit: 50, category: CATEGORY_SCHEDULED });
    const row = listed.templates.find(t => t.event === 'campaign.reactivation');
    assert.equal(row.audience.type, 'inactive');

    await deleteTemplate(doc._id);
    const remaining = await listTemplates({ limit: 50, search: 'Geri kazanım' });
    assert.equal(remaining.templates.length, 0);
  });

  // Regresyon: id "object" tipinde olduğu için ObjectId, şablon DOKÜMANI sanılıyordu;
  // category/enabled okunamıyor, aksiyon ve pasif guard'ları hiç çalışmıyordu.
  it('sendBulk id ile çağrılınca şablonu veritabanından çözer ve guardlar devreye girer', async () => {
    const disabled = await SystemMailTemplate.create({
      event: 'campaign.broadcast',
      name: 'Pasif gönderim',
      subject: 'S', body: '<p>B</p>',
      category: 'scheduled',
      enabled: false,
    });
    const action = await SystemMailTemplate.create({
      event: 'bet.settled',
      name: 'Aksiyon şablonu',
      subject: 'S', body: '<p>B</p>',
      category: 'action',
      enabled: true,
    });

    await assert.rejects(() => sendBulk(action._id, { audience: { type: 'all' } }),
      (e) => e.code === 'MAIL_ACTION_TRIGGER_ONLY');
    await assert.rejects(() => sendBulk(disabled._id, { audience: { type: 'all' } }),
      (e) => e.code === 'MAIL_TEMPLATE_DISABLED');
  });

  // Regresyon: User.deletedAt default null — `$exists:false` filtresi hiçbir
  // kullanıcıyı yakalamıyordu (kitle = 0, panelden gönderim imkânsızdı).
  it('kitle sorgusu silinmemiş kullanıcıları yakalar, bot ve soft-delete edilenleri eler', async () => {
    const stamp = Date.now();
    const keep = { email: `mail-aud-${stamp}@example.test`, password: 'Sifre123!' };
    const bot  = { email: `mail-aud-bot-${stamp}@example.test`, password: 'Sifre123!', isBot: true };
    const gone = { email: `mail-aud-gone-${stamp}@example.test`, password: 'Sifre123!' };
    const u1 = await User.create({ username: `mailaud${stamp}`, ...keep });
    const u2 = await User.create({ username: `mailaudbot${stamp}`, ...bot });
    const u3 = await User.create({ username: `mailaudgone${stamp}`, ...gone });
    u3.deletedAt = new Date();
    await u3.save();

    try {
      const { users } = await resolveAudience(
        { type: 'users', userIds: [u1._id, u2._id, u3._id] },
        { limit: 10 },
      );
      const found = users.map((u) => String(u._id));
      assert.ok(found.includes(String(u1._id)), 'silinmemiş kullanıcı bulunmalı');
      assert.ok(!found.includes(String(u2._id)), 'bot elenmeli');
      assert.ok(!found.includes(String(u3._id)), 'soft-delete edilen elenmeli');
    } finally {
      await User.deleteMany({ _id: { $in: [u1._id, u2._id, u3._id] } });
    }
  });

  // Regresyon: User.vipLevel ObjectId referansıyken kriter sayısal min/max
  // doğrudan alana yazılıyordu → `Cast to ObjectId failed`.
  it('VIP kriteri seviye numarasını VipLevel kimliklerine çevirir', async () => {
    const query = await buildQueryFromCriteria({ vipLevel: { min: 1 } });
    assert.ok(query.vipLevel && Array.isArray(query.vipLevel.$in));
    await User.find(query).limit(1); // cast hatası fırlatmamalı
    const empty = await buildQueryFromCriteria({});
    assert.deepEqual(empty, {});
  });

  // Regresyon: bu iki fonksiyonda URL bağlamı eskiden `if` BLOĞU içinde
  // `const` ile tanımlanıp bloğun dışında okunuyordu → mock (SMTP'siz) modda
  // ReferenceError, yani doğrulama/sıfırlama akışı 500 dönüyordu.
  describe('dev link bağlamı (auth.js)', () => {
    let prevNodeEnv;

    beforeEach(async () => {
      prevNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      await User.deleteMany({ email: { $in: ['dev-reset@example.test', 'dev-verify@example.test'] } });
    });

    afterEach(async () => {
      process.env.NODE_ENV = prevNodeEnv;
      await User.deleteMany({ email: { $in: ['dev-reset@example.test', 'dev-verify@example.test'] } });
    });

    it('forgotPassword devResetUrl bağlam dışından okunur', async () => {
      const { forgotPassword } = await import('../src/controllers/auth.js');
      const email = 'dev-reset@example.test';
      await User.create({ username: 'devresetuser', email, password: 'Sifre123!' });

      let payload = null;
      const errs = [];
      await forgotPassword(
        { validated: { email }, headers: {} },
        { json: (o) => { payload = o; } },
        (e) => errs.push(e),
      );

      assert.equal(errs.length, 0, errs[0] && errs[0].stack);
      assert.ok(payload, 'res.json çağrılmadı');
      assert.match(payload.devResetUrl || '', /reset-password\?token=/);
    });

    it('resendVerification devVerifyUrl bağlam dışından okunur', async () => {
      const { resendVerification } = await import('../src/controllers/auth.js');
      const email = 'dev-verify@example.test';
      await User.create({ username: 'devverifyuser', email, password: 'Sifre123!' });

      let payload = null;
      const errs = [];
      await resendVerification(
        { validated: { email } },
        { json: (o) => { payload = o; } },
        (e) => errs.push(e),
      );

      assert.equal(errs.length, 0, errs[0] && errs[0].stack);
      assert.ok(payload, 'res.json çağrılmadı');
      assert.match(payload.devVerifyUrl || '', /verify-email\?token=/);
    });
  });
});
