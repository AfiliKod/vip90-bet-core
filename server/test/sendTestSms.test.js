/**
 * `sendTestSms` — İletişim → SMS → Test (send) akışı.
 *
 * Canlı test DB'si (`betzone_test_sms_testsend`); gerçek Twilio'ya hiçbir
 * şekilde gidilmez, `sendImpl` enjekte edilir. Kimlik bilgisi kapıları
 * `config` üzerinden enjeksiyonla deterministik olarak test edilir (geliştirme
 * makinesinde `SMS_*` env değişkenleri tanımlı olsa bile).
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import SmsLog from '../src/models/SmsLog.js';
import Setting from '../src/models/Setting.js';
import { sendTestSms, listLogs, SmsError } from '../src/services/smsTemplate.js';

const CONFIG = {
  provider: 'twilio',
  accountSid: 'ACtest',
  authToken: 'token',
  fromNumber: '+905321112233',
  messagingServiceSid: null,
  defaultCountryCode: '90',
  configured: true,
};

async function setModule(enabled) {
  const { setModuleEnabled } = await import('../src/modules/index.js');
  await setModuleEnabled('sms-gateway', enabled);
}

function okSender(result = { sid: 'SMTEST', status: 'queued' }) {
  const calls = [];
  const fn = async args => { calls.push(args); return { ok: true, ...result }; };
  fn.calls = calls;
  return fn;
}

describe('sendTestSms (test mesajı)', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_sms_testsend');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await SmsLog.deleteMany({});
    await Setting.deleteMany({ key: 'module.sms-gateway.enabled' });
    await setModule(true);
  });

  it('başarılı gönderim: sender çağrılır, SmsLog templateId=null ile yazılır', async () => {
    const sender = okSender();
    const res = await sendTestSms({
      to: '+905321112233',
      message: 'VIP90 test mesajı',
      adminId: null,
      config: CONFIG,
      sendImpl: sender,
    });

    assert.equal(res.ok, true);
    assert.equal(sender.calls.length, 1);
    assert.equal(sender.calls[0].to, '+905321112233');
    assert.equal(sender.calls[0].body, 'VIP90 test mesajı');
    assert.equal(sender.calls[0].from, '+905321112233');
    assert.equal(sender.calls[0].accountSid, 'ACtest');

    const logs = await SmsLog.find({}).lean();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, 'sent');
    assert.equal(logs[0].templateId, null, 'test mesajı şablona bağlanmaz');
    assert.equal(logs[0].phone, '+905321112233');
    assert.equal(logs[0].body, 'VIP90 test mesajı');
    assert.equal(logs[0].provider, 'twilio');
    assert.equal(logs[0].providerSid, 'SMTEST');
    assert.equal(logs[0].audienceType, null);
  });

  it('sağlayıcı hatası: log failed yazılır, throw edilmez', async () => {
    const sender = async () => ({ ok: false, error: 'Twilio 21211: numara yok', code: '21211' });
    const res = await sendTestSms({
      to: '+905321112233',
      message: 'test',
      config: CONFIG,
      sendImpl: sender,
    });

    assert.equal(res.ok, false);
    const logs = await SmsLog.find({}).lean();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].status, 'failed');
    assert.match(logs[0].error, /21211/);
  });

  it('gateway yapılandırılmamışsa gönderim yapılmaz', async () => {
    const sender = okSender();
    await assert.rejects(
      () => sendTestSms({ to: '+905321112233', message: 'x', config: { ...CONFIG, configured: false }, sendImpl: sender }),
      err => err instanceof SmsError && err.code === 'SMS_NOT_CONFIGURED',
    );
    assert.equal(sender.calls.length, 0);
    assert.equal(await SmsLog.countDocuments({}), 0);
  });

  it('modül kapalıysa gönderim yapılmaz', async () => {
    await setModule(false);
    const sender = okSender();
    await assert.rejects(
      () => sendTestSms({ to: '+905321112233', message: 'x', config: CONFIG, sendImpl: sender }),
      err => err.code === 'SMS_MODULE_DISABLED',
    );
    assert.equal(sender.calls.length, 0);
    assert.equal(await SmsLog.countDocuments({}), 0);
  });

  it('log listeleme test mesajını da gösterir', async () => {
    await sendTestSms({ to: '+905321112233', message: 'selam', config: CONFIG, sendImpl: okSender() });
    const { logs, summary } = await listLogs({ limit: 10 });
    assert.equal(logs.length, 1);
    assert.equal(summary.sent, 1);
    assert.equal(logs[0].body, 'selam');
  });
});
