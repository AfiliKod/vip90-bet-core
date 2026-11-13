import mongoose from 'mongoose';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';
import { defineTenantModel } from '../tenancy/models.js';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  type: {
    type: String,
    enum: ['deposit', 'withdraw', 'deposit_refund', 'deposit_chargeback', 'bet_placed', 'bet_settled', 'game_session', 'kyc_submitted', 'login_risk', 'risk_flag'],
    required: true,
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, required: true },
  summary: { type: String, required: true },
  amount: { type: Number, default: null },
  currency: { type: String, default: null },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  referenceModel: { type: String, default: null },
}, { timestamps: true });

schema.index({ createdAt: -1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
schema.index({ type: 1, createdAt: -1 });
schema.index({ userId: 1, status: 1, type: 1, updatedAt: -1 });

registerTenantIndexes('ActivityEvent', [
  { keys: { tenantId: 1, type: 1, createdAt: -1 }, options: { name: 'tenant_type_createdAt' } },
  { keys: { tenantId: 1, userId: 1, status: 1, type: 1, updatedAt: -1 }, options: { name: 'tenant_userId_status_type_updatedAt' } },
  { keys: { tenantId: 1, createdAt: -1 }, options: { name: 'tenant_createdAt' } },
]);

export default defineTenantModel('ActivityEvent', schema);
