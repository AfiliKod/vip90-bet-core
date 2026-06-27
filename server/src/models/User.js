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
  cryptoDepositIndex: { type: Number, default: null },  // HD wallet index (atandıktan sonra değişmez)
  deletedAt:   { type: Date, default: null },
}, { timestamps: true });

schema.pre('save', async function() {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
});

schema.methods.comparePassword = function(p) { return bcrypt.compare(p, this.password); };

schema.methods.toSafeObject = function() {
  const o = this.toObject(); delete o.password; return o;
};

export default mongoose.model('User', schema);
