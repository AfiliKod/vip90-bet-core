import mongoose from 'mongoose';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Bet from '../models/Bet.js';
import CasinoRound from '../models/CasinoRound.js';
import TenantDailyStat from '../models/TenantDailyStat.js';
import { runAsPlatform } from '../tenancy/context.js';

const DAY_MS = 86_400_000;
const DEPOSIT_TYPES = ['deposit', 'crypto_deposit'];
const WITHDRAW_TYPES = ['withdraw', 'crypto_withdraw'];

// Recompute one tenant/day/currency row; bot, seed and demo activity is excluded (spec §4.3.6).
export async function aggregateTenantDailyStat(tenantId, dateStr, { currency = 'TRY', brandId = null } = {}) {
  const tid = new mongoose.Types.ObjectId(tenantId);
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  const end = new Date(start.getTime() + DAY_MS);

  return runAsPlatform('tenant-daily-stat-aggregation', async () => {
    const excludedUserIds = await User.find({
      tenantId: tid,
      $or: [{ isBot: true }, { isSeed: true }],
    }).distinct('_id');

    const dayMatch = {
      tenantId: tid,
      createdAt: { $gte: start, $lt: end },
      isSeed: { $ne: true },
      userId: { $nin: excludedUserIds },
    };

    const [depositRows, withdrawRows, casinoRows, sportsRows, bonusRows, chargebackRows, newPlayers] = await Promise.all([
      Transaction.aggregate([
        { $match: { ...dayMatch, type: { $in: DEPOSIT_TYPES }, status: 'completed', currency } },
        { $group: { _id: null, total: { $sum: '$amount' }, players: { $addToSet: '$userId' } } },
      ]),
      Transaction.aggregate([
        // Withdrawals are negative ledger amounts; positive rows are refunds.
        { $match: { ...dayMatch, type: { $in: WITHDRAW_TYPES }, status: 'completed', currency, amount: { $lt: 0 } } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } }, players: { $addToSet: '$userId' } } },
      ]),
      CasinoRound.aggregate([
        { $match: { ...dayMatch, currency } },
        { $group: { _id: null, turnover: { $sum: '$bet' }, ggr: { $sum: { $subtract: ['$bet', '$payout'] } }, players: { $addToSet: '$userId' } } },
      ]),
      Bet.aggregate([
        { $match: { ...dayMatch, currency, status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: null,
            turnover: { $sum: '$stake' },
            ggr: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['won', 'lost']] },
                  { $subtract: ['$stake', { $cond: [{ $eq: ['$status', 'won'] }, '$potentialWin', 0] }] },
                  0,
                ],
              },
            },
            players: { $addToSet: '$userId' },
          },
        },
      ]),
      Transaction.aggregate([
        { $match: { ...dayMatch, type: 'bonus', status: 'completed', currency } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { ...dayMatch, type: 'chargeback', status: 'completed', currency } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } }, count: { $sum: 1 } } },
      ]),
      User.countDocuments({
        tenantId: tid,
        isBot: { $ne: true },
        isSeed: { $ne: true },
        createdAt: { $gte: start, $lt: end },
      }),
    ]);

    const depositors = depositRows[0]?.players ?? [];
    const activeIds = new Set();
    for (const row of [depositRows[0], withdrawRows[0], casinoRows[0], sportsRows[0]]) {
      for (const id of row?.players ?? []) activeIds.add(String(id));
    }

    // FTD: today's depositors whose first-ever completed deposit falls on this day.
    const [ftdRow] = depositors.length === 0 ? [] : await Transaction.aggregate([
      { $match: { tenantId: tid, type: { $in: DEPOSIT_TYPES }, status: 'completed', currency, isSeed: { $ne: true }, userId: { $in: depositors } } },
      { $group: { _id: '$userId', firstAt: { $min: '$createdAt' } } },
      { $match: { firstAt: { $gte: start, $lt: end } } },
      { $count: 'count' },
    ]);

    return TenantDailyStat.findOneAndUpdate(
      { tenantId: tid, brandId, date: dateStr, currency },
      {
        $set: {
          casinoTurnover: casinoRows[0]?.turnover ?? 0,
          casinoGgr: casinoRows[0]?.ggr ?? 0,
          sportsTurnover: sportsRows[0]?.turnover ?? 0,
          sportsGgrRealized: sportsRows[0]?.ggr ?? 0,
          bonusCost: bonusRows[0]?.total ?? 0,
          chargebacks: chargebackRows[0]?.total ?? 0,
          chargebackCount: chargebackRows[0]?.count ?? 0,
          providerFees: 0, // Source documented: external game provider invoices not ingested in core database
          deposits: depositRows[0]?.total ?? 0,
          withdrawals: withdrawRows[0]?.total ?? 0,
          activePlayers: activeIds.size,
          newPlayers,
          depositors: depositors.length,
          ftd: ftdRow?.count ?? 0,
          computedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  });
}

// Partner view: explicit fields only (zero PII) and small-cell suppression below 5 active players (§4.3.6, G-6).
export async function getPartnerDailyMetrics({ tenantId, from, to }) {
  const rows = await TenantDailyStat.find({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    date: { $gte: from, $lte: to },
  }).sort({ date: 1 }).lean();

  return rows.map((row) => ({
    date: row.date,
    brandId: row.brandId,
    currency: row.currency,
    casinoTurnover: row.casinoTurnover,
    casinoGgr: row.casinoGgr,
    sportsTurnover: row.sportsTurnover,
    sportsGgrRealized: row.sportsGgrRealized,
    bonusCost: row.bonusCost,
    chargebacks: row.chargebacks ?? 0,
    chargebackCount: row.chargebackCount ?? 0,
    providerFees: row.providerFees ?? 0,
    deposits: row.deposits,
    withdrawals: row.withdrawals,
    activePlayers: row.activePlayers < 5 ? '<5' : String(row.activePlayers),
    newPlayers: row.newPlayers,
    depositors: row.depositors,
    ftd: row.ftd,
  }));
}
