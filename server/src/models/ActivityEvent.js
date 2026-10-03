import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['deposit', 'withdraw', 'bet_placed', 'bet_settled', 'game_session', 'kyc_submitted', 'login_risk', 'risk_flag'],
    required: true,
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, required: true },
  summary: { type: String, required: true },
  amount: { type: Number, default: null },
  currency: { type: String, default: null },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  referenceModel: { type: String, default: null },
}, { timestamps: true });

schema.index({ createdAt: -1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
schema.index({ type: 1, createdAt: -1 });
schema.index({ userId: 1, status: 1, type: 1, updatedAt: -1 });

export default mongoose.model('ActivityEvent', schema);
