import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:          { type: String, enum: ['deposit','withdraw','bet','win','bonus','refund','admin_adjustment','crypto_deposit','crypto_withdraw'], required: true },
  amount:        { type: Number, required: true },
  balanceBefore: { type: Number, required: true },
  balanceAfter:  { type: Number, required: true },
  referenceId:   mongoose.Schema.Types.ObjectId,
  status:        { type: String, enum: ['pending','completed','failed'], default: 'completed' },
  note:          { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

export default mongoose.model('Transaction', schema);
