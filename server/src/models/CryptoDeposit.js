import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  txHash:       { type: String, required: true, unique: true },
  fromAddress:  { type: String, default: '' },
  toAddress:    { type: String, required: true },
  usdtAmount:   { type: Number, required: true },   // 6 decimal USDT
  creditedTRY:  { type: Number, required: true },   // balance'a eklenen miktar
  status:       { type: String, enum: ['confirmed', 'credited'], default: 'confirmed' },
  creditedAt:   { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('CryptoDeposit', schema);
