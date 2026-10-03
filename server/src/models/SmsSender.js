import mongoose from 'mongoose';

/**
 * SMS gönderici kaydı — "bu numara/Servis hangi ülkeden, hangi mevzuata
 * bağlı, onay durumu ne, hangi ülkelere gönderebilir" bilgisinin kayıt defteri.
 *
 * Neden gerekli: Twilio'da bir numaranın mesaj gönderebilmesi tek bir kapı
 * değil, üst üste binen kapılara bağlıdır:
 *   • Hesap trial ise YALNIZ doğrulanmış alıcı numaralara ve kayıt ülkesine
 *     gönderilir (en fazla 5 numara, 30 gün, Twilio'nun kendi şablonu).
 *   • A2P 10DLC (ABD/Kanada uzun numara) → marka + kampanya kaydı zorunlu,
 *     üstelik **ücretli hesap şart** (30034 / 30033 / 30126).
 *   • Toll-free (ABD/Kanada) → doğrulama zorunlu (304xx).
 *   • Birçok ülkede yerel gönderici (sender ID) ön kaydı ister (30041 /
 *     30040) — ülke bazında "onay" burada devreye girer.
 * Bu bilgiler panelde görünür değilse operatör, SMS'in neden gitmediğini
 * Twilio hata kodundan başka yerden öğrenemez.
 *
 * `isActive`: aynı anda en fazla BİR aktif gönderici olabilir (servis
 * uygular). Gönderim, gateway ayarındaki `fromNumber`/`messagingServiceSid`
 * ile bu kaydın eşleşmesini denetler.
 */
export const SMS_SENDER_CAPABILITIES = ['long_code', 'short_code', 'toll_free', 'alphanumeric', 'sender_id', 'messaging_service'];

export const SMS_REGISTRATION_TYPES = ['none', 'a2p_10dlc', 'toll_free', 'local_sender_id', 'alphanumeric'];

export const SMS_APPROVAL_STATUSES = [
  'not_required',   // kayıt gerekmiyor (örn. ülke serbest)
  'not_submitted',  // kayıt hiç gönderilmemiş
  'pending',        // incelemede
  'approved',       // onaylandı
  'rejected',       // reddedildi
  'expired',        // süresi doldu
  'suspended',      // askıya alındı
];

/** Gönderime izin veren onay durumları. */
export const SMS_APPROVED_STATUSES = ['not_required', 'approved'];

const schema = new mongoose.Schema({
  provider: { type: String, enum: ['twilio'], default: 'twilio' },
  label: { type: String, required: true, trim: true, maxlength: 80 },

  /** Uzun numara / sender ID (E.164). `messagingServiceSid` varsa opsiyonel. */
  senderNumber: { type: String, default: null, trim: true },

  /** Bu numaranın bağlı olduğu Messaging Service (varsa). */
  messagingServiceSid: { type: String, default: null, trim: true },

  /** Numarayı VERDİREN ülke — mevzuat buraya göre değişir (ISO-3166 alpha-2). */
  senderCountry: { type: String, required: true, trim: true, uppercase: true, minlength: 2, maxlength: 2 },

  capability: { type: String, enum: SMS_SENDER_CAPABILITIES, default: 'long_code' },

  /** Hangi kayıt/uygulama üzerinden onay alındı. */
  registrationType: { type: String, enum: SMS_REGISTRATION_TYPES, default: 'none' },

  approvalStatus: { type: String, enum: SMS_APPROVAL_STATUSES, default: 'not_submitted' },

  /** Kayıt referansı: A2P 10DLC brand/campaign SID, toll-free doğrulama SID, yerel kayıt no… */
  registrationId: { type: String, default: null, trim: true },

  brandName: { type: String, default: null, trim: true },
  useCase: { type: String, default: null, trim: true },

  /**
   * Bu göndericinin onaylı olduğu HEDEF ülkeler (ISO-3166 alpha-2).
   * Boş dizi = kısıt yok (yalnız gönderici kaydı kontrol edilir).
   * Dolu ise hedef ülke bu listede değilse gönderim durdurulur.
   */
  destinationCountries: { type: [String], default: [] },

  dailyLimit: { type: Number, default: 0, min: 0 },

  /**
   * Trial hesapta gönderilebilecek numaralar (Twilio konsolunda doğrulanmış).
   * Twilio sınırı: hesap başına en fazla 5 numara. Yalnız accountType='trial'
   * iken anlamlıdır.
   */
  trialVerifiedNumbers: { type: [String], default: [] },

  /** Trial hesabın bitiş tarihi (30 gün). Bilgi amaçlı, gönderimi engellemez. */
  trialExpiresAt: { type: Date, default: null },

  notes: { type: String, default: '', maxlength: 1000 },

  isActive: { type: Boolean, default: false },

  /** Panelde "Bağlantıyı Test Et" ile son doğrulama sonucu. */
  lastCheckedAt: { type: Date, default: null },
  lastCheckStatus: { type: String, default: '' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ isActive: 1 });
schema.index({ provider: 1, senderNumber: 1 });

export default mongoose.model('SmsSender', schema);