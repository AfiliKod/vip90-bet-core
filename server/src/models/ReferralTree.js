import mongoose from 'mongoose';

const schema = new mongoose.Schema({
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

export default mongoose.model('ReferralTree', schema);