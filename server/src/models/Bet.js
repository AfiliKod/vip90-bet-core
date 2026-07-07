import mongoose from 'mongoose';

const selectionSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  marketType: String, oddId: String, oddLabel: String, oddValue: Number,
  eventLabel: String,
  outcome: { type: String, enum: ['pending','won','lost'], default: 'pending' },
}, { _id: false });

const schema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  selections:   { type: [selectionSchema], required: true },
  type:         { type: String, enum: ['single','combo'], required: true },
  stake:        { type: Number, required: true, min: 1 },
  totalOdds:    { type: Number, required: true },
  potentialWin: { type: Number, required: true },
  status:       { type: String, enum: ['pending','won','lost','cancelled'], default: 'pending' },
  settledAt:    Date,
}, { timestamps: true });

// Indexes (Phase E1)
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, status: 1, createdAt: -1 });
schema.index({ status: 1 });
schema.index({ createdAt: -1 });

export default mongoose.model('Bet', schema);
