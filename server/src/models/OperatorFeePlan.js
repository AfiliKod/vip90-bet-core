import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const RETENTION_MS = 5 * 365 * 24 * 60 * 60 * 1000;

const operatorFeePlanSchema = new mongoose.Schema({
  tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true },
  validFrom: { type: Date, required: true, default: Date.now },
  validTo: { type: Date, default: null, index: true },
  sportsbookFee: {
    model: {
      type: String,
      enum: ['none', 'fixed', 'turnover_percentage', 'both'],
      default: 'none',
    },
    fixedMonthlyFee: { type: Number, default: 0, min: 0 },
    turnoverRate: { type: Number, default: 0, min: 0, max: 1 },
    currency: { type: String, default: 'TRY' },
  },
  platformFee: {
    model: {
      type: String,
      enum: ['none', 'fixed', 'ggr_percentage', 'both'],
      default: 'none',
    },
    fixedMonthlyFee: { type: Number, default: 0, min: 0 },
    ggrRate: { type: Number, default: 0, min: 0, max: 1 },
    currency: { type: String, default: 'TRY' },
  },
  notes: { type: String, default: null },
  createdBy: { type: ObjectId, ref: 'StaffAccount', required: true },
  endedBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  legalRetentionUntil: {
    type: Date,
    default: () => new Date(Date.now() + RETENTION_MS),
  },
}, { timestamps: true });

operatorFeePlanSchema.index(
  { tenantId: 1, validTo: 1 },
  { unique: true, partialFilterExpression: { validTo: null } }
);

export default mongoose.models.OperatorFeePlan || mongoose.model('OperatorFeePlan', operatorFeePlanSchema);
