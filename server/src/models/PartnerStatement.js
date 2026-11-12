import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const RETENTION_MS = 5 * 365 * 24 * 60 * 60 * 1000;

const partnerStatementSchema = new mongoose.Schema({
  statementNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  partnerId: { type: ObjectId, ref: 'Partner', required: true, index: true },
  periodStart: { type: String, required: true },
  periodEnd: { type: String, required: true },
  currency: { type: String, required: true, default: 'TRY' },
  direction: {
    type: String,
    enum: ['revenue_share', 'wholesale', 'both'],
    default: 'revenue_share',
  },
  status: {
    type: String,
    enum: ['draft', 'issued', 'settled', 'voided'],
    default: 'draft',
    index: true,
  },
  grossAmount: { type: Number, default: 0 },
  adjustmentsAmount: { type: Number, default: 0 },
  netAmount: { type: Number, default: 0 },
  minimumFee: { type: Number, default: 0 },
  finalAmount: { type: Number, default: 0 },
  linesCount: { type: Number, default: 0 },
  issuedAt: { type: Date, default: null },
  issuedBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  voidReason: { type: String, default: null },
  settledAt: { type: Date, default: null },
  settledBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  createdBy: { type: ObjectId, ref: 'StaffAccount', default: null },
  metadata: { type: Mixed, default: () => ({}) },
  legalRetentionUntil: {
    type: Date,
    default: function () {
      const base = this.periodEnd ? new Date(this.periodEnd).getTime() : Date.now();
      return new Date(base + RETENTION_MS);
    },
  },
}, { timestamps: true });

partnerStatementSchema.index({ partnerId: 1, periodStart: 1, periodEnd: 1, currency: 1 });

partnerStatementSchema.pre('save', function (next) {
  if (!this.isNew && this.isModified('grossAmount')) {
    const originalStatus = this._originalStatus || this.status;
    if (originalStatus === 'issued' || originalStatus === 'settled') {
      const err = new Error('Issued statements are immutable; adjustments must be made via adjustment lines.');
      err.code = 'ERR_STATEMENT_IMMUTABLE';
      return next(err);
    }
  }
  next();
});

partnerStatementSchema.post('init', function () {
  this._originalStatus = this.status;
});

export default mongoose.models.PartnerStatement || mongoose.model('PartnerStatement', partnerStatementSchema);
