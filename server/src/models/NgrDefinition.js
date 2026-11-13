import mongoose from 'mongoose';
import { STAT_FIELD_CATEGORY, findNgrRuleViolation } from '../platform/services/ngrRules.js';

const { ObjectId } = mongoose.Schema.Types;
const RETENTION_MS = 5 * 365 * 24 * 60 * 60 * 1000; // 5 years min per K24

const deductionItemSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['bonus', 'provider_fee', 'tax', 'chargeback', 'other'],
    required: true,
  },
  label: { type: String, required: true, trim: true },
  enabled: { type: Boolean, default: true },
  source: {
    type: String,
    enum: ['stat_field', 'fee_plan', 'rate', 'fixed'],
    required: true,
  },
  params: {
    field: { type: String, default: null },
    component: { type: String, default: null },
    target: { type: String, enum: ['ggr', 'turnover', null], default: null },
    rate: { type: Number, default: null, min: 0, max: 1 },
    amount: { type: Number, default: null, min: 0 },
    period: { type: String, enum: ['day', 'period', 'per_chargeback', null], default: 'day' },
  },
}, { _id: false });

const ngrDefinitionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  version: { type: Number, required: true, default: 1, min: 1 },
  description: { type: String, default: null },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'active',
    index: true,
  },
  ggrComponents: {
    type: [{ type: String, enum: ['casino', 'sports'] }],
    default: () => ['casino', 'sports'],
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length > 0,
      message: 'At least one GGR component must be selected',
    },
  },
  ggrAlreadyNetOf: {
    type: [{ type: String, enum: ['bonus', 'provider_fee', 'tax', 'chargeback', 'other'] }],
    default: () => [],
  },
  items: {
    type: [deductionItemSchema],
    default: () => [],
  },
  createdBy: { type: ObjectId, ref: 'StaffAccount', required: true },
  updatedBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  legalRetentionUntil: {
    type: Date,
    default: () => new Date(Date.now() + RETENTION_MS),
  },
}, { timestamps: true });

ngrDefinitionSchema.index({ name: 1, version: 1 }, { unique: true });

export { STAT_FIELD_CATEGORY };

// Pre-save validation: No double deduction rules
// K28: the same cost is never deducted twice (rules shared with the calculator).
ngrDefinitionSchema.pre('validate', function (next) {
  const broken = findNgrRuleViolation(this);
  if (!broken) return next();
  const err = new Error(broken.message);
  err.code = broken.code;
  err.status = 400;
  return next(err);
});

export default mongoose.models.NgrDefinition || mongoose.model('NgrDefinition', ngrDefinitionSchema);
