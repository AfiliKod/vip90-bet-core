import mongoose from 'mongoose';

// Atomic named sequences (e.g. `cryptoDepositIndex`). Incremented with $inc only.
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { versionKey: false });

export default mongoose.models.Counter || mongoose.model('Counter', schema);
