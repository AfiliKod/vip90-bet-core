import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const statementLineSchema = new mongoose.Schema({
  statementId: { type: ObjectId, ref: 'PartnerStatement', required: true, index: true },
  partnerId: { type: ObjectId, ref: 'Partner', required: true, index: true },
  tenantId: { type: ObjectId, ref: 'Tenant', default: null, index: true },
  linkId: { type: ObjectId, ref: 'PartnerOperatorLink', default: null },
  type: {
    type: String,
    enum: ['commission', 'fixed_fee', 'sportsbook_fee', 'adjustment', 'minimum_fee_topup'],
    required: true,
  },
  date: { type: String, default: null },
  currency: { type: String, required: true },
  baseMetric: {
    type: String,
    enum: ['ggr', 'ngr', 'turnover', 'fixed', 'manual'],
    default: 'ggr',
  },
  baseAmount: { type: Number, default: 0 },
  rate: { type: Number, default: 0 },
  amount: { type: Number, required: true, default: 0 },
  description: { type: String, required: true },
  reason: { type: String, default: null },
  createdBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  metadata: { type: Mixed, default: () => ({}) },
}, { timestamps: true });

statementLineSchema.index({ statementId: 1, type: 1 });
statementLineSchema.index({ partnerId: 1, date: 1 });

export default mongoose.models.StatementLine || mongoose.model('StatementLine', statementLineSchema);
