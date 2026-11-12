import mongoose from 'mongoose';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';
import { defineTenantModel } from '../tenancy/models.js';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  amount: { type: Number, required: true, min: 0.01 },
  message: { type: String, maxlength: 500, default: '' },
  // V8: `<fromUserId>:<client requestId>`; a retry with the same id returns this tip.
  // No default: a sparse index skips missing fields but would index every null.
  requestId: { type: String, unique: true, sparse: true },
  
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

registerTenantIndexes('ChatTip', [
  { keys: { tenantId: 1, fromUserId: 1, createdAt: -1 }, options: { name: 'tenant_fromUserId_createdAt' } },
  { keys: { tenantId: 1, toUserId: 1, createdAt: -1 }, options: { name: 'tenant_toUserId_createdAt' } },
  { keys: { tenantId: 1, roomId: 1, createdAt: -1 }, options: { name: 'tenant_roomId_createdAt' } },
]);

export default defineTenantModel('ChatTip', schema);
