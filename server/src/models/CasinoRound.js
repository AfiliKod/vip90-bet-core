import mongoose from 'mongoose';

const CasinoRoundSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  gameId:        { type: String, required: true, index: true },
  gameTitle:     { type: String, default: '' },
  provider:      { type: String, default: '' },  // 'oddsSource' | 'palace' | 'inhouse'
  bet:           { type: Number, required: true },
  payout:        { type: Number, default: 0 },
  net:           { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter:  { type: Number, required: true },
  palaceUserCode: { type: String, default: null, index: true }, // Palace Casino user_code (for callbacks)
}, { timestamps: { createdAt: true, updatedAt: false } });

CasinoRoundSchema.index({ userId: 1, createdAt: -1 });
CasinoRoundSchema.index({ gameId: 1, createdAt: -1 });
CasinoRoundSchema.index({ createdAt: -1 });

export default mongoose.model('CasinoRound', CasinoRoundSchema);
