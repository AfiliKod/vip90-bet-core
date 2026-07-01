import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  type:        { type: String, enum: ['welcome','freeBet','reload'], required: true },
  title:       { type: String, required: true },
  description: String,
  amount:      { type: Number, required: true },
  minOdds:     { type: Number, default: 1.5 },
  wagering:    { type: Number, default: 5 },
  wageringMultiplier: { type: Number, default: 35 }, // Bonus wagering requirement multiplier (e.g., 35x)
  deadlineDays: { type: Number, default: 30 }, // Days until bonus expires
  gameWeights: { type: mongoose.Schema.Types.Mixed, default: undefined }, // per-game wagering weights
  expiresAt:   Date,
  isActive:    { type: Boolean, default: true },
  claimedBy:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

// Indexes (Phase E1)
schema.index({ isActive: 1, claimedBy: 1 });
schema.index({ expiresAt: 1 });

export default mongoose.model('Promotion', schema);