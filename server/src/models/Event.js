import mongoose from 'mongoose';

const oddSchema = new mongoose.Schema({ id: String, label: String, value: Number, isActive: { type: Boolean, default: true } }, { _id: false });

const marketSchema = new mongoose.Schema({ type: String, label: String, odds: [oddSchema], result: String }, { _id: false });

const schema = new mongoose.Schema({
  externalId: { type: String, unique: true, sparse: true },
  oddsSourceLid: { type: String, default: null },  // kaynağın betting league id'si — per-event tam market fetch'i için
  marketCount: { type: Number, default: 0 },     // kaynaktaki benzersiz market_id sayısı (grup değil) — "147 market" rozeti için
  sport:    { type: String, required: true },
  country:  { type: String, default: '' },
  league:   { type: String, required: true },
  leagueFlag: String,
  homeTeam: { name: String, country: String },
  awayTeam: { name: String, country: String },
  startTime: { type: Date, required: true },
  status:   { type: String, enum: ['upcoming','live','finished','cancelled'], default: 'upcoming' },
  liveScore: { home: { type: Number, default: 0 }, away: { type: Number, default: 0 }, minute: { type: Number, default: 0 }, scope: { type: String, default: '' } },
  markets:  [marketSchema],
  result:   { winner: String, score: String },
  archivedAt: { type: Date, default: null },
  isSeed: { type: Boolean, default: false, index: true },
}, { timestamps: true });

// Indexes (Phase E1)
schema.index({ status: 1, startTime: 1 });
schema.index({ sport: 1, startTime: 1 });
schema.index({ archivedAt: 1 });
schema.index({ startTime: 1 });

export default mongoose.model('Event', schema);
