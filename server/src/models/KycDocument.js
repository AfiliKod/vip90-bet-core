import mongoose from 'mongoose';
import { registerTenantIndexes } from '../tenancy/indexRegistry.js';
import { defineTenantModel } from '../tenancy/models.js';

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false, index: true, immutable: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Document types
  documentType: { 
    type: String, 
    enum: ['identity_card', 'passport', 'drivers_license', 'utility_bill', 'bank_statement', 'selfie_with_id'],
    required: true 
  },
  // File info
  fileName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  mimeType: { type: String, required: true },
  // Dosya, kimlik doğrulamalı GET /api/kyc/documents/:id ile sunulur; storageKey
  // KYC_UPLOAD_DIR altındaki dosya adıdır. fileUrl yalnız eski kayıtlar içindir.
  fileUrl: { type: String, default: null },
  storageKey: { type: String, default: null },
  // Verification status
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  // Admin review
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  // Metadata
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  isSeed: { type: Boolean, default: false, index: true },
}, { timestamps: true });

schema.index({ userId: 1, documentType: 1 });
schema.index({ userId: 1, status: 1 });
schema.index({ status: 1, createdAt: -1 });

registerTenantIndexes('KycDocument', [
  { keys: { tenantId: 1, userId: 1, documentType: 1 }, options: { name: 'tenant_userId_documentType' } },
  { keys: { tenantId: 1, userId: 1, status: 1 }, options: { name: 'tenant_userId_status' } },
  { keys: { tenantId: 1, status: 1, createdAt: -1 }, options: { name: 'tenant_status_createdAt' } },
]);

export default defineTenantModel('KycDocument', schema);
