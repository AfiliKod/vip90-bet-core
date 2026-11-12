import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const schema = new mongoose.Schema({
  tenantId:            { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
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
  // V10: refund of the debited balance when the provider confirms a failure.
  refundedAt:          { type: Date, default: null },
  refundTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  providerStatus:      { type: String, default: null },
  needsReconciliation: { type: Boolean, default: false, index: true },
  reconciliationNote:  { type: String, default: null },
  metadata:            { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

// Indexes
schema.index({ userId: 1, createdAt: -1 });
schema.index({ payoutId: 1 });
schema.index({ status: 1 });
schema.index({ merchantReference: 1 });

registerTenantIndexes('SlikairPayout', [
  { keys: { tenantId: 1, userId: 1, createdAt: -1 }, options: { name: 'tenant_userId_createdAt' } },
  { keys: { tenantId: 1, payoutId: 1 }, options: { name: 'tenant_payoutId' } },
  { keys: { tenantId: 1, status: 1 }, options: { name: 'tenant_status' } },
  { keys: { tenantId: 1, merchantReference: 1 }, options: { name: 'tenant_merchantReference' } },
]);

export default defineTenantModel('SlikairPayout', schema);
