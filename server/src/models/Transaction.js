import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:          { type: String, enum: ['deposit','withdraw','bet','win','bonus','refund','admin_adjustment','crypto_deposit','crypto_withdraw','casino_return','bonus_conversion','referral_commission'], required: true },
  amount:        { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter:  { type: Number, required: true },
  referenceId:   mongoose.Schema.Types.ObjectId,
  status:        { type: String, enum: ['pending','completed','failed'], default: 'completed' },
  note:          { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// Indexes (Phase E1)
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, type: 1, createdAt: -1 });
schema.index({ type: 1, status: 1, createdAt: -1 });
schema.index({ createdAt: -1 });

export default mongoose.model('Transaction', schema);
