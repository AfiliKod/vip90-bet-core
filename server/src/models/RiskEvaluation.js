import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

export const EVALUATION_DECISION = {
  ALLOW: 'ALLOW',
  REVIEW: 'REVIEW',
  RESTRICT: 'RESTRICT',
  BLOCK: 'BLOCK',
};

const findingSummarySchema = new mongoose.Schema({
  code: { type: String, required: true },
  severity: { type: String, required: true },
  category: { type: String, required: true },
  ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'RiskRule', default: null },
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
  jurisdictionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Jurisdiction', default: null },
  event: { type: String, required: true },
  context: { type: mongoose.Schema.Types.Mixed, default: {} },
  decision: { type: String, enum: Object.values(EVALUATION_DECISION), required: true },
  riskLevel: { type: String, required: true },
  score: { type: Number, required: true },
  findings: [findingSummarySchema],
  requiredAction: { type: String, default: null },
  signalsProcessed: { type: Number, default: 0 },
  rulesEvaluated: { type: Number, default: 0 },
  rulesMatched: { type: Number, default: 0 },
  evaluationDurationMs: { type: Number, default: 0 },
  evaluatedBy: { type: String, default: 'system' },
  isSeed: { type: Boolean, default: false, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

schema.index({ playerId: 1, createdAt: -1 });
schema.index({ playerId: 1, event: 1 });
schema.index({ decision: 1, createdAt: -1 });
schema.index({ brandId: 1, jurisdictionId: 1 });

registerTenantIndexes('RiskEvaluation', [
  { keys: { tenantId: 1, playerId: 1, createdAt: -1 }, options: { name: 'tenant_playerId_createdAt' } },
]);

export default defineTenantModel('RiskEvaluation', schema);
