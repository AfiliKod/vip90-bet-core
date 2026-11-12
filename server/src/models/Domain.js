import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Platform model: host name to tenant mapping (spec §4.3.3).
 * `host` is globally unique across tenants. Never apply the `tenantScoped` plugin.
 */
const domainSchema = new mongoose.Schema({
  host: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    // Bare host with optional port: no scheme, path or spaces.
    match: /^[a-z0-9.-]+(:\d{1,5})?$/,
  },
  tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true },
  brandId: { type: ObjectId, ref: 'Brand', default: null },
  isPrimary: { type: Boolean, default: false },
  purpose: { type: String, enum: ['player', 'admin', 'api'], default: 'player' },
  verifiedAt: { type: Date, default: null },
  tls: {
    status:   { type: String, enum: ['none', 'pending', 'active', 'failed'], default: 'none' },
    provider: { type: String, default: null },
  },
}, { timestamps: true });

export default mongoose.model('Domain', domainSchema);
