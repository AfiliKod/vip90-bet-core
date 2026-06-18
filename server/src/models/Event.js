import mongoose from 'mongoose';

const oddSchema = new mongoose.Schema({ id: String, label: String, value: Number, isActive: { type: Boolean, default: true } }, { _id: false });

const marketSchema = new mongoose.Schema({ type: String, label: String, odds: [oddSchema], result: String }, { _id: false });

const schema = new mongoose.Schema({
  externalId: { type: String, unique: true, sparse: true },
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
}, { timestamps: true });

export default mongoose.model('Event', schema);
