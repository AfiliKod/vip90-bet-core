import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // admin or system
  
  totalAmount: { type: Number, required: true, min: 0 },
  totalRecipients: { type: Number, default: 0 },
  amountPerUser: { type: Number, default: 0 },
  
  status: { type: String, enum: ['pending', 'distributing', 'completed', 'cancelled'], default: 'pending' },
  
  // Distribution details
  recipients: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    claimedAt: { type: Date },
  }],
  
  // Rain settings used
  settings: {
    minAmount: { type: Number },
    maxAmount: { type: Number },
    minUsers: { type: Number },
  },
  
  // Metadata
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage' }, // The rain announcement message
  completedAt: { type: Date },
  cancelledAt: { type: Date },
  cancelReason: { type: String },
}, { timestamps: true });

schema.index({ roomId: 1, status: 1 });
schema.index({ createdBy: 1, createdAt: -1 });

export default mongoose.model('ChatRain', schema);