import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:       { type: String, enum: ['deposit', 'withdraw'], required: true },
  amount:     { type: Number, required: true },
  status:     { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminNote:  { type: String, default: '' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

export default mongoose.model('BankDepositRequest', schema);
