import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  type:       { type: String, default: 'broken_game' },
  gameId:     { type: String, required: true },
  gameTitle:  { type: String, default: '' },
  provider:   { type: String, default: '' },
  status:     { type: String, enum: ['pending', 'resolved', 'ignored'], default: 'pending' },
  notes:      { type: String, default: '' },
  detectedAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model('GameTask', schema);
