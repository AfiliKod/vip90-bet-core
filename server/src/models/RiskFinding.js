import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

export const FINDING_STATUS = {
  ACTIVE: 'active',
  REVIEWED: 'reviewed',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
};

export const FINDING_SEVERITY = {
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
  category: { type: String, required: true },
  severity: { type: String, enum: Object.values(FINDING_SEVERITY), required: true },
  description: { type: String, default: '' },
  sourceEvent: { type: String, default: '' },
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'RiskRule', default: null },
  signalIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RiskSignal' }],
  status: { type: String, enum: Object.values(FINDING_STATUS), default: FINDING_STATUS.ACTIVE },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null },
  resolutionReason: { type: String, default: '' },
  reviewNote: { type: String, default: '' },
  isSeed: { type: Boolean, default: false, index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ playerId: 1, status: 1 });
schema.index({ playerId: 1, createdAt: -1 });
schema.index({ code: 1 });
schema.index({ severity: 1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ brandId: 1, jurisdictionId: 1 });

registerTenantIndexes('RiskFinding', [
  { keys: { tenantId: 1, playerId: 1, status: 1 }, options: { name: 'tenant_playerId_status' } },
]);

export default defineTenantModel('RiskFinding', schema);
