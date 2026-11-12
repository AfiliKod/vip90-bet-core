import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  // Agent's own players
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Commission settings
  commissionRate: { type: Number, default: 10, min: 0, max: 50 }, // % from player losses
  // Balance for transfers
  balance: { type: Number, default: 0, min: 0 },
  // Status
  isActive: { type: Boolean, default: true },
  // Metadata
  registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin who created
  notes: { type: String, default: '' },
  isSeed: { type: Boolean, default: false, index: true },
}, { timestamps: true });

schema.index({ isActive: 1 });

registerTenantIndexes('Agent', [
  { keys: { tenantId: 1, userId: 1 }, options: { name: 'tenant_userId' } },
  { keys: { tenantId: 1, isActive: 1 }, options: { name: 'tenant_isActive' } },
]);

export default defineTenantModel('Agent', schema);