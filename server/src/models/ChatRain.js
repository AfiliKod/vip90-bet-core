import mongoose from 'mongoose';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';
import { defineTenantModel } from '../tenancy/models.js';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // admin or system
  // V8: `<createdBy>:<client requestId>`; a retry with the same id returns this rain.
  // No default: a sparse index skips missing fields but would index every null.
  requestId: { type: String, unique: true, sparse: true },
  
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

registerTenantIndexes('ChatRain', [
  { keys: { tenantId: 1, roomId: 1, status: 1 }, options: { name: 'tenant_roomId_status' } },
  { keys: { tenantId: 1, createdBy: 1, createdAt: -1 }, options: { name: 'tenant_createdBy_createdAt' } },
]);

export default defineTenantModel('ChatRain', schema);
