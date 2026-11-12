import mongoose from 'mongoose';

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
    period: { type: String, enum: ['day', 'period', null], default: 'day' },
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

/** The cost category each TenantDailyStat field represents. */
export const STAT_FIELD_CATEGORY = Object.freeze({
  bonusCost: 'bonus',
  providerFees: 'provider_fee',
  chargebacks: 'chargeback',
});

// Pre-save validation: No double deduction rules
ngrDefinitionSchema.pre('validate', function (next) {
  const enabledItems = (this.items || []).filter((item) => item.enabled);

  // 1. At most one item per category, unless category is 'other' with distinct labels
  const categoriesSeen = new Set();
  const otherLabelsSeen = new Set();

  for (const item of enabledItems) {
    if (item.category === 'other') {
      const normalizedLabel = (item.label || '').trim().toLowerCase();
      if (otherLabelsSeen.has(normalizedLabel)) {
        const err = new Error(`Duplicate label "${item.label}" in category "other" is not allowed.`);
        err.code = 'ERR_NGR_DUPLICATE_LABEL';
        return next(err);
      }
      otherLabelsSeen.add(normalizedLabel);
    } else {
      if (categoriesSeen.has(item.category)) {
        const err = new Error(`Category "${item.category}" cannot be deducted more than once.`);
        err.code = 'ERR_NGR_DUPLICATE_CATEGORY';
        return next(err);
      }
      categoriesSeen.add(item.category);
    }
  }

  // 2. Source key uniqueness
  const sourcesSeen = new Set();
  for (const item of enabledItems) {
    let sourceKey = null;
    if (item.source === 'stat_field' && item.params?.field) {
      sourceKey = `stat_field:${item.params.field}`;
    } else if (item.source === 'fee_plan' && item.params?.component) {
      sourceKey = `fee_plan:${item.params.component}`;
    }
    // 'rate' and 'fixed' items compute a new amount (e.g. tax 15% of GGR and a
    // provider fee 10% of GGR are two different costs); double deduction of
    // those is prevented by the one-item-per-category rule above.

    if (sourceKey) {
      if (sourcesSeen.has(sourceKey)) {
        const err = new Error(`Source "${sourceKey}" is referenced by multiple deduction items.`);
        err.code = 'ERR_NGR_DUPLICATE_SOURCE';
        return next(err);
      }
      sourcesSeen.add(sourceKey);
    }
  }

  // 3. Deduction cannot target category already in ggrAlreadyNetOf. A stat
  // field carries its own category, so an 'other' item reading bonusCost is
  // still a bonus deduction.
  const alreadyNetOf = new Set(this.ggrAlreadyNetOf || []);
  for (const item of enabledItems) {
    const impliedCategory = item.source === 'stat_field' ? STAT_FIELD_CATEGORY[item.params?.field] : null;
    if (alreadyNetOf.has(item.category) || (impliedCategory && alreadyNetOf.has(impliedCategory))) {
      const err = new Error(`Category "${item.category}" is already net in GGR and cannot be deducted again.`);
      err.code = 'ERR_NGR_ALREADY_NET_OF';
      return next(err);
    }
  }

  next();
});

export default mongoose.models.NgrDefinition || mongoose.model('NgrDefinition', ngrDefinitionSchema);
