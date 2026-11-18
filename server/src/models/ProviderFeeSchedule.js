import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Platform billing configuration. A null tenantId is the default contract for
// every tenant; tenant-specific schedules take precedence in the daily job.
const providerFeeScheduleSchema = new mongoose.Schema({
  tenantId: { type: ObjectId, ref: 'Tenant', default: null, index: true },
  provider: { type: String, required: true, trim: true },
  rateOfGgr: { type: Number, required: true, min: 0, max: 1 },
  // Kept with the contract for monthly invoicing; daily aggregation does not apply it.
  minimumMonthlyFee: { type: Number, default: 0, min: 0 },
  currency: { type: String, required: true, uppercase: true, trim: true },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, default: null, index: true },
  createdBy: { type: ObjectId, ref: 'StaffAccount', required: true },
  note: { type: String, default: null, trim: true },
}, { timestamps: true });

// MongoDB permits one active schedule per provider at each contract scope,
// including one platform-default schedule (tenantId: null).
providerFeeScheduleSchema.index(
  { tenantId: 1, provider: 1, validTo: 1 },
  { unique: true, partialFilterExpression: { validTo: null } },
);

providerFeeScheduleSchema.pre('validate', function validatePeriod(next) {
  if (this.validTo && this.validFrom && this.validTo < this.validFrom) {
    return next(new Error('validTo must be on or after validFrom'));
  }
  return next();
});

export default mongoose.models.ProviderFeeSchedule
  || mongoose.model('ProviderFeeSchedule', providerFeeScheduleSchema);
