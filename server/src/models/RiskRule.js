import mongoose from 'mongoose';

export const RULE_ACTION = {
  ALLOW: 'ALLOW',
  REVIEW: 'REVIEW',
  RESTRICT: 'RESTRICT',
  BLOCK: 'BLOCK',
};

export const RULE_CATEGORY = {
  ACCOUNT: 'account',
  AUTHENTICATION: 'authentication',
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  FINANCIAL: 'financial',
  KYC: 'kyc',
  DEVICE: 'device',
  CUSTOM: 'custom',
};

const conditionSchema = new mongoose.Schema({
  field: { type: String, required: true },
  operator: { type: String, enum: ['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'in', 'nin', 'contains', 'between'], required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  unit: { type: String, default: null },
}, { _id: false });

const schema = new mongoose.Schema({
  // unique: initDefaultRules()'un findOneAndUpdate+upsert ile eşzamanlı
  // çift-seed'i engellemesi bu index OLMADAN garanti değil — unique index
  // olmadan upsert, gerçek eşzamanlı çağrılarda "bul→yoksa ekle" kontrolünü
  // ikisi de aynı anda geçip iki ayrı doküman ekleyebilir (MongoDB'nin
  // bilinen upsert-without-unique-index race'i). Ayrıca iki kuralın aynı
  // isimde olması admin UI'da da kafa karıştırıcı olurdu.
  name: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
  priority: { type: Number, default: 0 },
  category: { type: String, enum: Object.values(RULE_CATEGORY), required: true },
  conditions: [conditionSchema],
  conditionLogic: { type: String, enum: ['and', 'or'], default: 'and' },
  action: { type: String, enum: Object.values(RULE_ACTION), required: true },
  severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
  reasonCode: { type: String, required: true },
  brandScope: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],
  jurisdictionScope: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Jurisdiction' }],
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

schema.index({ enabled: 1, priority: -1 });
schema.index({ category: 1 });
schema.index({ brandScope: 1 });
schema.index({ jurisdictionScope: 1 });

export default mongoose.model('RiskRule', schema);
