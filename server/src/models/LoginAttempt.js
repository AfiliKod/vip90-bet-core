import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  username:  { type: String, required: true, index: true },
  ip:        { type: String, default: null },
  userAgent: { type: String, default: null },
  success:   { type: Boolean, required: true },
  failReason: { type: String, default: null }, // wrong_password, user_not_found, banned
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ userId: 1, createdAt: -1 });
schema.index({ ip: 1, createdAt: -1 });
schema.index({ username: 1, createdAt: -1 });
schema.index({ createdAt: -1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90 gün TTL

export default mongoose.model('LoginAttempt', schema);