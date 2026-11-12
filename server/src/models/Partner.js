import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

export const PARTNER_CAPABILITIES = Object.freeze([
  'metrics.read',
  'staff.manage',
  'tenants.create',
  'tenants.config:write',
  'tenants.domains:write',
  'tenants.staff:write',
  'tenants.status:write',
  'tenants.integrations:write',
  'partner:grants:use',
]);

const partnerSchema = new mongoose.Schema({
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
    enum: ['active', 'suspended', 'closed'],
    default: 'active',
    index: true,
  },
  contact: {
    name:  { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
  },
  // K27 defaults: metrics.read, staff.manage
  capabilities: {
    type: [String],
    default: () => ['metrics.read', 'staff.manage'],
    validate: {
      validator: (arr) => arr.every((cap) => PARTNER_CAPABILITIES.includes(cap)),
      message: 'Invalid partner capability',
    },
  },
  provisioningLimits: {
    maxTenants:         { type: Number, default: 1, min: 1 },
    allowedModules:     { type: [String], default: () => [] },
    entitlementCeiling: { type: Mixed, default: () => ({}) },
  },
  // K20/K21 Commercial terms configuration
  defaultCommercialTerms: {
    model:                 { type: String, enum: ['revshare_ggr', 'revshare_ngr', 'turnover', 'fixed'], default: 'revshare_ggr' },
    base:                  { type: String, enum: ['ggr', 'ngr', 'turnover', 'fixed'], default: 'ggr' },
    rate:                  { type: Number, default: 0.15 },
    currency:              { type: String, default: 'TRY' },
    minimumFee:            { type: Number, default: 0 },
    ngrDefinitionId:       { type: ObjectId, ref: 'NgrDefinition', default: null },
    ngrDefinitionVersion:  { type: Number, default: null },
    negativeBaseHandling:  { type: String, enum: ['zero_floor', 'deduct'], default: 'zero_floor' },
    negativeGgrHandling:   { type: String, enum: ['zero_floor', 'deduct'], default: 'zero_floor' },
  },
  commercialTerms: {
    model:                 { type: String, enum: ['revshare_ggr', 'revshare_ngr', 'turnover', 'fixed'], default: 'revshare_ggr' },
    base:                  { type: String, enum: ['ggr', 'ngr', 'turnover', 'fixed'], default: 'ggr' },
    rate:                  { type: Number, default: 0.15 },
    currency:              { type: String, default: 'TRY' },
    minimumFee:            { type: Number, default: 0 },
    ngrDefinitionId:       { type: ObjectId, ref: 'NgrDefinition', default: null },
    ngrDefinitionVersion:  { type: Number, default: null },
    negativeBaseHandling:  { type: String, enum: ['zero_floor', 'deduct'], default: 'zero_floor' },
    negativeGgrHandling:   { type: String, enum: ['zero_floor', 'deduct'], default: 'zero_floor' },
  },
  createdBy: { type: ObjectId, ref: 'StaffAccount', required: true },
}, { timestamps: true });

export default mongoose.models.Partner || mongoose.model('Partner', partnerSchema);