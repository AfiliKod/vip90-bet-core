import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bettorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  level: { type: Number, enum: [1, 2, 3], required: true }, // 1 = direct, 2 = level 2, 3 = level 3
  houseProfit: { type: Number, required: true, min: 0 },
  commissionAmount: { type: Number, required: true, min: 0 },
  commissionRate: { type: Number, required: true }, // percentage
  currency: { type: String, default: 'TRY', uppercase: true, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  // Source of the commission
  source: { type: String, enum: ['sports', 'casino', 'igames'], required: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, default: null }, // Bet or CasinoRound
  // Admin approval
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  // Transaction link (when approved)
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  isSeed: { type: Boolean, default: false, index: true },
}, { timestamps: true });

schema.index({ referrerId: 1, status: 1, createdAt: -1 });
schema.index({ bettorId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

registerTenantIndexes('ReferralCommission', [
  { keys: { tenantId: 1, referrerId: 1, status: 1, createdAt: -1 }, options: { name: 'tenant_referrerId_status_createdAt' } },
  { keys: { tenantId: 1, bettorId: 1, createdAt: -1 }, options: { name: 'tenant_bettorId_createdAt' } },
  { keys: { tenantId: 1, status: 1, createdAt: -1 }, options: { name: 'tenant_status_createdAt' } },
]);

export default defineTenantModel('ReferralCommission', schema);