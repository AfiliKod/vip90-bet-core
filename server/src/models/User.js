import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const schema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, minlength: 3 },
  email:    { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['user','admin'], default: 'user' },
  // ─── Role-based access (O4) ──────────────────────────────────────
  roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }], // additional roles beyond base role
  // V1 — sınırlı demo yönetici: role=admin kalır, yıkıcı işlemler
  // middleware/demoAdmin.js blockDemoAdmin ile engellenir.
  isDemoAdmin: { type: Boolean, default: false },
  balance:  { type: Number, default: 0, min: 0 },
  bonusBalance: { type: Number, default: 0, min: 0 },
  // ─── Model B (Kilitli Bakiye) tek seferlik migration marker ───────
  // migrate-bonus-to-balance.mjs --commit çalıştıktan sonra set edilir.
  // İn-memory Set process yeniden başlatıldığında sıfırlandığı için,
  // çift-kredi'ye karşı asıl (kalıcı) koruma budur (bkz. #17 final review Finding 2).
  bonusModelBMigratedAt: { type: Date, default: null },
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
  // ─── KYC (O5) ──────────────────────────────────────────────────────
  kycStatus: { type: String, enum: ['not_started', 'pending', 'under_review', 'approved', 'rejected', 'expired'], default: 'not_started' },
  kycSubmittedAt: { type: Date, default: null },
  kycApprovedAt: { type: Date, default: null },
  kycRejectedAt: { type: Date, default: null },
  kycRejectionReason: { type: String, default: '' },
  kycRequiredFor: [{ type: String }], // pages/features requiring KYC (withdrawal, high_stakes, etc.)
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
  // ─── VIP / XP (O1) ────────────────────────────────────────────────
  vipLevel: { type: mongoose.Schema.Types.ObjectId, ref: 'VipLevel', default: null },
  vipXp: { type: Number, default: 0, min: 0 },
  totalXpEarned: { type: Number, default: 0, min: 0 }, // lifetime XP for leaderboards
  // ─── Agent (O3) ──────────────────────────────────────────────────
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null }, // which agent owns this player
  isAgent: { type: Boolean, default: false }, // is this user an agent?
  // ─── Web3 / Wallet (P6) ──────────────────────────────────────────
  walletAddress: { type: String }, // EVM wallet address (lowercase) - no default, undefined when not set
  walletType: { type: String, enum: ['metamask', 'walletconnect', 'coinbase', 'injected', 'unknown'], default: null },
  walletConnectedAt: { type: Date, default: null },
  walletChainId: { type: Number, default: null }, // EVM chain ID (1=Ethereum, 56=BSC, 137=Polygon, etc.)
  // ─── Social Login (P5) ───────────────────────────────────────────
  googleId: { type: String, sparse: true, unique: true },
  googleEmail: { type: String },
  googleName: { type: String },
  googlePicture: { type: String },
  telegramId: { type: String, sparse: true, unique: true },
  telegramUsername: { type: String },
  telegramFirstName: { type: String },
  telegramLastName: { type: String },
  telegramPhoto: { type: String },
  // ─── Bot oyuncular (P3) ────────────────────────────────────────────
  // Botlar gerçek User kayıtlarıdır (isBot:true) — mevcut TÜM oyun
  // route'larını (Mines/Dice/...) hiçbir değişiklik yapmadan, kendi
  // gerçek matematikleriyle kullanabilsinler diye. Ayrı bir Bot
  // koleksiyonu (önceki tasarım) User'dan kopuktu, gerçek oyun mantığını
  // ikinci kez (ve bozuk şekilde) simüle ediyordu.
  isBot: { type: Boolean, default: false, index: true },
  botProfile: {
    botType: { type: String, enum: ['casual', 'aggressive', 'conservative', 'high_roller', 'bonus_hunter'], default: 'casual' },
    behavior: {
      betIntervalMinMs: { type: Number, default: 30000 },
      betIntervalMaxMs: { type: Number, default: 120000 },
      minBetPercent: { type: Number, default: 1 },
      maxBetPercent: { type: Number, default: 5 },
      riskLevel: { type: Number, default: 50, min: 0, max: 100 },
    },
    limits: {
      maxDailyLoss: { type: Number, default: 1000 },
      maxDailyBets: { type: Number, default: 100 },
      minBalanceToPlay: { type: Number, default: 10 },
    },
    stats: {
      totalBets: { type: Number, default: 0 },
      totalWagered: { type: Number, default: 0 },
      totalWon: { type: Number, default: 0 },
      lastActiveAt: { type: Date, default: null },
      dailyBetsSince: { type: Date, default: null }, // günlük limit sayacının başlangıcı
    },
    currentState: { type: String, enum: ['idle', 'playing', 'on_break', 'stopped'], default: 'idle' },
    nextActionAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // botu oluşturan admin
    notes: { type: String, default: '' },
  },
  // ─── Favoriler / Son Oynananlar ────────────────────────────────────
  // gameId: Palace için game_code, in-house için route path (örn. /games/crash).
  favoriteGames: [{
    _id: false,
    gameId: { type: String, required: true },
    kind:   { type: String, enum: ['palace', 'inhouse'], required: true },
    addedAt: { type: Date, default: Date.now },
  }],
  // En yeni en başta, controller içinde $slice ile son 20 ile sınırlanır.
  recentlyPlayed: [{
    _id: false,
    gameId: { type: String, required: true },
    kind:   { type: String, enum: ['palace', 'inhouse'], required: true },
    playedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

schema.index({ isBot: 1, 'botProfile.currentState': 1 });
schema.index({ isBot: 1, 'botProfile.nextActionAt': 1 });

// Unique index for walletAddress (only non-null values)
schema.index({ walletAddress: 1 }, { unique: true, sparse: true });

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
