import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  type:        { type: String, enum: ['welcome','freeBet','reload'], required: true },
  title:       { type: String, required: true },
  description: String,
  amount:      { type: Number, required: true },
  minOdds:     { type: Number, default: 1.5 },
  wagering:    { type: Number, default: 5 },
  expiresAt:   Date,
  isActive:    { type: Boolean, default: true },
  claimedBy:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

export default mongoose.model('Promotion', schema);
