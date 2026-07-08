import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const schema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, minlength: 3 },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['user','admin'], default: 'user' },
  balance:  { type: Number, default: 0, min: 0 },
  bonusBalance: { type: Number, default: 0, min: 0 },
  preferences: {
    avatarColor:      { type: String,   default: '#7c3aed' },
    favoriteSports:   { type: [String], default: [] },
    accentColor:      { type: String,   default: 'cyan' },
    oddsFormat:       { type: String,   default: 'decimal' },
    language:         { type: String,   default: 'tr' },
    notifyLive:       { type: Boolean,  default: true },
    notifyOddsChange: { type: Boolean,  default: false },
    defaultStake:     { type: Number,   default: 10, min: 1 },
  },
  isActive:    { type: Boolean, default: true },
  kycVerified: { type: Boolean, default: false },
  referredBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  totalReferralEarnings: { type: Number, default: 0, min: 0 },
  cryptoDepositIndex: { type: Number, default: null },  // HD wallet index (atandıktan sonra değişmez)
  palaceUserCode:    { type: String, default: null },   // Palace Casino user_code (for provider callbacks)
  deletedAt:   { type: Date, default: null },
  // ─── Legal consent records (KVKK, Terms, 18+) ────────────────────
  acceptedTermsAt:  { type: Date, default: null },
  acceptedKvkkAt:   { type: Date, default: null },
  ageConfirmedAt:   { type: Date, default: null },
  consentVersion:   { type: String, default: null },
  // ─── Login tracking (Phase C5) ───────────────────────────────────
  lastLoginAt:      { type: Date, default: null },
  lastLoginIp:      { type: String, default: null },
  // ─── Token version (Phase B9 — JWT rotation) ──────────────────────
  tokenVersion:     { type: Number, default: 0 },
  // ─── Email verification (Phase D1) ────────────────────────────────
  emailVerified:    { type: Boolean, default: false },
  emailVerificationToken:  { type: String, default: null },
  emailVerificationExpires: { type: Date, default: null },
  // ─── Password reset (Phase D2) ────────────────────────────────────
  passwordResetToken:    { type: String, default: null },
  passwordResetExpires:  { type: Date, default: null },
  // ─── Responsible gambling limits (Phase D4) ───────────────────────
  responsibleLimits: {
    depositDaily:     { type: Number, default: null },
    depositWeekly:    { type: Number, default: null },
    depositMonthly:   { type: Number, default: null },
    sessionTimeoutMin: { type: Number, default: null },
    selfExclusionUntil: { type: Date, default: null },
  },
  // ─── 18+ age gate (Phase D3) ──────────────────────────────────────
  dateOfBirth:      { type: Date, default: null },
  ageVerifiedAt:    { type: Date, default: null },
  // ─── Account deletion grace (Phase D5 — KVKK md.11) ───────────────
  deletionRequestedAt: { type: Date, default: null },
  scheduledDeletionAt: { type: Date, default: null },
  // ─── Withdrawal cooldown (Phase B17) ──────────────────────────────
  passwordChangedAt: { type: Date, default: null },
  withdrawalLockUntil: { type: Date, default: null },
  // ─── 2FA / TOTP (Phase B6) ────────────────────────────────────────
  twoFactorEnabled:    { type: Boolean, default: false },
  twoFactorSecret:     { type: String, default: null },
  twoFactorBackupCodes: { type: [String], default: [] },
  twoFactorVerifiedAt: { type: Date, default: null },
}, { timestamps: true });

// Indexes (Phase E1)
schema.index({ palaceUserCode: 1 }, { sparse: true });
schema.index({ deletedAt: 1 }, { sparse: true });
schema.index({ cryptoDepositIndex: 1 }, { sparse: true });
schema.index({ lastLoginAt: -1 });

schema.pre('save', async function() {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
});

schema.methods.comparePassword = function(p) { return bcrypt.compare(p, this.password); };

schema.methods.toSafeObject = function() {
  const o = this.toObject(); delete o.password; return o;
};

export default mongoose.model('User', schema);
