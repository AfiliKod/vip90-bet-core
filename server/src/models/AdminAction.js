import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const schema = new mongoose.Schema({
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, default: null, index: true, immutable: true },
  actorScope: { type: String, enum: ['platform', 'partner', 'tenant'], default: 'tenant' },
  onBehalfOfTenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  actorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  actorUsername: { type: String, required: true },
  action:     { type: String, required: true, index: true },
  resource:   { type: String, default: null }, // user, bet, event, bank_request, igames, promotion
  resourceId: { type: String, default: null },
  before:     { type: mongoose.Schema.Types.Mixed, default: null },
  after:      { type: mongoose.Schema.Types.Mixed, default: null },
  ip:         { type: String, default: null },
  userAgent:  { type: String, default: null },
  success:    { type: Boolean, default: true },
  note:       { type: String, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false } });

// Indexes
schema.index({ actorId: 1, createdAt: -1 });
schema.index({ resource: 1, resourceId: 1 });
schema.index({ action: 1, createdAt: -1 });
schema.index({ createdAt: -1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 }); // 1 yıl TTL

registerTenantIndexes('AdminAction', [
  { keys: { tenantId: 1, createdAt: -1 }, options: { name: 'tenant_createdAt' } },
]);

export default defineTenantModel('AdminAction', schema);