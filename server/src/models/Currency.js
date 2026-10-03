import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  symbol: { type: String, required: true },
  locale: { type: String, default: 'en-US' },
  
  // Exchange rate relative to base currency (TRY)
  exchangeRate: { type: Number, required: true, min: 0 },
  
  // Configuration
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  
  // Limits
  minDeposit: { type: Number, default: 0 },
  maxDeposit: { type: Number, default: Infinity },
  minWithdraw: { type: Number, default: 0 },
  maxWithdraw: { type: Number, default: Infinity },
  
  // Display
  decimalPlaces: { type: Number, default: 2 },
  thousandsSeparator: { type: String, default: '.' },
  decimalSeparator: { type: String, default: ',' },
  
  // Metadata
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// Indexes
schema.index({ code: 1 });
schema.index({ isActive: 1 });
schema.index({ isDefault: 1 });

export default mongoose.model('Currency', schema);
