/**
 * SMS gönderici kaydı servisi — CRUD, aktif gönderici çözümleme ve
 * GÖNDERİM KAPISI.
 *
 * Kapı (`resolveSenderGate`) gönderimden hemen önce çalışır ve mesajı
 * engellemezse `{ blocked: null }`, engellerse `{ blocked: 'NEDEN' }` döner.
 * Gönderim servisi bunu ALICI BAŞINA uygular: geçersiz tek bir numara
 * yüzünden tüm kampanya iptal edilmez, o alıcı "atlandı" olur ve nedeni
 * loglanır. Operatör 2000 kişilik bir kampanyada 3 numaranın neden gitmediğini
 * görebilmelidir.
 */
import SmsSender, {
  SMS_SENDER_CAPABILITIES,
  SMS_REGISTRATION_TYPES,
  SMS_APPROVAL_STATUSES,
  SMS_APPROVED_STATUSES,
} from '../models/SmsSender.js';
import { countryFromE164 } from './smsCountries.js';
import { normalizePhone } from './smsGateway.js';
import { SmsError } from './smsTemplate.js';

export {
  SMS_SENDER_CAPABILITIES,
  SMS_REGISTRATION_TYPES,
  SMS_APPROVAL_STATUSES,
  SMS_APPROVED_STATUSES,
};

/** Twilio trial hesabı en fazla 5 doğrulanmış numaraya izin verir. */
export const TRIAL_VERIFIED_LIMIT = 5;

export const SMS_BLOCK_REASONS = [
  'SMS_SENDER_NOT_REGISTERED',   // aktif gönderici kaydı yok/yetişmiyor
  'SMS_SENDER_MISMATCH',         // gateway From numarası kayıttakiyle eşleşmiyor
  'SMS_SENDER_COUNTRY_DENIED',   // hedef ülke göndericinin onaylı listesinde değil
  'SMS_TRIAL_NUMBER_NOT_VERIFIED', // trial: numara Twilio'da doğrulanmamış
  'SMS_TRIAL_COUNTRY_DENIED',    // trial: kayıt ülkesi dışına gönderilemez
];

export async function listSenders() {
  const senders = await SmsSender.find().sort({ isActive: -1, createdAt: -1 }).lean();
  return { senders, approvedStatuses: SMS_APPROVAL_STATUSES, capabilities: SMS_SENDER_CAPABILITIES, registrationTypes: SMS_REGISTRATION_TYPES };
}

function normalizeIso(value) {
  const iso = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(iso) ? iso : null;
}

function normalizeList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeIso).filter(Boolean))].sort();
}

/**
 * Trial doğrulanmış numaraları E.164'e çevirip benzersizleştirir.
 *
 * ÇÖZÜMLEMEYENLER SESSİZCE ATILMAZ: operatör panelde `0532 111 22 33`
 * yazıp kaydediyorsa ve ülke kodu beyan edilmemişse bu numara listede
 * GÖRÜNMEZ ve nedenini anlamaz. Reddedilenler ayrıca döner ki controller
 * yanıtta gösterebilsin.
 *
 * @returns {{ numbers: string[], rejected: string[] }}
 */
export function normalizeTrialNumbers(values, defaultCountryCode = null) {
  const numbers = [];
  const rejected = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const phone = normalizePhone(raw, defaultCountryCode);
    if (!phone) {
      const trimmed = String(raw ?? '').trim();
      if (trimmed) rejected.push(trimmed);
      continue;
    }
    if (!numbers.includes(phone)) numbers.push(phone);
  }
  return { numbers, rejected };
}

export async function createSender(data, adminId = null) {
  const senderNumber = data.senderNumber ? normalizePhone(data.senderNumber, data.defaultCountryCode) : null;
  if (data.senderNumber && !senderNumber) {
    throw new SmsError(`Gönderici numarası E.164 olarak çözümlenemedi: ${data.senderNumber}`, 'SMS_SENDER_NUMBER_INVALID');
  }
  if (!senderNumber && !data.messagingServiceSid) {
    throw new SmsError('Gönderici numarası ya da Messaging Service SID girilmeli', 'SMS_SENDER_IDENTITY_REQUIRED');
  }
  if (!normalizeIso(data.senderCountry)) {
    throw new SmsError('Gönderici ülkesi ISO-3166 alpha-2 olmalı (örn. TR)', 'SMS_SENDER_COUNTRY_INVALID');
  }

  // Aynı anda tek aktif gönderici: gönderim tek ve belirli bir kimlikle olur.
  if (data.isActive) await SmsSender.updateMany({}, { $set: { isActive: false } });

  const trial = normalizeTrialNumbers(data.trialVerifiedNumbers, data.defaultCountryCode);
  const created = await SmsSender.create({
    provider: 'twilio',
    label: data.label,
    senderNumber,
    messagingServiceSid: data.messagingServiceSid || null,
    senderCountry: normalizeIso(data.senderCountry),
    capability: data.capability,
    registrationType: data.registrationType,
    approvalStatus: data.approvalStatus,
    registrationId: data.registrationId || null,
    brandName: data.brandName || null,
    useCase: data.useCase || null,
    destinationCountries: normalizeList(data.destinationCountries),
    dailyLimit: Number(data.dailyLimit) || 0,
    trialVerifiedNumbers: trial.numbers,
    trialExpiresAt: data.trialExpiresAt || null,
    notes: data.notes ?? '',
    isActive: Boolean(data.isActive),
    createdBy: adminId,
    updatedBy: adminId,
  }).then(d => d.toObject());

  return { ...created, rejectedTrialNumbers: trial.rejected };
}

export async function updateSender(id, data, adminId = null) {
  const current = await SmsSender.findById(id);
  if (!current) throw new SmsError('Gönderici bulunamadı', 'NOT_FOUND', 404);

  if (data.isActive) await SmsSender.updateMany({ _id: { $ne: id } }, { $set: { isActive: false } });

  const patch = { updatedBy: adminId };
  if (data.label !== undefined) patch.label = data.label;
  if (data.senderNumber !== undefined) {
    patch.senderNumber = data.senderNumber ? normalizePhone(data.senderNumber, data.defaultCountryCode) : null;
    if (data.senderNumber && !patch.senderNumber) {
      throw new SmsError(`Gönderici numarası E.164 olarak çözümlenemedi: ${data.senderNumber}`, 'SMS_SENDER_NUMBER_INVALID');
    }
  }
  if (data.messagingServiceSid !== undefined) patch.messagingServiceSid = data.messagingServiceSid || null;
  if (data.senderCountry !== undefined) {
    const iso = normalizeIso(data.senderCountry);
    if (!iso) throw new SmsError('Gönderici ülkesi ISO-3166 alpha-2 olmalı (örn. TR)', 'SMS_SENDER_COUNTRY_INVALID');
    patch.senderCountry = iso;
  }
  for (const field of ['capability', 'registrationType', 'approvalStatus']) {
    if (data[field] !== undefined) patch[field] = data[field];
  }
  if (data.registrationId !== undefined) patch.registrationId = data.registrationId || null;
  if (data.brandName !== undefined) patch.brandName = data.brandName || null;
  if (data.useCase !== undefined) patch.useCase = data.useCase || null;
  if (data.destinationCountries !== undefined) patch.destinationCountries = normalizeList(data.destinationCountries);
  if (data.dailyLimit !== undefined) patch.dailyLimit = Number(data.dailyLimit) || 0;
  let rejectedTrialNumbers = [];
  if (data.trialVerifiedNumbers !== undefined) {
    const trial = normalizeTrialNumbers(data.trialVerifiedNumbers, data.defaultCountryCode);
    patch.trialVerifiedNumbers = trial.numbers;
    rejectedTrialNumbers = trial.rejected;
  }
  if (data.trialExpiresAt !== undefined) patch.trialExpiresAt = data.trialExpiresAt || null;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.isActive !== undefined) patch.isActive = Boolean(data.isActive);

  const updated = await SmsSender.findByIdAndUpdate(id, patch, { new: true, runValidators: true }).lean();
  return { ...updated, rejectedTrialNumbers };
}

export async function deleteSender(id) {
  const removed = await SmsSender.findByIdAndDelete(id);
  if (!removed) throw new SmsError('Gönderici bulunamadı', 'NOT_FOUND', 404);
  return true;
}

/** Kuru kontrol sonucunu kayda yazar (kimlik bilgisi testiyle birlikte). */
export async function markSenderChecked(id, { ok, status = '' } = {}) {
  return SmsSender.findByIdAndUpdate(id, {
    $set: { lastCheckedAt: new Date(), lastCheckStatus: ok ? 'ok' : String(status || 'error').slice(0, 300) },
  }).lean();
}

/**
 * Gönderim kapısı.
 *
 * @param config  `getSmsConfig()` çıktısı (accountType dahil)
 * @returns {{ sender, blocked, reasons: string[] }} `blocked` tek bir neden ise
 *          TÜM gönderimi durdurur; alıcı başına uygulanacak nedenler
 *          `checkRecipient(recipientPhone)` ile alınır.
 */
export async function resolveSenderGate(config) {
  const sender = await SmsSender.findOne({ isActive: true }).lean();
  const accountType = config?.accountType || 'paid';
  const reasons = [];

  // Trial hesapta kayıt zorunluluğu ANLAMLI DEĞİL: A2P 10DLC kaydı resmen
  // ücretli hesap şartı, yani trial bir hesapta "onay bekliyor" durumu asla
  // "approved" olmaz. Trial'da asıl kısıt doğrulanmış alıcı + kayıt ülkesidir;
  // onay durumu yalnız ÜCRETLİ hesapta kapıyı tutar.
  const enforceApproval = accountType !== 'trial';

  if (!sender) {
    // Kayıt yoksa: ücretli hesapta onay denetimi yapılamaz, bu yüzden uyarı
    // düzeyinde kalır (Twilio 30041/30034 döner ve log'a düşer).
    if (enforceApproval) reasons.push('SMS_SENDER_NOT_REGISTERED');
    return { sender: null, blocked: null, reasons, accountType, checkRecipient: () => ({ blocked: null, reasons: [] }) };
  }

  if (enforceApproval && !SMS_APPROVED_STATUSES.includes(sender.approvalStatus)) {
    reasons.push('SMS_SENDER_NOT_REGISTERED');
  }

  // Gateway ayarındaki gönderici ile kayıt eşleşmiyorsa, onay başka numara
  // için alınmış olabilir → gönderim yapmak yanlış numarayı onaylı sayardı.
  const from = config?.messagingServiceSid
    ? sender.messagingServiceSid && sender.messagingServiceSid === config.messagingServiceSid
    : !config?.messagingServiceSid && sender.senderNumber
      && normalizePhone(sender.senderNumber) === normalizePhone(config?.fromNumber, config?.defaultCountryCode);
  if (!from) reasons.push('SMS_SENDER_MISMATCH');

  /**
   * ALICI BAŞINA denetim. Kayıt/hesap seviyesindeki nedenler her alıcı için
   * geçerlidir; ülke ve trial numarası denetimi alıcıya özeldir.
   */
  function checkRecipient(phone) {
    const hard = reasons.slice();
    if (hard.length) return { blocked: hard[0], reasons: hard };

    const targetCountry = countryFromE164(phone);

    if (accountType === 'trial') {
      // Twilio trial: yalnız konsolda DO�RULANMIŞ numaralara gönderilir
      // (hesap başına en fazla 5). Liste boşsa engellemiyoruz — operatörün
      // doğruladığı numaraları biz bilmiyoruz; Twilio zaten 14111 döner ve
      // bu kod log'a düşer. Liste DOLUYSA operatörün beyanı esas alınır.
      const verified = sender.trialVerifiedNumbers ?? [];
      if (verified.length && !verified.includes(phone)) {
        return { blocked: 'SMS_TRIAL_NUMBER_NOT_VERIFIED', reasons: ['SMS_TRIAL_NUMBER_NOT_VERIFIED'] };
      }
      // Trial'de SMS yalnız KAYIT ülkesine gider. Kayıt ülkesi HESAP
      // özelliğidir (`sms.trialSignUpCountry`), göndericinin ülkesi DEĞİL —
      // ABD trial numarası Türkiye'ye de (doğrulanmışsa) gönderebilir.
      // Beyan edilmemişse ya da numaradan ülke çözülemiyorsa engellemiyoruz.
      const signUpCountry = String(config?.trialSignUpCountry ?? '').trim().toUpperCase();
      if (signUpCountry && targetCountry && targetCountry !== signUpCountry) {
        return { blocked: 'SMS_TRIAL_COUNTRY_DENIED', reasons: ['SMS_TRIAL_COUNTRY_DENIED'] };
      }
      return { blocked: null, reasons: [] };
    }

    const allowed = sender.destinationCountries ?? [];
    if (allowed.length && targetCountry && !allowed.includes(targetCountry)) {
      return { blocked: 'SMS_SENDER_COUNTRY_DENIED', reasons: ['SMS_SENDER_COUNTRY_DENIED'] };
    }
    return { blocked: null, reasons: [] };
  }

  return { sender, blocked: reasons[0] ?? null, reasons, accountType, checkRecipient };
}

/**
 * Demo gönderici. Trial durumunu gerçeği yansıtacak şekilde gösterir:
 * hesap tipi `sms.accountType` ayarından gelir, demo kayıt "onay bekliyor"
 * durumundadır — yani demo hesapla gönderim yapılmaması gerektiği panelde
 * AÇIKÇA görünür.
 *
 * `senderNumber` BİLEREK ÖRNEKTİR, gerçek hesabın numarası DEĞİL: demo seed
 * her kurulumda oluşur ve gerçek bir trial numarasını koda gömmek hem
 * ortam bilgisi sızdırır hem de gateway'deki `TWILIO_FROM_NUMBER` ile
 * eşleşmeyen bir "aktif" kayıt bırakır (kapı `SMS_SENDER_MISMATCH` döner).
 * Operatör kendi numarasını panelden ya da .env'den girer.
 */
export const DEMO_SENDER = {
  key: 'demoTwilioNumber',
  provider: 'twilio',
  label: 'ABD trial numarası',
  senderNumber: '+15551234567',
  senderCountry: 'US',
  capability: 'long_code',
  registrationType: 'a2p_10dlc',
  approvalStatus: 'not_submitted',
  brandName: 'VIP90.bet',
  useCase: 'account-notifications',
  destinationCountries: ['US'],
  dailyLimit: 0,
  trialVerifiedNumbers: [],
  notes: 'Trial hesapta yalnız doğrulanmış numaralara ve kayıt ülkesine gönderilir. A2P 10DLC kaydı ücretli hesap gerektirir.',
  isActive: true,
};

export async function initDefaultSmsSender() {
  const existing = await SmsSender.find({ label: DEMO_SENDER.label }).lean();
  if (existing.length) return { inserted: 0 };
  await SmsSender.create({ ...DEMO_SENDER });
  return { inserted: 1 };
}