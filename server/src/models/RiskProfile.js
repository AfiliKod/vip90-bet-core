import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

export const RISK_LEVEL = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

export const RISK_STATUS = {
  CLEAR: 'CLEAR',
  REVIEW: 'REVIEW',
  RESTRICTED: 'RESTRICTED',
  BLOCKED: 'BLOCKED',
};

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
  jurisdictionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Jurisdiction', default: null },
  riskStatus: { type: String, enum: Object.values(RISK_STATUS), default: RISK_STATUS.CLEAR },
  riskScore: { type: Number, default: 0, min: 0, max: 100 },
  riskLevel: { type: String, enum: Object.values(RISK_LEVEL), default: RISK_LEVEL.LOW },
  activeFlags: [{ type: String }],
  reviewRequired: { type: Boolean, default: false },
  lastEvaluatedAt: { type: Date, default: null },
  evaluatedBy: { type: String, default: 'system' },
  reason: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  manualOverride: {
    enabled: { type: Boolean, default: false },
    overriddenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    overrideReason: { type: String, default: '' },
    overriddenAt: { type: Date, default: null },
  },
}, { timestamps: true });

schema.index({ riskStatus: 1 });
schema.index({ riskLevel: 1 });
schema.index({ riskScore: -1 });
schema.index({ reviewRequired: 1 });
schema.index({ brandId: 1, jurisdictionId: 1 });

registerTenantIndexes('RiskProfile', [
  { keys: { tenantId: 1, playerId: 1 }, options: { name: 'tenant_playerId_uniq', unique: true } },
  { keys: { tenantId: 1, brandId: 1 }, options: { name: 'tenant_brandId' } },
]);

export default defineTenantModel('RiskProfile', schema);
