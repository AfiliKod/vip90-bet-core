import mongoose from 'mongoose';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const partnerOperatorLinkSchema = new mongoose.Schema({
  partnerId: { type: ObjectId, ref: 'Partner', required: true, index: true },
  tenantId:  { type: ObjectId, ref: 'Tenant', required: true, index: true },
  validFrom: { type: Date, required: true, default: Date.now },
  validTo:   { type: Date, default: null, index: true },
  // Optional capability narrowing for this specific tenant (spec §4.3.4)
  capabilities: { type: [String], default: null },
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
  endedBy:   { type: ObjectId, ref: 'StaffAccount', default: null },
  endReason: { type: String, default: null },
}, { timestamps: true });

// Enforce at most one active link per operator (validTo == null)
partnerOperatorLinkSchema.index(
  { tenantId: 1, validTo: 1 },
  { unique: true, partialFilterExpression: { validTo: null } }
);

export default mongoose.models.PartnerOperatorLink || mongoose.model('PartnerOperatorLink', partnerOperatorLinkSchema);