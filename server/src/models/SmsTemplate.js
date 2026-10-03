import mongoose from 'mongoose';

/**
 * SMS mesaj şablonu — iki farklı tetiklenme tipi bir arada:
 *
 *   type='action'    → Sistem mesajı. Bir olay tetiklendiğinde gönderilir
 *                      (kayıt, bahis sonucu, casino oturum kar/zararı, yatırım,
 *                      çekim, uzun süredir giriş yapmayan kullanıcı…). `eventKey`
 *                      ZORUNLUDUR ve `services/smsEvents.js` kayıt defterinde
 *                      bulunmalıdır. Bu şablonlar panelden ELLE gönderilemez —
 *                      tetikleyen kodu domain akışıdır, operatör değil.
 *
 *   type='scheduled' → Zamana duyarlı / kampanya mesajı. `eventKey` opsiyoneldir
 *                      (verilirse aynı kancalardan otomatik de tetiklenebilir),
 *                      ama asıl kullanımı panelden "şimdi gönder": tek kullanıcı,
 *                      tüm kullanıcılar veya bir segment.
 *
 * `content` gövdesinde değişkenler `{{degisken}}` çift süslü parantezle yazılır
 * (SMS'te `{}` tek başına kırılır; ayrıca i18n sözlüklerinin `{param}`
 * interpolasyonu ile karışmasın diye çift parantez standardı seçildi).
 *
 * `key` sabit bir tanımlayıcıdır (kebab-case değil, i18n anahtar kuralıyla uyum
 * için camelCase) — kod tarafından referans verilebilir, kullanıcı düzenleyebilir.
 */
export const SMS_TEMPLATE_TYPES = ['action', 'scheduled'];

export const SMS_TEMPLATE_CATEGORIES = ['system', 'betting', 'casino', 'wallet', 'promotion'];

const schema = new mongoose.Schema({
  // `lowercase` YOK: anahtar sözleşmesi camelCase (aynı i18n anahtar kuralı ve
  // kodun referans verdiği sabit ad). Küçültme `betWinNotice`'i `betwinnotice`
  // yapıp log/rapor eşleşmelerini bozuyordu.
  key: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
  title: { type: String, required: true, trim: true, maxlength: 120 },

  type: { type: String, enum: SMS_TEMPLATE_TYPES, required: true, default: 'scheduled' },

  // action → zorunlu (SMS_ACTION_EVENTS), scheduled → opsiyonel (SMS_SCHEDULED_EVENTS)
  eventKey: { type: String, default: null },

  category: { type: String, enum: SMS_TEMPLATE_CATEGORIES, default: 'system' },

  content: { type: String, required: true, trim: true, maxlength: 1000 },

  // Şablonun kullandığı değişkenler — `{{...}}` içinden türetilir, elle
  // girilmez. Gönderim anında eksik değişken tespiti ve UI ipucu için.
  variables: { type: [String], default: [] },

  isActive: { type: Boolean, default: true },

  // Operasyonel sayaçlar — son gönderim zamanı panelde "düzenlenebilir halde"
  // görüntülenir.
  sentCount: { type: Number, default: 0, min: 0 },
  lastSentAt: { type: Date, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ type: 1, isActive: 1 });
schema.index({ createdAt: -1 });

export default mongoose.model('SmsTemplate', schema);