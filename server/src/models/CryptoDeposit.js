import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const schema = new mongoose.Schema({
  tenantId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  txHash:       { type: String, required: true, unique: true },
  fromAddress:  { type: String, default: '' },
  toAddress:    { type: String, required: true },
  usdtAmount:   { type: Number, required: true },   // 6 decimal USDT
  creditedTRY:  { type: Number, required: true },   // balance'a eklenen miktar
  currency:     { type: String, default: 'TRY', uppercase: true, trim: true },
  status:       { type: String, enum: ['confirmed', 'credited', 'pending_approval', 'rejected'], default: 'confirmed' },
  creditedAt:   { type: Date, default: null },
  isSeed:       { type: Boolean, default: false, index: true },
}, { timestamps: true });

// Indexes (Phase E1)
schema.index({ userId: 1, createdAt: -1 });
schema.index({ toAddress: 1, status: 1 });
schema.index({ status: 1 });

registerTenantIndexes('CryptoDeposit', [
  { keys: { tenantId: 1, userId: 1, createdAt: -1 }, options: { name: 'tenant_userId_createdAt' } },
  { keys: { tenantId: 1, toAddress: 1, status: 1 }, options: { name: 'tenant_toAddress_status' } },
  { keys: { tenantId: 1, status: 1 }, options: { name: 'tenant_status' } },
]);

export default defineTenantModel('CryptoDeposit', schema);
