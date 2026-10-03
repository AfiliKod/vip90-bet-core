import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: '' },
  
  // Segment criteria
  criteria: {
    // VIP level range
    vipLevel: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
    },
    
    // Balance range
    balance: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
    },
    
    // Total wagered range
    totalWagered: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
    },
    
    // Registration date range
    registeredAt: {
      from: { type: Date, default: null },
      to: { type: Date, default: null },
    },
    
    // Last login date range
    lastLoginAt: {
      from: { type: Date, default: null },
      to: { type: Date, default: null },
    },
    
    // Country
    countries: [{ type: String }],
    
    // Game preferences
    preferredGames: [{ type: String }],
    
    // Betting behavior
    avgBetSize: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
    },
    
    // Win/loss ratio
    winLossRatio: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
    },
    
    // Activity status
    isActive: { type: Boolean, default: null },
    isBot: { type: Boolean, default: null },
    
    // Custom tags
    tags: [{ type: String }],
  },
  
  // Segment stats (computed)
  stats: {
    playerCount: { type: Number, default: 0 },
    lastComputed: { type: Date, default: null },
  },
  
  // Metadata
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Indexes
schema.index({ isActive: 1 });
schema.index({ createdAt: -1 });

export default mongoose.model('PlayerSegment', schema);
