import mongoose from 'mongoose';

const CasinoSessionSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  palaceUserCode: { type: String, required: true, index: true },
  gameId:        { type: String, required: true },
  gameTitle:     { type: String, default: '' },
  initialBalance: { type: Number, required: true },
  transferredAt: { type: Date, required: true },
  status:        { type: String, enum: ['active', 'closed', 'reconciled'], default: 'active', index: true },
  closedAt:      { type: Date, default: null },
  finalBalance:  { type: Number, default: null },
  withdrawnAmount: { type: Number, default: null },
  closeReason:   { type: String, default: null }, // 'user' | 'timeout' | 'replaced'
}, { timestamps: { createdAt: true, updatedAt: true } });

CasinoSessionSchema.index({ userId: 1, status: 1 });
CasinoSessionSchema.index({ status: 1, transferredAt: 1 });

export default mongoose.model('CasinoSession', CasinoSessionSchema);