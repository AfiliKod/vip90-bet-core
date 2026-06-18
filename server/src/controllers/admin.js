import User from '../models/User.js';
import Event from '../models/Event.js';
import Bet from '../models/Bet.js';
import Transaction from '../models/Transaction.js';
import GameTask from '../models/GameTask.js';
import CasinoRound from '../models/CasinoRound.js';
import { settleEvent } from '../services/settlement.js';
import { createError } from '../middleware/error.js';

export async function getUsers(req, res, next) {
  try {
    const { search = '', status = 'all', page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [{ username: re }, { email: re }];
    }
    if (status === 'active')    { filter.isActive = true;  filter.deletedAt = null; }
    if (status === 'suspended') { filter.isActive = false; filter.deletedAt = null; }
    if (status === 'deleted')   { filter.deletedAt = { $ne: null }; }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .populate('referredBy', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    res.json({ users, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch(e) { next(e); }
}

export async function createUser(req, res, next) {
  try {
    const { username, email, password, role, referredBy } = req.validated;
    if (await User.findOne({ $or: [{ username }, { email }] }))
      throw createError(409, 'USER_EXISTS', 'Kullanıcı adı veya email zaten kullanımda');

    let referredById = null;
    if (referredBy) {
      const referrer = await User.findOne({ username: referredBy, deletedAt: null });
      if (!referrer) throw createError(400, 'REFERRER_NOT_FOUND', 'Referans kullanıcısı bulunamadı');
      referredById = referrer._id;
    }

    const user = await User.create({ username, email, password, role, referredBy: referredById });
    res.status(201).json({ user: user.toSafeObject() });
  } catch(e) { next(e); }
}

export async function deleteUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw createError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı');
    if (user.role === 'admin') throw createError(403, 'FORBIDDEN', 'Admin hesabı silinemez');
    await User.findByIdAndUpdate(req.params.id, { deletedAt: new Date(), isActive: false });
    res.json({ ok: true });
  } catch(e) { next(e); }
}

export async function updateUser(req, res, next) {
  try {
    const allowed = ['isActive', 'balance', 'role', 'kycVerified'];
    const update = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    const user = await User.findByIdAndUpdate(req.params.id, update, { new:true }).select('-password');
    if (!user) throw createError(404,'NOT_FOUND','Kullanıcı bulunamadı');
    res.json({ user });
  } catch(e) { next(e); }
}

export async function updateBalance(req, res, next) {
  try {
    const { amount, type, note } = req.validated;
    const user = await User.findById(req.params.id);
    if (!user) throw createError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı');

    const balanceBefore = user.balance;
    if (type === 'credit') {
      user.balance = balanceBefore + amount;
    } else {
      if (balanceBefore < amount) throw createError(400, 'INSUFFICIENT_BALANCE', 'Yetersiz bakiye');
      user.balance = balanceBefore - amount;
    }
    await user.save();

    const transaction = await Transaction.create({
      userId:        user._id,
      type:          'admin_adjustment',
      amount:        type === 'debit' ? -amount : amount,
      balanceBefore,
      balanceAfter:  user.balance,
      note:          note || '',
      createdBy:     req.user.id,
    });

    res.json({ user: user.toSafeObject(), transaction });
  } catch(e) { next(e); }
}

export async function getReferrals(req, res, next) {
  try {
    const referrals = await User.find({ referredBy: req.params.id, deletedAt: null })
      .select('username createdAt isActive')
      .sort({ createdAt: -1 });
    res.json({ referrals });
  } catch(e) { next(e); }
}

export async function getUserTransactions(req, res, next) {
  try {
    const transactions = await Transaction.find({ userId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('type amount balanceBefore balanceAfter note createdAt');
    res.json({ transactions });
  } catch(e) { next(e); }
}

export async function getArchivedEvents(req, res, next) {
  try {
    const { page = 1, limit = 30, search = '' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = { archivedAt: { $ne: null } };
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [
        { 'homeTeam.name': re },
        { 'awayTeam.name': re },
        { league: re },
      ];
    }
    const [events, total] = await Promise.all([
      Event.find(filter)
        .sort({ archivedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('homeTeam awayTeam league leagueFlag sport status result archivedAt startTime'),
      Event.countDocuments(filter),
    ]);
    res.json({ events, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch(e) { next(e); }
}

export async function createEvent(req, res, next) {
  try {
    const event = await Event.create(req.validated);
    res.status(201).json({ event });
  } catch(e) { next(e); }
}

export async function updateEvent(req, res, next) {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new:true });
    if (!event) throw createError(404,'NOT_FOUND','Etkinlik bulunamadı');
    // emit odds update via socket if available
    try {
      const { io } = await import('../server.js');
      io.emit('odds:update', { eventId: event._id, markets: event.markets });
    } catch {}
    res.json({ event });
  } catch(e) { next(e); }
}

export async function settle(req, res, next) {
  try {
    const { results, score } = req.validated;
    const event = await Event.findById(req.params.id);
    if (!event) throw createError(404,'NOT_FOUND','Etkinlik bulunamadı');
    if (event.status === 'finished') throw createError(409,'ALREADY_SETTLED','Etkinlik zaten sonuçlandırılmış');
    event.status = 'finished';
    event.result = { winner: results.maç_sonucu || '', score: score || '' };
    event.archivedAt = new Date();
    for (const market of event.markets) {
      if (results[market.type]) market.result = results[market.type];
    }
    await event.save();
    const eventTitle = `${event.homeTeam.name} vs ${event.awayTeam.name}`;
    await settleEvent(event._id, results, eventTitle);
    res.json({ message:'Etkinlik sonuçlandırıldı' });
  } catch(e) { next(e); }
}

export async function getStats(req, res, next) {
  try {
    const [userCount, totalBets, pendingBets, depositSum] = await Promise.all([
      User.countDocuments({ role:'user' }),
      Bet.countDocuments(),
      Bet.countDocuments({ status:'pending' }),
      Transaction.aggregate([{ $match:{ type:'deposit' } }, { $group:{ _id:null, total:{ $sum:'$amount' } } }]),
    ]);
    res.json({ userCount, totalBets, pendingBets, totalDeposit: depositSum[0]?.total || 0 });
  } catch(e) { next(e); }
}

export async function getTasks(req, res, next) {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const tasks = await GameTask.find(filter).sort({ detectedAt: -1 }).limit(200);
    res.json({ tasks });
  } catch(e) { next(e); }
}

export async function updateTask(req, res, next) {
  try {
    const { status, notes } = req.body;
    const update = {};
    if (status) update.status = status;
    if (notes !== undefined) update.notes = notes;
    const task = await GameTask.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!task) return res.status(404).json({ error: 'Not found' });
    res.json({ task });
  } catch(e) { next(e); }
}

// ── Casino Analytics ──────────────────────────────────────────────────────────

export async function getCasinoStats(req, res, next) {
  try {
    const now = new Date();
    const day7ago = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [overview, topGames, topUsers, daily] = await Promise.all([
      CasinoRound.aggregate([
        { $group: {
          _id: null,
          totalRounds: { $sum: 1 },
          totalBet:    { $sum: '$bet' },
          totalPayout: { $sum: '$payout' },
          totalNet:    { $sum: { $multiply: ['$net', -1] } },
          uniqueUsers: { $addToSet: '$userId' },
        }},
      ]),

      CasinoRound.aggregate([
        { $group: {
          _id:       '$gameId',
          gameTitle: { $first: '$gameTitle' },
          provider:  { $first: '$provider' },
          rounds:    { $sum: 1 },
          totalBet:  { $sum: '$bet' },
          totalPayout: { $sum: '$payout' },
          ggr:       { $sum: { $multiply: ['$net', -1] } },
        }},
        { $sort: { totalBet: -1 } },
        { $limit: 10 },
      ]),

      CasinoRound.aggregate([
        { $group: {
          _id:     '$userId',
          rounds:  { $sum: 1 },
          totalBet: { $sum: '$bet' },
          totalPayout: { $sum: '$payout' },
          ggr:     { $sum: { $multiply: ['$net', -1] } },
        }},
        { $sort: { totalBet: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { rounds: 1, totalBet: 1, totalPayout: 1, ggr: 1, 'user.username': 1, 'user._id': 1 } },
      ]),

      CasinoRound.aggregate([
        { $match: { createdAt: { $gte: day7ago } } },
        { $group: {
          _id:      { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          rounds:   { $sum: 1 },
          totalBet: { $sum: '$bet' },
          ggr:      { $sum: { $multiply: ['$net', -1] } },
        }},
        { $sort: { _id: 1 } },
      ]),
    ]);

    const ov = overview[0] || { totalRounds: 0, totalBet: 0, totalPayout: 0, totalNet: 0, uniqueUsers: [] };

    res.json({
      overview: {
        totalRounds: ov.totalRounds,
        totalBet:    parseFloat((ov.totalBet || 0).toFixed(2)),
        totalPayout: parseFloat((ov.totalPayout || 0).toFixed(2)),
        ggr:         parseFloat((ov.totalNet || 0).toFixed(2)),
        uniqueUsers: ov.uniqueUsers?.length || 0,
      },
      topGames,
      topUsers,
      daily,
    });
  } catch(e) { next(e); }
}

export async function getUserCasinoRounds(req, res, next) {
  try {
    const { page = 1, limit = 30 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [rounds, total] = await Promise.all([
      CasinoRound.find({ userId: req.params.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('gameId gameTitle provider bet payout net balanceBefore balanceAfter createdAt'),
      CasinoRound.countDocuments({ userId: req.params.id }),
    ]);

    res.json({ rounds, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch(e) { next(e); }
}
