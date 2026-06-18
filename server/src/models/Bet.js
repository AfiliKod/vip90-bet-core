import mongoose from 'mongoose';

const selectionSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  marketType: String, oddId: String, oddLabel: String, oddValue: Number,
  eventLabel: String,
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

export default mongoose.model('Bet', schema);
