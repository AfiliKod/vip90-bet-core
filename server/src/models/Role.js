import mongoose from 'mongoose';
import { getTenancyMode } from '../config/tenancy.js';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Platform model: Scoped Role definitions (spec §4.3.8).
 * Scopes: 'platform', 'partner', 'tenant'.
 * System templates use scopeId: null.
 *
 * Never apply the `tenantScoped` plugin to this model.
 */
const schema = new mongoose.Schema({
  // Role name (e.g., 'super_admin', 'support', 'finance', 'casino_manager')
  // Globally unique in single mode exactly as before (spec §6.3: legacy unique
  // indexes stay); multi mode relies on the scoped compound index below.
  name: { type: String, required: true, unique: getTenancyMode() !== 'multi' },
  // Display name
  displayName: { type: String, required: true },
  // Description
  description: { type: String, default: '' },
  // Permissions assigned to this role
  permissions: [{ type: ObjectId, ref: 'Permission' }],
  // Is this a system role (cannot be deleted)
  isSystem: { type: Boolean, default: false },
  // Priority for inheritance (higher = more permissions)
  priority: { type: Number, default: 0 },
  // Scope type: 'platform' | 'partner' | 'tenant'
  scopeType: {
    type: String,
    enum: ['platform', 'partner', 'tenant'],
    required: true,
    default: 'tenant',
    index: true,
  },
  // Scope ID: null for platform or system templates, partnerId or tenantId otherwise
  scopeId: {
    type: ObjectId,
    default: null,
    index: true,
  },
}, { timestamps: true });

schema.index({ scopeType: 1, scopeId: 1, name: 1 }, { unique: true });

export default mongoose.models.Role || mongoose.model('Role', schema);
