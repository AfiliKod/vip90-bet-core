import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const schema = new mongoose.Schema({
  tenantId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
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

registerTenantIndexes('SlikairPayment', [
  { keys: { tenantId: 1, userId: 1, createdAt: -1 }, options: { name: 'tenant_userId_createdAt' } },
  { keys: { tenantId: 1, payinId: 1 }, options: { name: 'tenant_payinId' } },
  { keys: { tenantId: 1, status: 1 }, options: { name: 'tenant_status' } },
]);

export default defineTenantModel('SlikairPayment', schema);
