import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  // Agent's own players
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Commission settings
  commissionRate: { type: Number, default: 10, min: 0, max: 50 }, // % from player losses
  // Balance for transfers
  balance: { type: Number, default: 0, min: 0 },
  // Status
  isActive: { type: Boolean, default: true },
  // Metadata
  registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin who created
  notes: { type: String, default: '' },
}, { timestamps: true });

schema.index({ userId: 1 }, { unique: true });
schema.index({ isActive: 1 });

export default mongoose.model('Agent', schema);