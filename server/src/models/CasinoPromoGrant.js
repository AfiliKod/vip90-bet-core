import mongoose from 'mongoose';

// Bonus Call + Freeround admin ödülleri — kayıtlı yaşam döngüsü.
// bonusCall: pending → running → completed | cancelled | failed
// freeRound: pending → active   → expired  | cancelled | failed
// 'expired' saklanmaz; effectiveStatus() ile okurken hesaplanır (bkz. spec).
const KINDS = ['bonusCall', 'freeRound'];
const STATUSES = ['pending', 'running', 'completed', 'active', 'cancelled', 'failed'];

const schema = new mongoose.Schema({
  kind: { type: String, enum: KINDS, required: true, index: true },

  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  username: { type: String, required: true },
  palaceUserCode: { type: String, default: null },

  providerId: { type: Number, default: null },
  providerName: { type: String, default: null },
  gameCode: { type: String, default: null },
  gameName: { type: String, default: null },

  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  grantedByUsername: { type: String, default: null },
  memo: { type: String, maxlength: 200, default: '' },

  // yalnızca bonusCall
  gplayId: { type: Number, default: null },
  setPoint: { type: Number, default: null },
  // default YOK (bilinçli): sparse unique index yalnızca alan hiç YOKSA (undefined)
  // null'ları çakışmadan atlar; default:null koysaydık alan her zaman "var" olurdu.
  callId: { type: Number },

  // yalnızca freeRound
  rounds: { type: Number, default: null },
  bet: { type: Number, default: null },
  win: { type: Number, default: null },
  scenario: { type: Number, default: null },
  expiresAt: { type: Date, default: null },
  frId: { type: String, default: null },

  // bonusCall: callback'lerden toplanır (başlangıç 0). freeRound: null (sağlayıcı ayrı bildirmiyor).
  winTotal: { type: Number, default: null },

  status: { type: String, enum: STATUSES, required: true, default: 'pending', index: true },
  providerResponse: { type: mongoose.Schema.Types.Mixed, default: null },
  error: {
    type: new mongoose.Schema({
      code: { type: String },
      message: { type: String },
    }, { _id: false }),
    default: null,
  },

  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ kind: 1, createdAt: -1 });
schema.index({ user: 1, createdAt: -1 });
schema.index({ callId: 1 }, { unique: true, sparse: true });
// Çift tıklama koruması (yarış penceresi): aynı oturuma aynı anda iki 'pending'
// bonus call yazılamaz. Yalnızca eşitlik filtresi kullanır (eski MongoDB uyumlu);
// 'running' aşaması servis katmanındaki findOne kontrolüyle korunur.
schema.index({ gplayId: 1 }, { unique: true, partialFilterExpression: { kind: 'bonusCall', status: 'pending' } });

// Saf fonksiyon — modelin dışında da (statics olarak da) kullanılabilir.
export function effectiveStatus(grant, now = new Date()) {
  if (!grant) return grant;
  if (grant.kind === 'freeRound' && grant.status === 'active' && grant.expiresAt && new Date(grant.expiresAt) <= now) {
    return 'expired';
  }
  return grant.status;
}

schema.statics.effectiveStatus = function (grant, now = new Date()) {
  return effectiveStatus(grant, now);
};

const CasinoPromoGrant = mongoose.models.CasinoPromoGrant || mongoose.model('CasinoPromoGrant', schema);
export default CasinoPromoGrant;
