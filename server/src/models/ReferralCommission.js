import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bettorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  level: { type: Number, enum: [1, 2, 3], required: true }, // 1 = direct, 2 = level 2, 3 = level 3
  houseProfit: { type: Number, required: true, min: 0 },
  commissionAmount: { type: Number, required: true, min: 0 },
  commissionRate: { type: Number, required: true }, // percentage
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  // Source of the commission
  source: { type: String, enum: ['sports', 'casino', 'palace'], required: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, default: null }, // Bet or CasinoRound
  // Admin approval
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  // Transaction link (when approved)
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
}, { timestamps: true });

schema.index({ referrerId: 1, status: 1, createdAt: -1 });
schema.index({ bettorId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

export default mongoose.model('ReferralCommission', schema);