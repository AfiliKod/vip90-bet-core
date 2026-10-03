import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestId:        { type: String, required: true, unique: true },
  payinId:          { type: String, default: null },
  amount:           { type: Number, required: true },
  currency:         { type: String, required: true, default: 'EUR' },
  paymentMethod:    { type: String, required: true },
  email:            { type: String, required: true },
  country:          { type: String, required: true },
  status:           { type: String, enum: ['created', 'pending', 'processing', 'succeeded', 'failed', 'refunded'], default: 'created' },
  statusCode:       { type: Number, default: null },
  reasonCode:       { type: String, default: null },
  declineReason:    { type: String, default: null },
  redirectUrl:      { type: String, default: null },
  metadata:         { type: mongoose.Schema.Types.Mixed, default: {} },
  webhookReceivedAt:{ type: Date, default: null },
  creditedAt:       { type: Date, default: null },
  isSeed:           { type: Boolean, default: false, index: true },
}, { timestamps: true });

// Indexes
schema.index({ userId: 1, createdAt: -1 });
schema.index({ payinId: 1 });
schema.index({ status: 1 });

export default mongoose.model('SlikairPayment', schema);
