import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  // Direct referrals (level 1)
  level1: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Level 2 referrals (referrals of referrals)
  level2: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Level 3 referrals
  level3: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Stats
  totalDirectReferrals: { type: Number, default: 0 },
  totalLevel2Referrals: { type: Number, default: 0 },
  totalLevel3Referrals: { type: Number, default: 0 },
  // Commission rates per level
  commissionRates: {
    level1: { type: Number, default: 10 }, // 10%
    level2: { type: Number, default: 5 },  // 5%
    level3: { type: Number, default: 2 },  // 2%
  },
}, { timestamps: true });

// Removed duplicate index - unique: true on userId already creates it

registerTenantIndexes('ReferralTree', [
  { keys: { tenantId: 1, userId: 1 }, options: { unique: true, name: 'tenant_userId_uniq' } },
]);

export default defineTenantModel('ReferralTree', schema);