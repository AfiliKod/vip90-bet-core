import mongoose from 'mongoose';

export const SMS_LOG_STATUSES = ['sent', 'failed', 'skipped'];
export const SMS_AUDIENCE_TYPES = ['all', 'segment', 'users'];

/**
 * SMS gönderim kaydı — tek bir alıcıya giden tek bir mesajın izi.
 *
 * Gönderim senkron (operatör "gönder" dediğinde) yapılır; toplu gönderimde
 * her alıcı için bir satır düşer. `skipped` = mesaj hazırlanamadan elendi
 * (telefonu yok, E.164 formatında değil, şablon pasif). Bu sayede "kaç kişiye
 * gitti / kaçı başarısız" sorusu log'dan cevaplanır, gönderim anında dönen
 * özetten değil.
 */
const schema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'SmsTemplate', default: null },
  templateKey: { type: String, default: null },

  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  username: { type: String, default: null },
  phone: { type: String, default: null },

  // Gönderilen ham/son hâli (kısa tutulur — SMS zaten kısa)
  body: { type: String, default: '' },

  status: { type: String, enum: SMS_LOG_STATUSES, required: true },

  // skipped ise NEDEN atlandı (SMS_SENDER_NOT_REGISTERED,
  // SMS_TRIAL_NUMBER_NOT_VERIFIED, SMS_INVALID_PHONE …). Gönderim denemesi
  // yapılmadan elenen alıcılar için tek satırda görünür olması, "neden gitmedi"
  // sorusunu gönderim özetinden okunur kılar.
  skipReason: { type: String, default: null },

  // Twilio hata kodu (varsa) + sözlükteki karşılığı — panel bunu çevirir.
  twilioCode: { type: Number, default: null },
  errorMeaning: { type: String, default: null },
  provider: { type: String, default: 'twilio' },
  providerSid: { type: String, default: null },
  error: { type: String, default: '' },

  audienceType: { type: String, enum: SMS_AUDIENCE_TYPES, default: null },
  segmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlayerSegment', default: null },

  // Gönderimi başlatan operatör (manuel gönderimde dolu).
  triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ templateKey: 1, createdAt: -1 });
schema.index({ skipReason: 1, createdAt: -1 });

export default mongoose.model('SmsLog', schema);