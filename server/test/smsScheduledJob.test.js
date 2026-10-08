/**
 * SMS otomatik (zamanlanmış) gönderim — kitle + vade CRUD kuralları ve
 * `runDueScheduledSms` 15 dakikalık işi (e-postadaki `runDueScheduledMails`
 * ile aynı model).
 *
 * Canlı test DB'si (`betzone_test_sms_job`); gerçek Twilio'ya gidilmez,
 * `sendImpl`/`config` enjekte edilir.
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
  createTemplate,
  updateTemplate,
  dispatchSmsEvent,
  runDueScheduledSms,
  SmsError,
} from '../src/services/smsTemplate.js';

const CONFIG = {
  provider: 'twilio',
  accountSid: 'ACtest',
  authToken: 'token',
  fromNumber: '+905321112233',
  messagingServiceSid: null,
  defaultCountryCode: '90',
  configured: true,
};

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

const HOUR_MS = 60 * 60 * 1000;

describe('SMS otomatik gönderim (kitle + vade + job)', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_sms_job');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await SmsTemplate.deleteMany({});
    await SmsLog.deleteMany({});
    await User.deleteMany({});
    await PlayerSegment.deleteMany({});
    await Setting.deleteMany({ key: 'module.sms-gateway.enabled' });
    await enableModule();
    await User.create([
      { username: 'ali', email: 'ali@x.com', password: 'x', phone: '05321112233', isActive: true, balance: 250 },
      { username: 'ayse', email: 'ayse@x.com', password: 'x', phone: '+905321112244', isActive: true, balance: 900 },
      { username: 'telefonsuz', email: 'c@x.com', password: 'x', phone: null, isActive: true, balance: 100 },
    ]);
  });

  describe('kitle + vade CRUD kuralları', () => {
    it('scheduled şablon: audience/schedule yazılır, eksik parçalar varsayılanla dolar', async () => {
      const ali = await User.findOne({ username: 'ali' });
      // users kitle yalnız schedule kapalıyken saklanabilir (otomatik gönderim
      // all/segment ile sınırlı — bkz. `assertAudienceAndSchedule`).
      const tpl = await createTemplate({
        title: 'Kampanya',
        type: 'scheduled',
        content: 'Merhaba {{username}}',
        audience: { type: 'users', userIds: [String(ali._id)] },
        schedule: { enabled: false, intervalHours: 12 },
      });
      assert.equal(tpl.audience.type, 'users');
      assert.equal(tpl.audience.userIds.length, 1);
      assert.equal(tpl.schedule.enabled, false);
      assert.equal(tpl.schedule.intervalHours, 12);
      assert.equal(tpl.schedule.nextSentAt, null, 'ilk vade işe bırakılır');
      assert.equal(tpl.schedule.lastSentAt, null);

      // Otomatik gönderim segment kitleyle açılabilmeli.
      const seg = await PlayerSegment.create({ name: 'Küçük bakiye', slug: 'kucuk', criteria: { balance: { min: 0, max: 500 } } });
      const auto = await createTemplate({
        title: 'Otomatik Segment',
        type: 'scheduled',
        content: 'x',
        audience: { type: 'segment', segmentId: String(seg._id) },
        schedule: { enabled: true, intervalHours: 48 },
      });
      assert.equal(auto.audience.type, 'segment');
      assert.equal(String(auto.audience.segmentId), String(seg._id));
      assert.equal(auto.schedule.enabled, true);
      assert.equal(auto.schedule.intervalHours, 48);

      const bare = await createTemplate({ title: 'Çıplak', type: 'scheduled', content: 'x' });
      assert.equal(bare.audience.type, 'all');
      assert.equal(bare.schedule.enabled, false);
      assert.equal(bare.schedule.intervalHours, 168);
      assert.equal(bare.schedule.nextSentAt, null);
    });

    it('segment kitle + segmentId zorunlu', async () => {
      await assert.rejects(
        () => createTemplate({ title: 'S', type: 'scheduled', content: 'x', audience: { type: 'segment' } }),
        err => err.code === 'SMS_SEGMENT_REQUIRED',
      );
    });

    it('users kitle + boş userIds reddedilir', async () => {
      await assert.rejects(
        () => createTemplate({ title: 'S', type: 'scheduled', content: 'x', audience: { type: 'users', userIds: [] } }),
        err => err.code === 'SMS_USERS_REQUIRED',
      );
    });

    it('aksiyon şablonuna zamanlanmış gönderim bağlanamaz', async () => {
      await assert.rejects(
        () => createTemplate({ title: 'A', type: 'action', eventKey: 'betWon', content: 'x', schedule: { enabled: true } }),
        err => err.code === 'SMS_SCHEDULE_ON_ACTION',
      );
    });

    it('otomatik gönderim + users kitle reddedilir (yalnız all/segment)', async () => {
      const ali = await User.findOne({ username: 'ali' });
      await assert.rejects(
        () => createTemplate({
          title: 'S', type: 'scheduled', content: 'x',
          audience: { type: 'users', userIds: [String(ali._id)] },
          schedule: { enabled: true },
        }),
        err => err.code === 'SMS_AUTO_AUDIENCE_INVALID',
      );
    });

    it('güncelleme: title-only vadeyi silmez; schedule parçaları birleşir', async () => {
      const tpl = await createTemplate({ title: 'K', type: 'scheduled', content: 'x', schedule: { enabled: true, intervalHours: 24 } });
      const past = new Date(Date.now() - HOUR_MS);
      await SmsTemplate.updateOne({ _id: tpl._id }, { 'schedule.nextSentAt': past });

      const afterTitle = await updateTemplate(tpl._id, { title: 'K2' });
      assert.equal(afterTitle.schedule.nextSentAt?.getTime(), past.getTime(), 'title güncellemesi vadeyi ezmemeli');
      assert.equal(afterTitle.schedule.enabled, true);
      assert.equal(afterTitle.schedule.intervalHours, 24);

      const afterSchedule = await updateTemplate(tpl._id, { schedule: { enabled: true, intervalHours: 6 } });
      assert.equal(afterSchedule.schedule.intervalHours, 6);
      assert.equal(afterSchedule.schedule.nextSentAt?.getTime(), past.getTime(), 'parça güncellemesi mevcut vadeyi korumalı');
    });

    it('güncelleme: action + schedule.enabled payload reddedilir', async () => {
      const tpl = await createTemplate({ title: 'A', type: 'action', eventKey: 'emailVerified', content: 'x' });
      await assert.rejects(
        () => updateTemplate(tpl._id, { schedule: { enabled: true } }),
        err => err.code === 'SMS_SCHEDULE_ON_ACTION',
      );
    });
  });

  describe('runDueScheduledSms (15 dk iş)', () => {
    /**
     * Job testleri için segment kitle: criteria balance 0..500 → ali (250,
     * telefonlu) eşleşir; telefonsuz kullanıcı elenir; ayse (900) dışarıda
     * kalır. Kriter segmenti `resolveRecipients` de reddetmez (seçici var).
     */
    async function makeTemplate(overrides = {}) {
      const seg = await PlayerSegment.create({ name: 'Küçük bakiye', slug: `kucuk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, criteria: { balance: { min: 0, max: 500 } } });
      return createTemplate({
        title: 'Otomatik',
        type: 'scheduled',
        content: 'Merhaba {{username}}! Bakiyen {{balance}}.',
        audience: { type: 'segment', segmentId: String(seg._id) },
        schedule: { enabled: true, intervalHours: 24, ...overrides.schedule },
        ...overrides.tpl,
      });
    }

    it('nextSentAt boşken HEMEN göndermez, yalnız vadeyi kurar', async () => {
      const tpl = await makeTemplate();
      const now = new Date();
      const sender = okSender();

      const sentCount = await runDueScheduledSms(now, { config: CONFIG, sendImpl: sender });

      assert.equal(sentCount, 0, 'ilk açılışta toplu SMS patlamamalı');
      assert.equal(sender.calls.length, 0);
      assert.equal(await SmsLog.countDocuments({}), 0);

      const after = await SmsTemplate.findById(tpl._id).lean();
      assert.ok(after.schedule.nextSentAt instanceof Date, 'vade kurulmuş olmalı');
      const expected = now.getTime() + 24 * HOUR_MS;
      assert.ok(Math.abs(after.schedule.nextSentAt.getTime() - expected) < 5000, 'vade now+24h olmalı');
      assert.equal(after.schedule.lastSentAt, null);
    });

    it('vadesi gelmiş şablon segment kitleye gönderilir, vade ilerletilir', async () => {
      const tpl = await makeTemplate();
      const now = new Date();
      await SmsTemplate.updateOne({ _id: tpl._id }, { 'schedule.nextSentAt': new Date(now.getTime() - HOUR_MS) });
      const sender = okSender();

      const sentCount = await runDueScheduledSms(now, { config: CONFIG, sendImpl: sender });

      assert.equal(sentCount, 1);
      assert.equal(sender.calls.length, 1, 'yalnız segment kriterine uyan telefonlu kullanıcı gitmeli');
      assert.equal(sender.calls[0].to, '+905321112233');
      assert.match(sender.calls[0].body, /Merhaba ali!/);

      const logs = await SmsLog.find({}).lean();
      assert.equal(logs.length, 1);
      assert.equal(logs[0].status, 'sent');
      assert.equal(String(logs[0].templateKey), String((await SmsTemplate.findById(tpl._id)).key));

      const after = await SmsTemplate.findById(tpl._id).lean();
      assert.ok(after.schedule.nextSentAt > now, 'vade ilerlemiş olmalı');
      assert.ok(Math.abs(after.schedule.nextSentAt.getTime() - (now.getTime() + 24 * HOUR_MS)) < 5000);
      assert.equal(after.schedule.lastSentAt?.getTime(), now.getTime());
    });

    it('pasif / schedule kapalı / aksiyon tipi şablonlar işe girmez', async () => {
      const inactive = await makeTemplate({ tpl: { title: 'Pasif' } });
      await updateTemplate(inactive._id, { isActive: false });
      const noSchedule = await makeTemplate({ tpl: { title: 'Kapali' }, schedule: { enabled: false } });
      const action = await createTemplate({ title: 'Aksiyon', type: 'action', eventKey: 'betWon', content: 'x {{username}}' });
      await SmsTemplate.updateOne({ _id: action._id }, { $set: { 'schedule.enabled': true, 'schedule.nextSentAt': new Date(Date.now() - HOUR_MS) } });

      const now = new Date();
      const sender = okSender();
      const sentCount = await runDueScheduledSms(now, { config: CONFIG, sendImpl: sender });

      assert.equal(sentCount, 0);
      assert.equal(sender.calls.length, 0);
      assert.equal(await SmsLog.countDocuments({}), 0);
      for (const id of [inactive._id, noSchedule._id, action._id]) {
        const doc = await SmsTemplate.findById(id).lean();
        assert.equal(doc.schedule?.lastSentAt ?? null, null);
      }
    });

    it('gönderim fırlatırsa vade ilerletilmez (bir sonraki döngüde yeniden denenir)', async () => {
      const tpl = await makeTemplate();
      const past = new Date(Date.now() - HOUR_MS);
      await SmsTemplate.updateOne({ _id: tpl._id }, { 'schedule.nextSentAt': past });
      const boom = async () => { throw new Error('Twilio patladı'); };

      const sentCount = await runDueScheduledSms(new Date(), { config: CONFIG, sendImpl: boom });

      assert.equal(sentCount, 0);
      const after = await SmsTemplate.findById(tpl._id).lean();
      assert.equal(after.schedule.nextSentAt?.getTime(), past.getTime(), 'hata sonrası vade sabit kalmalı');
    });

    it('dispatchSmsEvent: yalnız deps.userId ile alıcı çözülür', async () => {
      const tpl = await createTemplate({
        title: 'Bahis kazandı',
        type: 'action',
        eventKey: 'betWon',
        content: 'Kazandın {{username}}! {{amount}} {{currency}}',
      });
      assert.equal(tpl.eventKey, 'betWon');
      const ali = await User.findOne({ username: 'ali' });
      const sender = okSender();

      const res = await dispatchSmsEvent('betWon', null, { amount: '120.50' }, {
        userId: ali._id, config: CONFIG, sendImpl: sender,
      });

      assert.equal(res.sent, 1);
      assert.equal(sender.calls.length, 1);
      assert.equal(sender.calls[0].to, '+905321112233');
      assert.match(sender.calls[0].body, /Kazandın ali!/);
      assert.ok(!sender.calls[0].body.includes('{{'), 'placeholder kalmamalı');

      const logs = await SmsLog.find({}).lean();
      assert.equal(logs.length, 1);
      assert.equal(logs[0].username, 'ali');
      assert.equal(String(logs[0].userId), String(ali._id));
    });
  });
});
