import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Platform/partner collection (spec §2.1, §4.3.6): never tenantScoped; written only by the aggregation job.
const tenantDailyStatSchema = new mongoose.Schema({
  tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true },
  brandId: { type: ObjectId, ref: 'Brand', default: null },
  date: { type: String, required: true }, // YYYY-MM-DD
  currency: { type: String, required: true, default: 'TRY' },
  casinoTurnover: { type: Number, default: 0 },
  casinoGgr: { type: Number, default: 0 },
  sportsTurnover: { type: Number, default: 0 },
  sportsGgrRealized: { type: Number, default: 0 },
  bonusCost: { type: Number, default: 0 },
  deposits: { type: Number, default: 0 },
  withdrawals: { type: Number, default: 0 },
  activePlayers: { type: Number, default: 0 },
  newPlayers: { type: Number, default: 0 },
  depositors: { type: Number, default: 0 },
  ftd: { type: Number, default: 0 },
  computedAt: { type: Date, default: Date.now },
}, { timestamps: true });

tenantDailyStatSchema.index(
  { tenantId: 1, brandId: 1, date: 1, currency: 1 },
  { unique: true }
);

export default mongoose.model('TenantDailyStat', tenantDailyStatSchema);