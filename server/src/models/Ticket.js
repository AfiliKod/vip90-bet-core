import mongoose from 'mongoose';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';
import { defineTenantModel } from '../tenancy/models.js';

const messageSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderRole: { type: String, enum: ['player', 'admin'], required: true },
  text:       { type: String, required: true },
}, { timestamps: true });

const schema = new mongoose.Schema({
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject:    { type: String, required: true },
  status:     { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' },
  messages:   [messageSchema],
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isSeed: { type: Boolean, default: false, index: true },
}, { timestamps: true });

schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

registerTenantIndexes('Ticket', [
  { keys: { tenantId: 1, userId: 1, createdAt: -1 }, options: { name: 'tenant_userId_createdAt' } },
  { keys: { tenantId: 1, status: 1, createdAt: -1 }, options: { name: 'tenant_status_createdAt' } },
]);

export default defineTenantModel('Ticket', schema);
