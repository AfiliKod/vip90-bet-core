import mongoose from 'mongoose';

/**
 * Sistem e-posta şablonu — admin panelinden CRUD edilir.
 *
 * İki kategori var ve aralarındaki fark gönderim kuralını belirler:
 *  - `action`    : sistemdeki bir olaya (kayıt, bahis sonuçlanması, yatırma…)
 *                  bağlıdır. Panelde DÜZENLENİR ama elle GÖNDERİLEMEZ.
 *  - `scheduled` : zamana duyarlı (kampanya, promosyon, hareketsiz-kullanıcı).
 *                  Panelde düzenlenir ve kitle seçilerek elle gönderilebilir.
 *
 * `event` her iki kategoride de vardır: hangi olaya/kitleye ait olduğunu ve
 * `{{değişken}}` havuzunu `services/mailTemplates.js` içindeki MAIL_EVENTS
 * kataloğundan okur. Olay başına TEK şablon vardır (unique index) — kod
 * şablonu `event` üzerinden çözer.
 */
const audienceSchema = new mongoose.Schema({
  type: { type: String, enum: ['all', 'segments', 'users', 'inactive'], default: 'all' },
  segmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PlayerSegment' }],
  userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // `type === 'inactive'` için: kaç gündür sisteme girmemiş kullanıcılar.
  inactiveDays: { type: Number, default: 14, min: 1, max: 720 },
}, { _id: false });

const scheduleSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  intervalHours: { type: Number, default: 168, min: 1, max: 24 * 365 },
  lastSentAt: { type: Date, default: null },
  nextSentAt: { type: Date, default: null },
}, { _id: false });

const statsSchema = new mongoose.Schema({
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  lastSentAt: { type: Date, default: null },
}, { _id: false });

const schema = new mongoose.Schema({
  // MAIL_EVENTS kataloğundaki olay adı — hem kimlik hem çözüm anahtarı.
  event: { type: String, required: true, unique: true, index: true },
  category: { type: String, enum: ['action', 'scheduled'], required: true, index: true },
  // Adminin tanıdığı kısa görünen ad (panelde ana sütun) — veri, arayüz metni değil.
  name: { type: String, required: true, trim: true, maxlength: 120 },
  subject: { type: String, required: true, trim: true, maxlength: 300 },
  // Preheader — gelen kutusu önizlemesi. Boş bırakılabilir.
  preheader: { type: String, default: '', trim: true, maxlength: 300 },
  // HTML gövde — {{değişken}} yer tutucuları (services/mailTemplates.js render).
  body: { type: String, required: true, maxlength: 20000 },
  // İsteğe bağlı CTA butonu: `ctaUrl` render'dan sonra boş değilse gövdenin
  // altına mail-güvenli buton + yedek bağlantı olarak eklenir.
  ctaLabel: { type: String, default: '', trim: true, maxlength: 80 },
  ctaUrl: { type: String, default: '', trim: true, maxlength: 500 },
  enabled: { type: Boolean, default: true, index: true },
  // Sistem tarafından tohumlanan varsayılan şablon — silinemez, yalnızca düzenlenir.
  isSystem: { type: Boolean, default: false },
  audience: { type: audienceSchema, default: () => ({}) },
  schedule: { type: scheduleSchema, default: () => ({}) },
  stats: { type: statsSchema, default: () => ({}) },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

schema.index({ category: 1, enabled: 1 });
schema.index({ 'schedule.enabled': 1, 'schedule.nextSentAt': 1 });
schema.index({ createdAt: -1 });

export default mongoose.model('SystemMailTemplate', schema);
