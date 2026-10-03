/**
 * SMS şablon servisi — canlı test DB'si (kendi veritabanı adıyla, `promotionsAdmin`
 * ve `playerSegment` testleriyle aynı desen).
 *
 * Kapsam: seed idempotliği, CRUD, değişken türetme, alıcı çözümleme (telefonu
 * olmayanlar elenir) ve gönderim kuralları (aksiyon şablonu reddi, kapalı
 * modül, eksik kimlik bilgisi). Gerçek Twilio'ya hiçbir şekilde gidilmez:
 * `sendImpl` enjekte edilir.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import SmsTemplate from '../src/models/SmsTemplate.js';
import SmsLog from '../src/models/SmsLog.js';
import User from '../src/models/User.js';
import PlayerSegment from '../src/models/PlayerSegment.js';
import Setting from '../src/models/Setting.js';
import {
  initDefaultSmsTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listTemplates,
  resolveRecipients,
  sendTemplate,
  dispatchSmsEvent,
  SmsError,
  MAX_RECIPIENTS,
} from '../src/services/smsTemplate.js';

const CONFIG = {
  provider: 'twilio',
  accountSid: 'ACtest',
  authToken: 'token',
  from: '+905321112233',
  messagingServiceSid: null,
  defaultCountryCode: '90',
  configured: true,
};

// Modül deposu DB'ye yazar (`module.<id>.enabled`); gönderim testlerinde
// gerçek API üzerinden açıyoruz ki anahtar biçimini de doğrulamış olalım.
async function enableModule() {
  const { setModuleEnabled } = await import('../src/modules/index.js');
  await setModuleEnabled('sms-gateway', true);
}

function okSender(result = { sid: 'SM1', status: 'queued' }) {
  const calls = [];
  const fn = async args => { calls.push(args); return { ok: true, ...result }; };
  fn.calls = calls;
  return fn;
}

describe('SMS şablon servisi (canlı DB)', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_sms');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await SmsTemplate.deleteMany({});
    await SmsLog.deleteMany({});
    await PlayerSegment.deleteMany({});
    await User.deleteMany({});
    // Demo tombstone'ı da temizle: aksi hâlde silinen demo anahtarları bir
    // sonraki teste sızar.
    await Setting.deleteMany({ key: 'sms.templates.demoState' });
    await enableModule();
  });

  describe('demo seed', () => {
    it('ekler ve tekrar çalıştırmada kopyalamaz', async () => {
      const first = await initDefaultSmsTemplates();
      assert.equal(first.inserted, first.total);
      assert.equal(await SmsTemplate.countDocuments({}), first.total);

      const second = await initDefaultSmsTemplates();
      assert.equal(second.inserted, 0, 'ikinci çalıştırma yeni kayıt eklememeli');
      assert.equal(await SmsTemplate.countDocuments({}), first.total);
    });

    it('operatör düzenlemesi ve silmesi yeniden başlatmada korunur ($setOnInsert)', async () => {
      await initDefaultSmsTemplates();

      const tpl = await SmsTemplate.findOne({ key: 'welcomeRegistered' });
      tpl.content = 'OPERATOR EDIT';
      tpl.isActive = false;
      await tpl.save();

      // Silme GERÇEK admin yolundan (servis) yapılmalı: tombstone yalnızca
      // `deleteTemplate` yazıyor, ham `deleteOne` yazmaz.
      await deleteTemplate((await SmsTemplate.findOne({ key: 'campaignAnnouncement' }))._id);

      await initDefaultSmsTemplates();

      const after = await SmsTemplate.findOne({ key: 'welcomeRegistered' });
      assert.equal(after.content, 'OPERATOR EDIT', 'düzenleme ezilmeliydi');
      assert.equal(after.isActive, false);
      assert.equal(await SmsTemplate.countDocuments({ key: 'campaignAnnouncement' }), 0, 'silinen demo şablonu geri gelmemeli');
    });
  });

  describe('CRUD', () => {
    it('oluşturma: key başlıktan türetilir, değişkenler içerikten çıkarılır', async () => {
      const adminId = new mongoose.Types.ObjectId();
      const tpl = await createTemplate({
        title: 'Yeni Bonus Duyurusu',
        type: 'scheduled',
        eventKey: 'bonusExpiring',
        category: 'promotion',
        content: '{{username}}, {{amount}} {{currency}} bonusun {{hoursLeft}} saat sonra bitiyor.',
      }, adminId);

      assert.equal(tpl.key, 'yeniBonusDuyurusu');
      assert.deepEqual(tpl.variables, ['username', 'amount', 'currency', 'hoursLeft']);
      assert.equal(String(tpl.createdBy), String(adminId));
      assert.equal(tpl.isActive, true);
    });

    it('sistem mesajı olaysız oluşturulamaz', async () => {
      await assert.rejects(
        () => createTemplate({ title: 'Sistem', type: 'action', content: 'x' }),
        err => err instanceof SmsError && err.code === 'SMS_EVENT_REQUIRED',
      );
    });

    it('olay tip ile uyuşmazsa reddedilir', async () => {
      await assert.rejects(
        () => createTemplate({ title: 'Yanlış olay', type: 'action', eventKey: 'bonusExpiring', content: 'x' }),
        err => err.code === 'SMS_EVENT_INVALID',
      );
    });

    it('güncelleme: içerik değişince değişken listesi de yenilenir', async () => {
      const tpl = await createTemplate({ title: 'X', type: 'scheduled', content: '{{amount}}' });
      const updated = await updateTemplate(tpl._id, { content: '{{amount}} {{currency}}', isActive: false });
      assert.deepEqual(updated.variables, ['amount', 'currency']);
      assert.equal(updated.isActive, false);
    });

    it('güncelleme: tip değişimi olay geçerliliğini yeniden denetler', async () => {
      const tpl = await createTemplate({ title: 'X', type: 'scheduled', content: 'x' });
      await assert.rejects(
        () => updateTemplate(tpl._id, { type: 'action' }),
        err => err.code === 'SMS_EVENT_REQUIRED',
      );
      await assert.rejects(
        () => updateTemplate(tpl._id, { type: 'action', eventKey: 'bonusExpiring' }),
        err => err.code === 'SMS_EVENT_INVALID',
      );
    });

    it('silme bulunmayan kayıtta 404 döner', async () => {
      await assert.rejects(
        () => deleteTemplate(new mongoose.Types.ObjectId()),
        err => err.code === 'NOT_FOUND' && err.status === 404,
      );
    });

    it('liste özeti tip ve aktiflik sayar', async () => {
      await createTemplate({ title: 'A', type: 'scheduled', content: 'x' });
      await createTemplate({ title: 'B', type: 'action', eventKey: 'betWon', content: 'y' });
      await updateTemplate((await SmsTemplate.findOne({ title: 'B' }))._id, { isActive: false });

      const { summary } = await listTemplates({});
      assert.equal(summary.all, 2);
      assert.equal(summary.active, 1);
      assert.equal(summary.action, 1);
      assert.equal(summary.scheduled, 1);

      const filtered = await listTemplates({ search: 'bet' });
      assert.equal(filtered.templates.length, 0);
    });
  });

  describe('alıcı çözümleme', () => {
    beforeEach(async () => {
      await User.create([
        { username: 'telefonlu', email: 'a@x.com', password: 'x', phone: '05321112233', isActive: true, balance: 100 },
        { username: 'uluslararasi', email: 'b@x.com', password: 'x', phone: '+905321112244', isActive: true, balance: 5000 },
        { username: 'telefonsuz', email: 'c@x.com', password: 'x', phone: null, isActive: true, balance: 100 },
        { username: 'askida', email: 'd@x.com', password: 'x', phone: '05329998877', isActive: false, balance: 100 },
      ]);
    });

    it('tüm kullanıcılar: yalnız aktif ve telefonu olanlar', async () => {
      const { recipients, capped } = await resolveRecipients({ audienceType: 'all' });
      assert.deepEqual(recipients.map(r => r.username).sort(), ['telefonlu', 'uluslararasi']);
      assert.equal(capped, false);
    });

    it('segment: kriterle eşleşenler, alıcı tavanı uygulanır', async () => {
      const seg = await PlayerSegment.create({
        name: 'Yüksek bakiye', slug: 'high', criteria: { balance: { min: 1000, max: null } },
      });
      const { recipients, segmentId } = await resolveRecipients({ audienceType: 'segment', segmentId: seg._id });
      assert.deepEqual(recipients.map(r => r.username), ['uluslararasi']);
      assert.equal(segmentId, seg._id);
    });

    it('kritersiz (tüm kullanıcılara açık) segment reddedilir', async () => {
      // Kriteri olmayan segment boş sorguya çevrilir = "herkes". Toplu SMS'te
      // bu kaza tüm tabloya mesaj göndermek olurdu.
      const seg = await PlayerSegment.create({ name: 'Boş segment', slug: 'bos', criteria: {} });
      await assert.rejects(
        () => resolveRecipients({ audienceType: 'segment', segmentId: seg._id }),
        err => err.code === 'SMS_SEGMENT_TOO_BROAD',
      );
    });

    it('segment bulunamazsa 404', async () => {
      await assert.rejects(
        () => resolveRecipients({ audienceType: 'segment', segmentId: new mongoose.Types.ObjectId() }),
        err => err.status === 404,
      );
    });

    it('kullanıcı listesi boşsa hata verir', async () => {
      await assert.rejects(
        () => resolveRecipients({ audienceType: 'users', userIds: [] }),
        err => err.code === 'SMS_USERS_REQUIRED',
      );
    });

    it('tavan değeri MAX_RECIPIENTS ile sınırlıdır', () => {
      assert.ok(MAX_RECIPIENTS > 0 && MAX_RECIPIENTS <= 10000);
    });
  });

  describe('gönderim', () => {
    beforeEach(async () => {
      await User.create([
        { username: 'ali', email: 'ali@x.com', password: 'x', phone: '05321112233', isActive: true, balance: 250 },
        { username: 'ayse', email: 'ayse@x.com', password: 'x', phone: '+905321112244', isActive: true, balance: 900 },
      ]);
      await initDefaultSmsTemplates();
    });

    it('zaman ağırlıklı şablon seçili kullanıcılara gider, log yazılır', async () => {
      const tpl = await SmsTemplate.findOne({ key: 'bonusExpiringNotice' });
      const users = await User.find({}).select('_id');
      const sender = okSender();

      const res = await sendTemplate({
        templateId: tpl._id,
        audienceType: 'users',
        userIds: users.map(u => u._id),
        variables: { amount: '100', currency: 'TL', hoursLeft: '3' },
        config: CONFIG,
        sendImpl: sender,
      });

      assert.equal(res.total, 2);
      assert.equal(res.sent, 2);
      assert.equal(res.failed, 0);
      assert.deepEqual(res.missing, []);

      assert.equal(sender.calls.length, 2);
      assert.deepEqual(
        sender.calls.map(c => c.to).sort(),
        ['+905321112233', '+905321112244'],
        'ulusal numara ülke kodu ile E.164\'e çevrilmeli',
      );
      assert.match(sender.calls[0].body, /100 TL/);
      assert.ok(!sender.calls[0].body.includes('{{'), 'render sonrası placeholder kalmamalı');

      const logs = await SmsLog.find({}).lean();
      assert.equal(logs.length, 2);
      assert.ok(logs.every(l => l.status === 'sent' && l.templateKey === 'bonusExpiringNotice' && l.providerSid === 'SM1'));

      const after = await SmsTemplate.findById(tpl._id).lean();
      assert.equal(after.sentCount, 2);
      assert.ok(after.lastSentAt);
    });

    it('aksiyon (sistem) şablonu panelden gönderilemez', async () => {
      const tpl = await SmsTemplate.findOne({ key: 'betWinNotice' });
      const sender = okSender();
      await assert.rejects(
        () => sendTemplate({
          templateId: tpl._id, audienceType: 'all', config: CONFIG, sendImpl: sender,
        }),
        err => err.code === 'SMS_ACTION_NOT_SENDABLE',
      );
      assert.equal(sender.calls.length, 0, 'ret sonrası gönderim yapılmamalı');
    });

    it('pasif şablon gönderilemez', async () => {
      const tpl = await SmsTemplate.findOne({ key: 'bonusExpiringNotice' });
      await updateTemplate(tpl._id, { isActive: false });
      const sender = okSender();
      await assert.rejects(
        () => sendTemplate({ templateId: tpl._id, audienceType: 'all', config: CONFIG, sendImpl: sender }),
        err => err.code === 'SMS_TEMPLATE_INACTIVE',
      );
      assert.equal(sender.calls.length, 0);
    });

    it('kimlik bilgileri eksikken gönderim yapılmaz', async () => {
      const tpl = await SmsTemplate.findOne({ key: 'bonusExpiringNotice' });
      const sender = okSender();
      await assert.rejects(
        () => sendTemplate({ templateId: tpl._id, audienceType: 'all', config: { ...CONFIG, configured: false }, sendImpl: sender }),
        err => err.code === 'SMS_NOT_CONFIGURED',
      );
      assert.equal(sender.calls.length, 0);
    });

    it('sağlayıcı hatası log\'a yazılır ve özet başarısızı gösterir', async () => {
      const tpl = await SmsTemplate.findOne({ key: 'bonusExpiringNotice' });
      const res = await sendTemplate({
        templateId: tpl._id,
        audienceType: 'users',
        userIds: (await User.find({})).map(u => u._id),
        variables: { amount: '50', currency: 'TL', hoursLeft: '1' },
        config: CONFIG,
        sendImpl: async () => ({ ok: false, code: 'TWILIO_21211', error: 'geçersiz numara', sid: null }),
      });

      assert.equal(res.sent, 0);
      assert.equal(res.failed, 2);
      const logs = await SmsLog.find({ status: 'failed' }).lean();
      assert.equal(logs.length, 2);
      assert.equal(logs[0].error, 'geçersiz numara');

      const after = await SmsTemplate.findById(tpl._id).lean();
      assert.equal(after.sentCount, 0, 'başarısız gönderimde sayaç artmamalı');
      assert.equal(after.lastSentAt, null);
    });

    it('eksik değişkenler raporlanır (yarım mesaj sessizce gitmez)', async () => {
      const tpl = await SmsTemplate.findOne({ key: 'bonusExpiringNotice' });
      const res = await sendTemplate({
        templateId: tpl._id,
        audienceType: 'users',
        userIds: [(await User.findOne({ username: 'ali' }))._id],
        config: CONFIG,
        sendImpl: okSender(),
      });
      assert.deepEqual(res.missing.sort(), ['amount', 'currency', 'hoursLeft']);
    });
  });

  describe('dispatchSmsEvent (domain kancaları)', () => {
    beforeEach(async () => {
      await User.create({ username: 'ali', email: 'ali@x.com', password: 'x', phone: '05321112233', isActive: true });
      await initDefaultSmsTemplates();
    });

    it('olaya bağlı aktif şablonu bulup gönderir ve loglar', async () => {
      const user = await User.findOne({ username: 'ali' });
      const sender = okSender({ sid: 'SM9', status: 'sent' });

      const res = await dispatchSmsEvent('betWon', user, {
        betId: 'B-77', amount: '250', currency: 'TL', market: 'Maç sonucu', odds: '1.85',
      }, { config: CONFIG, sendImpl: sender });

      assert.equal(res.sent, 1);
      assert.equal(sender.calls[0].to, '+905321112233');
      assert.match(sender.calls[0].body, /Kazandın 250 TL/);
      assert.match(sender.calls[0].body, /B-77/);

      const log = await SmsLog.findOne({}).lean();
      assert.equal(log.templateKey, 'betWinNotice');
      assert.equal(log.status, 'sent');
      assert.equal(log.userId.toString(), user._id.toString());
    });

    it('şablon yoksa / kimlik yoksa sessizce atlar (domain akışı kırılmaz)', async () => {
      const user = await User.findOne({ username: 'ali' });
      const sender = okSender();

      assert.equal((await dispatchSmsEvent('boyleBirOlayYok', user, {}, { config: CONFIG, sendImpl: sender })).skipped, 'NO_TEMPLATE');
      assert.equal((await dispatchSmsEvent('betWon', user, {}, { config: { ...CONFIG, configured: false }, sendImpl: sender })).skipped, 'NOT_CONFIGURED');

      const phoneYok = { _id: user._id, username: 'x', phone: null };
      assert.equal((await dispatchSmsEvent('betWon', phoneYok, {}, { config: CONFIG, sendImpl: sender })).skipped, 'NO_PHONE');

      assert.equal(sender.calls.length, 0, 'atlanan durumlarda gönderim yapılmamalı');
    });

    it('gönderim hatası throw etmez (domain akışını bozmaz)', async () => {
      const user = await User.findOne({ username: 'ali' });
      const res = await dispatchSmsEvent('betWon', user, {}, {
        config: CONFIG,
        sendImpl: async () => { throw new Error('ağ patladı'); },
      });
      assert.equal(res.sent, 0);
      assert.match(res.error, /ağ patladı/);
    });
  });
});