import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, default: null, index: true, immutable: true },
  actorScope: { type: String, enum: ['platform', 'partner', 'tenant'], default: 'tenant' },
  actorStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffAccount', default: null },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
  onBehalfOfTenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  capability: { type: String, default: null },
  grantId: { type: mongoose.Schema.Types.ObjectId, ref: 'PartnerGrant', default: null },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorType: { type: String, enum: ['admin', 'player', 'system'], required: true },
  actorUsername: { type: String, required: true },
  action: { type: String, required: true },
  category: { type: String, enum: ['auth', 'player', 'finance', 'kyc', 'responsible_gaming', 'module', 'provider', 'system', 'chat', 'betting', 'casino'], required: true },
  targetType: { type: String, enum: ['user', 'transaction', 'bet', 'event', 'module', 'setting', 'role', 'permission', 'chat', 'system', 'game', 'promotion', 'vip', 'player', 'risk_rule', 'risk_finding'] },
  targetId: { type: String },
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String },
  userAgent: { type: String },
  correlationId: { type: String },
  reason: { type: String },
  success: { type: Boolean, default: true },
  errorMessage: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false } });

// Indexes
schema.index({ actorId: 1, createdAt: -1 });
schema.index({ category: 1, createdAt: -1 });
schema.index({ action: 1, createdAt: -1 });
schema.index({ targetType: 1, targetId: 1 });
schema.index({ createdAt: -1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 }); // 1 year TTL

registerTenantIndexes('AuditLog', [
  { keys: { tenantId: 1, createdAt: -1 }, options: { name: 'tenant_createdAt' } },
]);

export default defineTenantModel('AuditLog', schema);
