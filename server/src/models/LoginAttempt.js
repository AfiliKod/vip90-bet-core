import mongoose from 'mongoose';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';
import { defineTenantModel } from '../tenancy/models.js';

const schema = new mongoose.Schema({
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  username:  { type: String, required: true, index: true },
  ip:        { type: String, default: null },
  userAgent: { type: String, default: null },
  success:   { type: Boolean, required: true },
  failReason: { type: String, default: null }, // wrong_password, user_not_found, banned, seed_account
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ userId: 1, createdAt: -1 });
schema.index({ ip: 1, createdAt: -1 });
schema.index({ username: 1, createdAt: -1 });
schema.index({ createdAt: -1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90 gün TTL

registerTenantIndexes('LoginAttempt', [
  { keys: { tenantId: 1, username: 1, ip: 1 }, options: { name: 'tenant_username_ip' } },
  { keys: { tenantId: 1, createdAt: -1 }, options: { name: 'tenant_createdAt' } },
  { keys: { tenantId: 1, userId: 1, createdAt: -1 }, options: { name: 'tenant_userId_createdAt' } },
]);

export default defineTenantModel('LoginAttempt', schema);
