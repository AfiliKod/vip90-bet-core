import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const schema = new mongoose.Schema({
  tenantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  type:        { type: String, enum: ['welcome','freeBet','reload','trial'], required: true },
  title:       { type: String, required: true },
  description: String,
  amount:      { type: Number, required: true },
  minOdds:     { type: Number, default: 1.5 },
  wagering:    { type: Number, default: 5 },
  wageringMultiplier: { type: Number, default: 35 }, // Bonus wagering requirement multiplier (e.g., 35x)
  deadlineDays: { type: Number, default: 30 }, // Days until bonus expires
  gameWeights: { type: mongoose.Schema.Types.Mixed, default: undefined }, // per-game wagering weights
  expiresAt:   Date,
  isActive:    { type: Boolean, default: true },
  claimedBy:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

// Indexes (Phase E1)
schema.index({ isActive: 1, claimedBy: 1 });
schema.index({ expiresAt: 1 });

registerTenantIndexes('Promotion', [
  { keys: { tenantId: 1, title: 1 }, options: { name: 'tenant_title' } },
  { keys: { tenantId: 1, isActive: 1, claimedBy: 1 }, options: { name: 'tenant_isActive_claimedBy' } },
  { keys: { tenantId: 1, expiresAt: 1 }, options: { name: 'tenant_expiresAt' } },
]);

export default defineTenantModel('Promotion', schema);
