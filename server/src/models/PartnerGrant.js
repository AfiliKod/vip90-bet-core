import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const PARTNER_GRANT_SCOPES = Object.freeze([
  'players:read',
  'players:pii',
  'finance:read',
  'reports:raw',
  'support:write',
  'players:status:write',
  'promotions:assign',
]);

const MAX_GRANT_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days max (spec §4.3.5)

const partnerGrantSchema = new mongoose.Schema({
  partnerId: { type: ObjectId, ref: 'Partner', required: true, index: true },
  tenantId:  { type: ObjectId, ref: 'Tenant', required: true, index: true },
  scopes: {
    type: [String],
    required: true,
    validate: {
      validator: (scopes) => scopes.length > 0 && scopes.every((s) => PARTNER_GRANT_SCOPES.includes(s)),
      message: 'Invalid partner grant scope',
    },
  },
  grantedBy: { type: ObjectId, ref: 'StaffAccount', required: true },
  reason:    { type: String, required: true, trim: true },
  validFrom: { type: Date, required: true, default: Date.now },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
    validate: {
      validator: function (val) {
        if (!val) return false;
        const from = this.validFrom ? new Date(this.validFrom).getTime() : Date.now();
        return (val.getTime() - from) <= MAX_GRANT_DURATION_MS && val.getTime() > from;
      },
      message: 'Grant duration cannot exceed 90 days',
    },
  },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: ObjectId, ref: 'StaffAccount', default: null },
}, { timestamps: true });

partnerGrantSchema.virtual('status').get(function () {
  if (this.revokedAt) return 'revoked';
  if (this.expiresAt && new Date() > this.expiresAt) return 'expired';
  return 'active';
});

export default mongoose.models.PartnerGrant || mongoose.model('PartnerGrant', partnerGrantSchema);