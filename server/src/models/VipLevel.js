import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  level: { type: Number, required: true, unique: true, min: 1 },
  name: { type: String, required: true },           // e.g. 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'
  xpRequired: { type: Number, required: true, min: 0 }, // XP needed to reach this level
  cashbackPercent: { type: Number, default: 0, min: 0, max: 100 }, // cashback % for this level
  rewardAmount: { type: Number, default: 0, min: 0 }, // one-time reward when reaching this level
  rewardType: { type: String, enum: ['balance', 'bonus'], default: 'balance' }, // reward type
  benefits: { type: [String], default: [] },        // additional benefits description
  color: { type: String, default: '#6b7280' },      // UI color for this level
  icon: { type: String, default: '★' },             // UI icon for this level
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

schema.index({ xpRequired: 1 });

export default mongoose.model('VipLevel', schema);