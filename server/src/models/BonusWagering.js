import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const DEFAULT_GAME_WEIGHTS = {
  sports: 1.0,
  casino_slot: 0.5,
  casino_live: 0.7,
  inhouse: 0.5,
};

const BonusWageringSchema = new mongoose.Schema({
  tenantId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  userId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  promotionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Promotion', default: null },
  source:         { type: String, default: 'manual' }, // 'promotion' | 'manual' | 'admin_adjustment'
  description:   { type: String, default: '' },        // kullanıcıya gösterilecek açıklama
  bonusAmount:   { type: Number, required: true },     // verilen bonus (para birimi bağımsız tutar)
  wageringRequired: { type: Number, required: true },  // tamamlanması gereken wagering (35x ise 3500)
  wageringProgress: { type: Number, default: 0 },      // tamamlanan wagering
  gameWeights:   { type: mongoose.Schema.Types.Mixed, default: () => ({ ...DEFAULT_GAME_WEIGHTS }) },
  multiplier:    { type: Number, default: 35 },        // wagering multiplier (35x)
  status:        { type: String, enum: ['active', 'completed', 'forfeited', 'expired', 'converted'], default: 'active', index: true },
  deadline:      { type: Date, default: null },
  completedAt:   { type: Date, default: null },
  convertedAt:   { type: Date, default: null },
  convertedAmount: { type: Number, default: null },    // cash'e çevrilen miktar
}, { timestamps: { createdAt: true, updatedAt: true } });

BonusWageringSchema.index({ userId: 1, status: 1 });
BonusWageringSchema.index({ status: 1, deadline: 1 });

registerTenantIndexes('BonusWagering', [
  { keys: { tenantId: 1, userId: 1, status: 1 }, options: { name: 'tenant_userId_status' } },
  { keys: { tenantId: 1, status: 1, deadline: 1 }, options: { name: 'tenant_status_deadline' } },
]);

BonusWageringSchema.virtual('progressPercent').get(function () {
  if (!this.wageringRequired) return 100;
  return Math.min(100, Math.floor((this.wageringProgress / this.wageringRequired) * 100));
});

BonusWageringSchema.set('toJSON', { virtuals: true });
BonusWageringSchema.set('toObject', { virtuals: true });

export default defineTenantModel('BonusWagering', BonusWageringSchema);