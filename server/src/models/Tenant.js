import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

/**
 * Platform model: one document per tenant (spec §4.3.2).
 * Never apply the `tenantScoped` plugin to this model.
 */
const tenantSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9][a-z0-9-]{1,39}$/,
  },
  name: { type: String, required: true, trim: true },
  legalEntity: {
    name:           { type: String, default: null },
    registrationNo: { type: String, default: null },
    address:        { type: String, default: null },
  },
  status: {
    type: String,
    enum: ['provisioning', 'active', 'suspended', 'closed'],
    default: 'provisioning',
  },
  isDefault: { type: Boolean, default: false },
  ownership: { type: String, enum: ['direct', 'partner'], default: 'direct' },
  // No default on purpose: the unique index is sparse, so absent values must stay absent.
  providerOperatorId: { type: ObjectId },
  entitlements: {
    modules: { type: [String], default: () => [] },
    limits:  { type: Mixed, default: () => ({}) },
  },
  timezone:      { type: String, default: null },
  defaultLocale: { type: String, default: null },
  baseCurrency:  { type: String, default: null },
  jurisdictionIds: [{ type: ObjectId, ref: 'Jurisdiction' }],
  // No ref yet: StaffAccount arrives in İP-3.
  createdBy: { type: ObjectId, default: null },
  createdVia: { type: String, enum: ['platform', 'partner'], default: 'platform' },
  closedAt: { type: Date, default: null },
}, { timestamps: true });

// At most one default tenant.
tenantSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });
tenantSchema.index({ providerOperatorId: 1 }, { unique: true, sparse: true });

export default mongoose.model('Tenant', tenantSchema);
