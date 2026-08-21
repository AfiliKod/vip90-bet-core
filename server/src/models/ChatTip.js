import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  amount: { type: Number, required: true, min: 0.01 },
  message: { type: String, maxlength: 500, default: '' },
  
  // Transaction references (double-entry for financial tracking)
  fromTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
  toTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
  
  // Status
  status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'completed' },
  
  // Message reference
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage' },
}, { timestamps: true });

schema.index({ fromUserId: 1, createdAt: -1 });
schema.index({ toUserId: 1, createdAt: -1 });
schema.index({ roomId: 1, createdAt: -1 });
schema.index({ status: 1 });

export default mongoose.model('ChatTip', schema);