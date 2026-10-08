/**
 * SMS yönetiminin HTTP yüzeyi — DI'lı fabrika.
 *
 * `createSmsHandlers(deps)` sayesinde controller DB/Twilio olmadan test edilir
 * (`server/test/smsAdmin.test.js`); dosyanın altındaki `handlers` gerçek
 * depoları bağlar. `routes/smsTemplate.js` yalnızca bu fabrikayı görür.
 *
 * Hata sözleşmesi: servis katmanının `SmsError` sınıfları `status` + `code`
 * taşıdığı için global `errorHandler` bunları `{ error: { code, message } }`
 * olarak yüzeye çıkarır — istemci `e.response.data.error.message` okuyor.
 *
 * `asyncHandler` SADECE bu dosyada kullanılır ve zorunludur: Express 4 yalnız
 * eşzamanlı (sync) throw'ları yakalar; async handler'ın reddi `unhandledRejection`
 * olur, `next(error)` hiç çağrılmaz ve İSTEK ASILI KALIR (yanıt hiç dönmez).
 * Depoda `asyncHandler` benzeri paylaşılan bir sarmalayıcı olmadığı için
 * (`controllers/playerSegment.js` elle `try/catch` kullanıyor, 9 handler için
 * tekrarlamak burada okunmazlık) burada tanımlandı.
 */
import * as smsService from '../services/smsTemplate.js';
import {
  getSmsConfig,
  getSmsSettingsStatus,
  saveSmsSettings,
  persistDetectedAccountType,
  configMissing,
} from '../services/smsSettings.js';
import { createChecker } from '../services/smsGateway.js';
import { listEventsForType } from '../services/smsEvents.js';
import { smsLogQuerySchema } from '../validators/smsTemplate.js';
import * as senderService from '../services/smsSender.js';
import { KNOWN_COUNTRIES } from '../services/smsCountries.js';

/** async handler'ın reddini Express'in anlayacağı `next(error)`'a çevirir. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function createSmsHandlers({
  service = smsService,
  getConfig = getSmsConfig,
  getSettingsStatus = getSmsSettingsStatus,
  saveSettings = saveSmsSettings,
  createProviderChecker = createChecker,
  senders = senderService,
  getSettings = getSmsConfig,
  persistAccountType = persistDetectedAccountType,
} = {}) {
  /** Panel tek istekte hem listeyi hem olay listesini hem de tavanı görsün. */
  async function list(req, res) {
    const { templates, summary } = await service.listTemplates({
      type: req.query.type || null,
      isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : null,
      search: req.query.search || '',
    });
    return res.json({
      templates,
      summary,
      events: {
        action: listEventsForType('action'),
        scheduled: listEventsForType('scheduled'),
      },
      categories: ['system', 'betting', 'casino', 'wallet', 'promotion'],
      maxRecipients: service.MAX_RECIPIENTS,
    });
  }

  async function create(req, res) {
    const template = await service.createTemplate(req.validated, req.user?.id);
    return res.status(201).json({ template });
  }

  async function update(req, res) {
    const template = await service.updateTemplate(req.params.id, req.validated, req.user?.id);
    return res.json({ template });
  }

  async function remove(req, res) {
    await service.deleteTemplate(req.params.id);
    return res.json({ ok: true });
  }

  async function send(req, res) {
    const body = req.validated;
    const result = await service.sendTemplate({
      templateId: req.params.id,
      audienceType: body.audienceType,
      segmentId: body.segmentId ?? null,
      userIds: body.userIds ?? [],
      variables: body.variables ?? {},
      adminId: req.user?.id,
    });
    return res.json(result);
  }

  async function logs(req, res) {
    // Query doğrulaması burada: global `validate()` middleware'i yalnız
    // `req.body` ile çalışır, GET sorgu parametrelerini görmezdi.
    const parsed = smsLogQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Geçersiz sorgu', details: parsed.error.flatten() } });
    }
    const { status, limit } = parsed.data;
    return res.json(await service.listLogs({ status: status ?? null, limit: limit ?? 50 }));
  }

  async function settingsStatus(req, res) {
    return res.json(await getSettingsStatus());
  }

  async function settingsUpdate(req, res) {
    return res.json(await saveSettings(req.validated, req.user?.id));
  }

  /**
   * Kimlik bilgisi testi — mesaj GÖNDERMEZ, Twilio hesap ucunu okur.
   * Hep 200 döner: `result.ok` toast'u yönetir, "502" ayrımı gereksiz.
   */
  async function settingsTest(req, res) {
    const cfg = await getConfig();
    if (!cfg.configured) {
      return res.json({
        ok: false,
        code: 'SMS_NOT_CONFIGURED',
        error: 'SMS Gateway yapılandırması eksik (Account SID / Auth Token / gönderici).',
        missing: configMissing(cfg),
      });
    }
    const check = createProviderChecker(cfg.provider);
    const result = await check({ accountSid: cfg.accountSid, authToken: cfg.authToken });
    if (result.ok && result.accountType) {
      // Gerçek hesap tipini kaydet (elle girilmişse dokunmaz) ve ayarları
      // tazele ki panel rozeti doğru değeri göstersin.
      await persistAccountType(result.accountType, req.user?.id);
    }
    return res.json({ ...result, settings: await getSettingsStatus() });
  }

  async function senderList(req, res) {
    return res.json({ ...(await senders.listSenders()), knownCountries: KNOWN_COUNTRIES, trialVerifiedLimit: senders.TRIAL_VERIFIED_LIMIT });
  }

  async function senderCreate(req, res) {
    const sender = await senders.createSender(req.validated, req.user?.id);
    return res.status(201).json({ sender, rejectedTrialNumbers: sender.rejectedTrialNumbers ?? [] });
  }

  async function senderUpdate(req, res) {
    const sender = await senders.updateSender(req.params.id, req.validated, req.user?.id);
    return res.json({ sender, rejectedTrialNumbers: sender.rejectedTrialNumbers ?? [] });
  }

  async function senderRemove(req, res) {
    await senders.deleteSender(req.params.id);
    return res.json({ ok: true });
  }

  /**
   * Aktif göndericinin gönderime hazır olup olmadığını ÖZETLER — mesaj
   * göndermez. Panelde "Neden engelliyim?" sorusunun tek cevabı.
   */
  async function senderGate(req, res) {
    const gate = await senders.resolveSenderGate(await getSettings());
    return res.json({
      blocked: gate.blocked,
      reasons: gate.reasons,
      accountType: gate.accountType,
      sender: gate.sender ?? null,
    });
  }

  /**
   * Serbest metin test mesajı (İletişim → SMS → Test / send) — şablon
   * gerektirmez, gerçek maliyeti vardır; sonuç hem yanıtta hem SmsLog'da.
   */
  async function testSend(req, res) {
    const { to, message } = req.validated;
    return res.json(await service.sendTestSms({ to, message, adminId: req.user?.id }));
  }

  return {
    senderList: asyncHandler(senderList),
    senderCreate: asyncHandler(senderCreate),
    senderUpdate: asyncHandler(senderUpdate),
    senderRemove: asyncHandler(senderRemove),
    senderGate: asyncHandler(senderGate),
    list: asyncHandler(list),
    create: asyncHandler(create),
    update: asyncHandler(update),
    remove: asyncHandler(remove),
    send: asyncHandler(send),
    logs: asyncHandler(logs),
    settingsStatus: asyncHandler(settingsStatus),
    settingsUpdate: asyncHandler(settingsUpdate),
    settingsTest: asyncHandler(settingsTest),
    testSend: asyncHandler(testSend),
  };
}

const handlers = createSmsHandlers();
export default handlers;