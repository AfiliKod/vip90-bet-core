import mongoose from 'mongoose';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';
import { defineTenantModel } from '../tenancy/models.js';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  // Room info
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, default: '' },
  icon: { type: String, default: '💬' },
  color: { type: String, default: '#7c3aed' },
  
  // Room settings
  isPublic: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  minLevel: { type: Number, default: 0 }, // Minimum VIP level to join
  maxUsers: { type: Number, default: 0 }, // 0 = unlimited
  slowMode: { type: Number, default: 0 }, // seconds between messages per user
  
  // Moderation
  bannedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  mutedUsers: [{ 
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    until: { type: Date },
    reason: { type: String },
  }],
  
  // Rain (yağmur dağıtımı) settings
  rainEnabled: { type: Boolean, default: true },
  rainMinAmount: { type: Number, default: 1 },
  rainMaxAmount: { type: Number, default: 100 },
  rainCooldown: { type: Number, default: 300 }, // seconds between rains
  rainMinUsers: { type: Number, default: 3 }, // minimum active users for rain
  
  // Stats
  stats: {
    totalMessages: { type: Number, default: 0 },
    totalUsers: { type: Number, default: 0 },
    totalRainAmount: { type: Number, default: 0 },
    totalRainCount: { type: Number, default: 0 },
  },
  
  // Metadata
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

schema.index({ isActive: 1, isPublic: 1 });

registerTenantIndexes('ChatRoom', [
  { keys: { tenantId: 1, name: 1 }, options: { name: 'tenant_name_uniq', unique: true } },
  { keys: { tenantId: 1, slug: 1 }, options: { name: 'tenant_slug_uniq', unique: true } },
  { keys: { tenantId: 1, isActive: 1, isPublic: 1 }, options: { name: 'tenant_isActive_isPublic' } },
]);

export default defineTenantModel('ChatRoom', schema);
