import User from '../models/User.js';
import Bet from '../models/Bet.js';
import Transaction from '../models/Transaction.js';
import CasinoRound from '../models/CasinoRound.js';
import BankDepositRequest from '../models/BankDepositRequest.js';
import { getActiveCurrency } from '../currency/index.js';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/* ── Genel Özet ────────────────────────────────────────────── */
export async function getOverview(req, res, next) {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      userCount, newUsersToday, totalBets, pendingBets,
      depositTotal, withdrawTotal, casinoTotal, betTotal,
      casinoRounds, pendingDeposits, pendingWithdraws,
    ] = await Promise.all([
      User.countDocuments({ role: 'user', deletedAt: null }),
      User.countDocuments({ role: 'user', deletedAt: null, createdAt: { $gte: todayStart } }),
      Bet.countDocuments(),
      Bet.countDocuments({ status: 'pending' }),

      Transaction.aggregate([
        { $match: { type: { $in: ['deposit', 'crypto_deposit'] }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { type: { $in: ['withdraw', 'crypto_withdraw'] }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      CasinoRound.aggregate([
        { $group: { _id: null, totalBet: { $sum: '$bet' }, totalPayout: { $sum: '$payout' }, ggr: { $sum: { $multiply: ['$net', -1] } }, rounds: { $sum: 1 } } },
      ]),
      Bet.aggregate([
        { $group: { _id: null, totalStake: { $sum: '$stake' }, totalWin: { $sum: '$potentialWin' }, count: { $sum: 1 } } },
      ]),

      CasinoRound.countDocuments(),
      BankDepositRequest.countDocuments({ type: 'deposit', status: 'pending' }),
      BankDepositRequest.countDocuments({ type: 'withdraw', status: 'pending' }),
    ]);

    res.json({
      users: { total: userCount, newToday: newUsersToday },
      bets: { total: totalBets, pending: pendingBets, settled: totalBets - pendingBets },
      finance: {
        totalDeposit: depositTotal[0]?.total || 0,
        totalWithdraw: withdrawTotal[0]?.total || 0,
      },
      casino: {
        totalRounds: casinoTotal[0]?.rounds || 0,
        totalBet: casinoTotal[0]?.totalBet || 0,
        totalPayout: casinoTotal[0]?.totalPayout || 0,
        ggr: casinoTotal[0]?.ggr || 0,
      },
      sports: {
        totalStake: betTotal[0]?.totalStake || 0,
        totalWin: betTotal[0]?.totalWin || 0,
        betCount: betTotal[0]?.count || 0,
      },
      pending: { deposits: pendingDeposits, withdraws: pendingWithdraws },
    });
  } catch (e) { next(e); }
}

/* ── Kullanıcı Analitiği ───────────────────────────────────── */
export async function getUserAnalytics(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = daysAgo(days);
    const { symbol } = await getActiveCurrency();

    const [registrations, balanceBuckets, activeUsers, hourlyActivity] = await Promise.all([
      User.aggregate([
        { $match: { role: 'user', deletedAt: null, createdAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),

      User.aggregate([
        { $match: { role: 'user', deletedAt: null } },
        { $bucket: {
          groupBy: '$balance',
          boundaries: [0, 100, 500, 1000, 5000, 10000, 50000, 100000, 500000],
          default: '500000+',
          output: { count: { $sum: 1 } },
        }},
        { $addFields: {
          label: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', 0] }, then: `${symbol}0` },
                { case: { $eq: ['$_id', 100] }, then: `${symbol}1-100` },
                { case: { $eq: ['$_id', 500] }, then: `${symbol}101-500` },
                { case: { $eq: ['$_id', 1000] }, then: `${symbol}501-1,000` },
                { case: { $eq: ['$_id', 5000] }, then: `${symbol}1,001-5,000` },
                { case: { $eq: ['$_id', 10000] }, then: `${symbol}5,001-10,000` },
                { case: { $eq: ['$_id', 50000] }, then: `${symbol}10,001-50,000` },
                { case: { $eq: ['$_id', 100000] }, then: `${symbol}50,001-100,000` },
              ],
              default: `${symbol}100,000+`,
            }
          },
        }},
        { $sort: { _id: 1 } },
      ]),

      (async () => {
        const [betUsers, casinoUsers] = await Promise.all([
          Bet.distinct('userId', { createdAt: { $gte: since } }),
          CasinoRound.distinct('userId', { createdAt: { $gte: since } }),
        ]);
        const activeSet = new Set([...betUsers.map(String), ...casinoUsers.map(String)]);
        return activeSet.size;
      })(),

      CasinoRound.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 }, totalBet: { $sum: '$bet' } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({ registrations, balanceBuckets, activeUsers, hourlyActivity });
  } catch (e) { next(e); }
}

/* ── Gelir Genel Bakış (Casino + Bahis, gün bazlı, admin Dashboard
   "Revenue Overview" grafiği için) ──────────────────────────
   Bahis tarafı için daha önce hiçbir yerde günlük GERÇEKLEŞMİŞ (realize
   olmuş) GGR hesaplanmıyordu — getSportsAnalytics yalnızca bahis ANINDAKİ
   potentialWin toplamını veriyordu (hipotetik, "herkes kazansa" senaryosu).
   Burada `Bet.settledAt` (sonuçlanma tarihi) ve `status` kullanılarak
   GERÇEK kâr/zarar hesaplanıyor: kaybedilen bahiste house tüm stake'i alır,
   kazanılan bahiste house stake-potentialWin kadar (negatif de olabilir). */
export async function getRevenueOverview(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 90;
    const since = daysAgo(days);

    const [casinoDaily, sportsDaily] = await Promise.all([
      CasinoRound.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          ggr: { $sum: { $multiply: ['$net', -1] } },
        }},
      ]),
      Bet.aggregate([
        { $match: { status: { $in: ['won', 'lost'] }, settledAt: { $gte: since } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$settledAt' } },
          ggr: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, '$stake', { $subtract: ['$stake', '$potentialWin'] }] } },
        }},
      ]),
    ]);

    const casinoMap = new Map(casinoDaily.map(d => [d._id, d.ggr]));
    const sportsMap = new Map(sportsDaily.map(d => [d._id, d.ggr]));

    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = daysAgo(i).toISOString().slice(0, 10);
      const casino = casinoMap.get(key) || 0;
      const sports = sportsMap.get(key) || 0;
      series.push({ date: key, casino, sports, total: casino + sports });
    }

    res.json({ series, today: series[series.length - 1] });
  } catch (e) { next(e); }
}

/* ── Casino Oyun Analitiği ─────────────────────────────────── */
export async function getCasinoAnalytics(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = daysAgo(days);

    const [perGame, dailyTrend, providerStats] = await Promise.all([
      CasinoRound.aggregate([
        { $group: {
          _id: '$gameId',
          gameTitle: { $first: '$gameTitle' },
          provider: { $first: '$provider' },
          rounds: { $sum: 1 },
          totalBet: { $sum: '$bet' },
          totalPayout: { $sum: '$payout' },
          ggr: { $sum: { $multiply: ['$net', -1] } },
          uniquePlayers: { $addToSet: '$userId' },
          avgBet: { $avg: '$bet' },
        }},
        { $addFields: {
          uniquePlayerCount: { $size: '$uniquePlayers' },
          rtp: { $cond: [{ $gt: ['$totalBet', 0] }, { $multiply: [{ $divide: ['$totalPayout', '$totalBet'] }, 100] }, 0] },
        }},
        { $sort: { ggr: -1 } },
      ]),

      CasinoRound.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          rounds: { $sum: 1 },
          bet: { $sum: '$bet' },
          payout: { $sum: '$payout' },
          ggr: { $sum: { $multiply: ['$net', -1] } },
        }},
        { $sort: { _id: 1 } },
      ]),

      CasinoRound.aggregate([
        { $group: {
          _id: '$provider',
          rounds: { $sum: 1 },
          totalBet: { $sum: '$bet' },
          ggr: { $sum: { $multiply: ['$net', -1] } },
        }},
        { $sort: { ggr: -1 } },
      ]),
    ]);

    res.json({ perGame, dailyTrend, providerStats });
  } catch (e) { next(e); }
}

/* ── Finans Analitiği ──────────────────────────────────────── */
export async function getFinanceAnalytics(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = daysAgo(days);

    const [dailyFlow, typeBreakdown, pendingTotal] = await Promise.all([
      Transaction.aggregate([
        { $match: { createdAt: { $gte: since }, status: 'completed', type: { $in: ['deposit', 'withdraw', 'crypto_deposit', 'crypto_withdraw'] } } },
        { $group: {
          _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, type: '$type' },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        }},
        { $sort: { '_id.date': 1 } },
      ]),

      Transaction.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: '$type', total: { $sum: { $abs: '$amount' } }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),

      BankDepositRequest.aggregate([
        { $match: { status: 'pending', type: 'withdraw' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    res.json({ dailyFlow, typeBreakdown, pendingWithdrawTotal: pendingTotal[0]?.total || 0, pendingWithdrawCount: pendingTotal[0]?.count || 0 });
  } catch (e) { next(e); }
}

/* ── Spor Bahis Analitiği ──────────────────────────────────── */
export async function getSportsAnalytics(req, res, next) {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = daysAgo(days);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [dailyBets, winRate, popularSports, averageStake] = await Promise.all([
      Bet.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          totalStake: { $sum: '$stake' },
          potentialWin: { $sum: '$potentialWin' },
        }},
        { $sort: { _id: 1 } },
      ]),

      Bet.aggregate([
        { $match: { status: { $in: ['won', 'lost'] } } },
        { $group: {
          _id: null,
          won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
          wonAmount: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, '$potentialWin', 0] } },
          totalStake: { $sum: '$stake' },
        }},
      ]),

      Bet.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $unwind: '$selections' },
        { $lookup: { from: 'events', localField: 'selections.eventId', foreignField: '_id', as: 'event' } },
        { $unwind: { path: '$event', preserveNullAndEmptyArrays: true } },
        { $group: {
          _id: { $ifNull: ['$event.sport', 'Bilinmeyen'] },
          count: { $sum: 1 },
          totalStake: { $sum: '$stake' },
        }},
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),

      Bet.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          avgStake: { $avg: '$stake' },
        }},
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({ dailyBets, winRate: winRate[0] || { won: 0, lost: 0, wonAmount: 0, totalStake: 0 }, popularSports, averageStake });
  } catch (e) { next(e); }
}
