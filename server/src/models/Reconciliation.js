import mongoose from 'mongoose';
import { defineTenantModel } from '../tenancy/models.js';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';

const reconciliationItemSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReconciliationJob', required: true },
  internalRecordId: { type: String },
  externalRecordId: { type: String },
  recordType: { type: String, enum: ['transaction', 'bet', 'deposit', 'withdrawal', 'balance', 'cryptoDeposit'], required: true },
  status: { type: String, enum: ['matched', 'missing_internally', 'missing_externally', 'amount_mismatch', 'status_mismatch', 'duplicate', 'unresolved'], default: 'unresolved' },
  internalData: { type: mongoose.Schema.Types.Mixed, default: {} },
  externalData: { type: mongoose.Schema.Types.Mixed, default: {} },
  difference: { type: mongoose.Schema.Types.Mixed, default: {} },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date },
  resolution: { type: String },
  resolutionStatus: { type: String, enum: ['resolved', 'dismissed', 'escalated'] },
  notes: { type: String, default: '' },
}, { timestamps: true });

reconciliationItemSchema.index({ jobId: 1, status: 1 });
reconciliationItemSchema.index({ recordType: 1, status: 1 });
reconciliationItemSchema.index({ internalRecordId: 1 });
reconciliationItemSchema.index({ externalRecordId: 1 });

const reconciliationJobSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  name: { type: String, required: true },
  description: { type: String },
  type: { type: String, enum: ['transaction', 'bet', 'deposit', 'withdrawal', 'balance', 'custom', 'cryptoDeposit'], required: true },
  status: { type: String, enum: ['pending', 'running', 'completed', 'failed', 'cancelled'], default: 'pending' },
  startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dateRange: {
    start: { type: Date },
    end: { type: Date },
  },
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  summary: {
    totalInternal: { type: Number, default: 0 },
    totalExternal: { type: Number, default: 0 },
    matched: { type: Number, default: 0 },
    missingInternally: { type: Number, default: 0 },
    missingExternally: { type: Number, default: 0 },
    amountMismatch: { type: Number, default: 0 },
    statusMismatch: { type: Number, default: 0 },
    duplicate: { type: Number, default: 0 },
    unresolved: { type: Number, default: 0 },
  },
  completedAt: { type: Date },
  error: { type: String },
}, { timestamps: true });

reconciliationJobSchema.index({ status: 1, createdAt: -1 });
reconciliationJobSchema.index({ type: 1, status: 1 });

registerTenantIndexes('ReconciliationJob', [
  { keys: { tenantId: 1, status: 1, createdAt: -1 }, options: { name: 'tenant_status_createdAt' } },
]);

registerTenantIndexes('ReconciliationItem', [
  { keys: { tenantId: 1, jobId: 1, status: 1 }, options: { name: 'tenant_jobId_status' } },
]);

export const ReconciliationItem = defineTenantModel('ReconciliationItem', reconciliationItemSchema);
export const ReconciliationJob = defineTenantModel('ReconciliationJob', reconciliationJobSchema);
