import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  merchantReference:   { type: String, required: true },
  payoutId:            { type: String, default: null },
  amount:              { type: Number, required: true },
  currency:            { type: String, required: true },
  method:              { type: String, required: true },
  status:              { type: String, enum: ['created', 'processing', 'succeeded', 'failed'], default: 'created' },
  statusCode:          { type: Number, default: null },
  reasonCode:          { type: String, default: null },
  customer:            { type: mongoose.Schema.Types.Mixed, default: {} },
  paymentDetails:      { type: mongoose.Schema.Types.Mixed, default: {} },
  webhookReceivedAt:   { type: Date, default: null },
  processedAt:         { type: Date, default: null },
}, { timestamps: true });

// Indexes
schema.index({ userId: 1, createdAt: -1 });
schema.index({ payoutId: 1 });
schema.index({ status: 1 });
schema.index({ merchantReference: 1 });

export default mongoose.model('SlikairPayout', schema);
