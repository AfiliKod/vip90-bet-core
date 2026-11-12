import mongoose from 'mongoose';

// Platform model: one-time staff invitation (never tenant-scoped). Only the
// SHA-256 of the token is stored; the token itself is shown once.
const staffInviteSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffAccount', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffAccount', default: null },
}, { timestamps: true });

// Expired, unused rows are removed a day after expiry.
staffInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export default mongoose.models.StaffInvite || mongoose.model('StaffInvite', staffInviteSchema);
