import mongoose from 'mongoose';

const schema = new mongoose.Schema({
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
  // Storage path/URL
  fileUrl: { type: String, required: true },
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

export default mongoose.model('KycDocument', schema);