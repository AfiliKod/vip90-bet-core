import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Platform model: time-limited audited write exception grant (spec §5.3, K23).
 * Never apply tenantScoped plugin.
 */
const platformWriteGrantSchema = new mongoose.Schema({
  staffId: { type: ObjectId, ref: 'StaffAccount', required: true, index: true },
  tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true },
  reason: { type: String, required: true, trim: true },
  expiresAt: { type: Date, required: true, index: true },
  grantedBy: { type: ObjectId, ref: 'StaffAccount', required: true },
  revokedAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'expired', 'revoked'], default: 'active' },
}, { timestamps: true });

export default mongoose.models.PlatformWriteGrant || mongoose.model('PlatformWriteGrant', platformWriteGrantSchema);
