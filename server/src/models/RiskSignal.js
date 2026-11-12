import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

export const SIGNAL_CATEGORY = {
  ACCOUNT: 'account',
  AUTHENTICATION: 'authentication',
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  FINANCIAL: 'financial',
  GAMEPLAY: 'gameplay',
  KYC: 'kyc',
  DEVICE: 'device',
};

export const SIGNAL_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
  jurisdictionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Jurisdiction', default: null },
  code: { type: String, required: true },
  category: { type: String, enum: Object.values(SIGNAL_CATEGORY), required: true },
  severity: { type: String, enum: Object.values(SIGNAL_SEVERITY), default: SIGNAL_SEVERITY.LOW },
  description: { type: String, default: '' },
  sourceEvent: { type: String, default: '' },
  eventData: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  processed: { type: Boolean, default: false },
  processedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ playerId: 1, createdAt: -1 });
schema.index({ playerId: 1, code: 1 });
schema.index({ playerId: 1, category: 1 });
schema.index({ code: 1, createdAt: -1 });
schema.index({ processed: 1, createdAt: 1 });

registerTenantIndexes('RiskSignal', [
  { keys: { tenantId: 1, playerId: 1, createdAt: -1 }, options: { name: 'tenant_playerId_createdAt' } },
]);

export default defineTenantModel('RiskSignal', schema);
