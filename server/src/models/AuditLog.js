import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorType: { type: String, enum: ['admin', 'player', 'system'], required: true },
  actorUsername: { type: String, required: true },
  action: { type: String, required: true },
  category: { type: String, enum: ['auth', 'player', 'finance', 'kyc', 'responsible_gaming', 'module', 'provider', 'system', 'chat', 'betting', 'casino'], required: true },
  targetType: { type: String, enum: ['user', 'transaction', 'bet', 'event', 'module', 'setting', 'role', 'permission', 'chat', 'system', 'game', 'promotion', 'vip', 'player', 'risk_rule', 'risk_finding'] },
  targetId: { type: String },
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String },
  userAgent: { type: String },
  correlationId: { type: String },
  reason: { type: String },
  success: { type: Boolean, default: true },
  errorMessage: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false } });

// Indexes
schema.index({ actorId: 1, createdAt: -1 });
schema.index({ category: 1, createdAt: -1 });
schema.index({ action: 1, createdAt: -1 });
schema.index({ targetType: 1, targetId: 1 });
schema.index({ createdAt: -1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 }); // 1 year TTL

export default mongoose.model('AuditLog', schema);
