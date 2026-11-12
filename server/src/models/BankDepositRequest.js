import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const schema = new mongoose.Schema({
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:       { type: String, enum: ['deposit', 'withdraw'], required: true },
  amount:     { type: Number, required: true },
  currency:   { type: String, default: 'TRY', uppercase: true, trim: true },
  status:     { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminNote:  { type: String, default: '' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  isSeed: { type: Boolean, default: false, index: true },
}, { timestamps: true });

schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

registerTenantIndexes('BankDepositRequest', [
  { keys: { tenantId: 1, userId: 1, createdAt: -1 }, options: { name: 'tenant_userId_createdAt' } },
  { keys: { tenantId: 1, status: 1, createdAt: -1 }, options: { name: 'tenant_status_createdAt' } },
]);

export default defineTenantModel('BankDepositRequest', schema);
