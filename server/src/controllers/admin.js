import mongoose from 'mongoose';
import User from '../models/User.js';
import Event from '../models/Event.js';
import Bet from '../models/Bet.js';
import Transaction from '../models/Transaction.js';
import BonusWagering from '../models/BonusWagering.js';
import GameTask from '../models/GameTask.js';
import CasinoRound from '../models/CasinoRound.js';
import CasinoSession from '../models/CasinoSession.js';
import { settleEvent } from '../services/settlement.js';
import { createError } from '../middleware/error.js';
import { errorLogger } from '../services/errorLogger.js';
import Setting from '../models/Setting.js';
import { ALERT_KEYS, SECRET_KEYS, maskSecret, getSetting, getSettingSource, invalidateSettings } from '../services/settings.js';
import { sendAlert } from '../services/alert.js';
import escapeStringRegexp from 'escape-string-regexp';
import { setThemeToken as setThemeTokenImpl, listThemeTokens } from '../theme/index.js';
import { THEME_PRESETS } from '../theme/presets.js';
import { setBrandingField as setBrandingFieldImpl, listBranding } from '../branding/index.js';
import { setHomeContent as setHomeContentImpl, getHomeContent } from '../pages/index.js';
import { getConfig as getFakeWinnersConfig, saveConfig as saveFakeWinnersConfig, getPoolSize as getFakeWinnersPoolSize } from '../services/fakeWinners.js';
import { getAllGameSettings, updateGameSettings as updateGameSettingsImpl } from '../services/gameSettings.js';
import { getActiveCurrency, listCurrencies, setActiveCurrency } from '../currency/index.js';
import {
  getAllRoles, getAllPermissions, createRole, updateRole, deleteRole,
  assignRoleToUser, removeRoleFromUser,
} from '../services/permissions.js';
import { getAllVipLevels, upsertVipLevel, deleteVipLevel } from '../services/vip.js';
import { getReferralTreeView } from '../services/referralTreeView.js';
import { createBot, getAllBots, getBotById, updateBot, deleteBot, getBotStats, startAllBots, stopAllBots } from '../services/bot.js';
import { listAllForAdmin as listAllStaticPagesForAdmin, upsertPage as upsertStaticPageSvc, togglePage as toggleStaticPageSvc } from '../services/staticPages.js';
import { invalidateCrashSettingsCache } from '../services/inhouse/crashGame.js';
import { invalidateRouletteSettingsCache } from '../services/inhouse/rouletteGame.js';
import {
  invalidateMinesSettingsCache, invalidateDiceSettingsCache, invalidateLimboSettingsCache,
  invalidateHiloSettingsCache, invalidateDragonTigerSettingsCache,
  invalidatePlinkoSettingsCache, invalidateWheelSettingsCache, invalidateKenoSettingsCache,
  invalidateBaccaratSettingsCache, invalidateBlackjackSettingsCache, invalidateVideoPokerSettingsCache,
} from '../routes/inhouse.js';
import { simulateBlackjackRtp, simulateVideoPokerRtp } from '../services/inhouse/rtpSimulator.js';
import { setFeaturedGameCodes as setFeaturedGameCodesImpl, getFeaturedGameCodes } from '../games/index.js';

// Phase B13 — ReDoS protection
function safeRegex(input, maxLength = 100) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().slice(0, maxLength);
  if (!trimmed) return null;
  return new RegExp(escapeStringRegexp(trimmed), 'i');
}

// ─── Standard Admin Functions ──────────────────────────────────────

export async function getUsers(req, res, next) {
  try {
    const { search = '', status = 'all', page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (search) {
      const re = safeRegex(search);
      if (re) filter.$or = [{ username: re }, { email: re }];
    }
    if (status === 'active')    { filter.isActive = true;  filter.deletedAt = null; }
    if (status === 'suspended') { filter.isActive = false; filter.deletedAt = null; }
    if (status === 'deleted')   { filter.deletedAt = { $ne: null }; }
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .populate('referredBy', 'username')
        .populate('roles', 'name displayName')
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
    const allowed = ['isActive', 'kycVerified'];
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

    if (type === 'bonus') {
      const balanceBefore = user.balance;
      user.balance = parseFloat((user.balance + amount).toFixed(2));
      await user.save();

      const wageringMultiplier = 35;
      const wageringRequired = parseFloat((amount * wageringMultiplier).toFixed(2));
      const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await BonusWagering.create({
        userId: user._id,
        source: 'admin_adjustment',
        description: note || 'Admin tarafından verilen bonus',
        bonusAmount: amount,
        wageringRequired,
        wageringProgress: 0,
        multiplier: wageringMultiplier,
        deadline,
        status: 'active',
      });

      const transaction = await Transaction.create({
        userId:        user._id,
        type:          'bonus',
        amount,
        balanceBefore,
        balanceAfter:  user.balance,
        note:          note || '',
        createdBy:     req.user.id,
      });

      // bonusBalance artık kilitli/çevrim bekleyen tutarın göstergesi (mirror).
      const { getLockedAmount } = await import('../services/wagering.js');
      user.bonusBalance = await getLockedAmount(user._id);
      await user.save();

      return res.json({ user: user.toSafeObject(), transaction });
    }

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

/** Tema editörü (A2). Görüntülenen liste — tanım + güncel değer + kaynak (db/default). */
export async function getThemeTokens(req, res, next) {
  try {
    const tokens = await listThemeTokens();
    res.json({ tokens });
  } catch (e) {
    next(e);
  }
}

/**
 * `setThemeToken` enjekte edilebilir — `theme/registry.js`/`modules/registry.js`
 * ile aynı DI deseni. Üretimde aşağıdaki `updateThemeToken` gerçek
 * implementasyonla önceden bağlanmış halde dışa aktarılır; testler kendi
 * sahte fonksiyonunu geçirir, ES module namespace'ini monkey-patch etmeye
 * gerek kalmaz.
 */
export function createUpdateThemeToken({ setThemeToken = setThemeTokenImpl } = {}) {
  return async function updateThemeToken(req, res, next) {
    try {
      const { id, value } = req.validated;
      await setThemeToken(id, value, req.user.id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  };
}

export const updateThemeToken = createUpdateThemeToken();

/** Hazır tema paketleri (A6). Liste — client swatch'ları doğrudan buradan render eder. */
export async function getThemePresets(req, res, next) {
  try {
    res.json({ presets: THEME_PRESETS });
  } catch (e) {
    next(e);
  }
}

/**
 * DI: bkz. createUpdateThemeToken üzerindeki not — aynı desen. Paketteki
 * her token'ı tek tek `setThemeToken` ile yazar; kısmi/başarısız bir
 * uygulama sonucu next(err) ile yukarı bildirilir (sessizce yarım kalmaz).
 */
export function createApplyThemePreset({ setThemeToken = setThemeTokenImpl } = {}) {
  return async function applyThemePreset(req, res, next) {
    try {
      const preset = THEME_PRESETS.find(p => p.id === req.validated.id);
      for (const [tokenId, value] of Object.entries(preset.tokens)) {
        await setThemeToken(tokenId, value, req.user.id);
      }
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  };
}

export const applyThemePreset = createApplyThemePreset();

/** Marka kimliği editörü (A3). Liste — tanım + güncel değer + kaynağı (db/default). */
export async function getBrandingFields(req, res, next) {
  try {
    const fields = await listBranding();
    res.json({ fields });
  } catch (e) {
    next(e);
  }
}

/** DI: bkz. createUpdateThemeToken üzerindeki not — aynı desen. */
export function createUpdateBrandingField({ setBrandingField = setBrandingFieldImpl } = {}) {
  return async function updateBrandingField(req, res, next) {
    try {
      const { id, value } = req.validated;
      await setBrandingField(id, value, req.user.id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  };
}

export const updateBrandingField = createUpdateBrandingField();

/** Sayfa/blok düzenleyici (A4). Ana sayfa bölüm sırası + banner override'ları. */
export async function getHomeContentAdmin(req, res, next) {
  try {
    const content = await getHomeContent();
    res.json({ content });
  } catch (e) {
    next(e);
  }
}

/** DI: bkz. createUpdateThemeToken üzerindeki not — aynı desen. */
export function createUpdateHomeContent({ setHomeContent = setHomeContentImpl } = {}) {
  return async function updateHomeContent(req, res, next) {
    try {
      await setHomeContent(req.validated, req.user.id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  };
}

export const updateHomeContent = createUpdateHomeContent();

/** Oyun vitrini (A5). Öne çıkan oyun kodları, sırayla. */
export async function getFeaturedGamesAdmin(req, res, next) {
  try {
    const codes = await getFeaturedGameCodes();
    res.json({ codes });
  } catch (e) {
    next(e);
  }
}

/** DI: bkz. createUpdateThemeToken üzerindeki not — aynı desen. */
export function createUpdateFeaturedGames({ setFeaturedGameCodes = setFeaturedGameCodesImpl } = {}) {
  return async function updateFeaturedGames(req, res, next) {
    try {
      await setFeaturedGameCodes(req.validated.codes, req.user.id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  };
}

export const updateFeaturedGames = createUpdateFeaturedGames();

export async function getArchivedEvents(req, res, next) {
  try {
    const { page = 1, limit = 30, search = '' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = { archivedAt: { $ne: null } };
    if (search) {
      const re = safeRegex(search);
      if (re) filter.$or = [
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
    if (event.status === 'finished') {
      // Event 'finished' olabilir ama otomatik grading başarısız olduysa (örn.
      // desteklenmeyen market tipi) hâlâ ödenmemiş bahisler kalmış olabilir —
      // bu durumda admin'in elle sonuçlandırabilmesi gerekiyor. settleEvent zaten
      // bahis/seçim bazında idempotent (sadece outcome:'pending' olanlara dokunur),
      // bu yüzden gerçekten hiçbir şey kalmadıysa (aşağıdaki kontrol) reddet.
      const hasPendingBets = await Bet.exists({
        status: 'pending',
        selections: { $elemMatch: { eventId: event._id, outcome: 'pending' } },
      });
      if (!hasPendingBets) throw createError(409,'ALREADY_SETTLED','Etkinlik zaten sonuçlandırılmış');
    }
    event.status = 'finished';
    event.result = { winner: results.maç_sonucu || '', score: score || '' };
    event.archivedAt = new Date();
    for (const market of event.markets) {
      const r = results[market.type];
      if (r) market.result = Array.isArray(r) ? r.join(',') : r; // market.result şema alanı String — çoklu kazananlı marketlerde birleştirilmiş gösterim
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
    const filter = status ? { status: String(status) } : {};
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

    const [rounds, total, byGame, wagerings, allBets] = await Promise.all([
      CasinoRound.find({ userId: req.params.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('gameId gameTitle provider bet payout net balanceBefore balanceAfter createdAt'),
      CasinoRound.countDocuments({ userId: req.params.id }),
      CasinoRound.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(req.params.id) } },
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
      ]),
      BonusWagering.find({ userId: req.params.id }).select('createdAt completedAt convertedAt status updatedAt'),
      CasinoRound.find({ userId: req.params.id }).sort({ createdAt: -1 }).limit(5000).select('bet createdAt'),
    ]);

    // Bonus aktiflik pencereleri: [start, end] — end yoksa (hâlâ aktif) Infinity
    const windows = wagerings.map(w => ({
      start: w.createdAt,
      end: w.completedAt || w.convertedAt || (w.status !== 'active' ? w.updatedAt : null),
    }));

    let bonusAttributedBet = 0;
    let realBet = 0;
    for (const round of allBets) {
      const inWindow = windows.some(w =>
        round.createdAt >= w.start && (w.end === null || round.createdAt <= w.end)
      );
      if (inWindow) bonusAttributedBet += round.bet;
      else realBet += round.bet;
    }

    res.json({
      rounds, total, page: Number(page), pages: Math.ceil(total / Number(limit)),
      summary: {
        byGame,
        bonusAttributedBet: parseFloat(bonusAttributedBet.toFixed(2)),
        realBet: parseFloat(realBet.toFixed(2)),
      },
    });
  } catch(e) { next(e); }
}

// ─── Palace Casino Admin Handlers ─────────────────────────────────────

// `_getPalaceService` palaceden test/mock için override edilebilir
async function getPalace() {
  const sessionMod = await import('../services/palaceSession.js');
  if (sessionMod._getPalaceService) return sessionMod._getPalaceService();
  return await import('../services/palaceCasinoService.js');
}

export async function getPalaceAgentInfo(req, res, next) {
  try {
    const palace = await getPalace();
    const result = await palace.getAgentInfo();
    res.json(result.data);
  } catch(e) { next(e); }
}

export async function setPalaceRtp(req, res, next) {
  try {
    const { rtp } = req.body;
    if (typeof rtp !== 'number' || rtp < 75 || rtp > 95) {
      throw createError(400, 'INVALID_RTP', 'RTP 75-95 arasında olmalı');
    }
    const palace = await getPalace();
    const result = await palace.setAgentRTP(rtp);
    res.json(result.data);
  } catch(e) { next(e); }
}

export async function startPalaceBonusCall(req, res, next) {
  try {
    const { username, gplay_id, set_point, memo } = req.body;
    if (!username || !gplay_id) {
      throw createError(400, 'MISSING_FIELDS', 'username ve gplay_id gerekli');
    }
    const user = await User.findOne({ username });
    if (!user || !user.palaceUserCode) {
      throw createError(404, 'USER_NOT_FOUND', 'Kullanıcı Palace hesabına bağlı değil');
    }
    const palace = await getPalace();
    const result = await palace.startBonusCall(gplay_id, set_point || 0, 1, memo);
    res.json({
      ...result.data,
      username,
      palaceUserCode: user.palaceUserCode,
    });
  } catch(e) { next(e); }
}

export async function cancelPalaceBonusCall(req, res, next) {
  try {
    const { call_id } = req.body;
    if (!call_id) throw createError(400, 'MISSING_FIELDS', 'call_id gerekli');
    const palace = await getPalace();
    const result = await palace.cancelBonusCall(call_id);
    res.json(result.data);
  } catch(e) { next(e); }
}

export async function getPalaceBonusCallConfig(req, res, next) {
  try {
    const palace = await getPalace();
    const result = await palace.getCallConfig();
    res.json(result.data);
  } catch(e) { next(e); }
}

export async function createPalaceUser(req, res, next) {
  try {
    const palace = await getPalace();
    const { name, linkToUserId } = req.validated || req.body;
    const result = await palace.createUser(name);
    if (result.data?.code !== 0) {
      throw createError(400, 'PALACE_ERROR', result.data?.message || 'User oluşturulamadı');
    }
    // Optionally link palace user_code to local user
    if (linkToUserId && result.data?.data?.user_code) {
      await User.findByIdAndUpdate(linkToUserId, { palaceUserCode: result.data.data.user_code });
    }
    res.json(result.data);
  } catch(e) { next(e); }
}

export async function launchPalaceGame(req, res, next) {
  try {
    const palace = await getPalace();
    const { user_code, game_id, mode, language, return_url } = req.body;
    // Ensure user_code exists for the authenticated user
    const user = await User.findById(req.user.id);
    if (!user) throw createError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı');
    if (!user.palaceUserCode) {
      throw createError(400, 'PALACE_USER_NOT_LINKED', 'Kullanıcı Palace hesabına bağlı değil. Önce kullanıcı oluşturun.');
    }

    const result = await palace.launchGame({
      userCode: user.palaceUserCode,
      gameId: game_id,
      mode,
      language,
      returnUrl: return_url
    });
    if (result.data?.code !== 0) {
      throw createError(400, 'PALACE_ERROR', result.data?.message || 'Oyun başlatılamadı');
    }
    res.json(result.data);
  } catch(e) { next(e); }
}

export async function getPalaceGameList(req, res, next) {
  try {
    const palace = await getPalace();
    const { provider, page, limit } = req.query;
    const result = await palace.getGameList(provider, Number(page) || 1, Number(limit) || 50);
    res.json(result.data);
  } catch(e) { next(e); }
}

// Get all test users with Palace balances
export async function getPalaceTestUsers(req, res, next) {
  try {
    const palace = await getPalace();

    // Find users with palaceUserCode
    const users = await User.find({
      palaceUserCode: { $exists: true, $ne: null }
    })
    .select('username palaceUserCode balance createdAt')
    .sort({ createdAt: -1 })
    .limit(100);

    const userList = [];
    for (const user of users) {
      try {
        const info = await palace.getUserInfo(user.palaceUserCode);
        userList.push({
          _id: user._id,
          username: user.username,
          palaceUserCode: user.palaceUserCode,
          casinoBalance: user.balance,
          palaceBalance: info.data?.data?.balance || 0,
          currency: info.data?.data?.currency || 4,
          createdAt: user.createdAt
        });
      } catch (e) {
        userList.push({
          _id: user._id,
          username: user.username,
          palaceUserCode: user.palaceUserCode,
          casinoBalance: user.balance,
          palaceBalance: 'error',
          error: e.message
        });
      }
    }

    res.json({
      users: userList,
      totalUsers: userList.length,
      totalPalaceBalance: userList.reduce((sum, u) => sum + (typeof u.palaceBalance === 'number' ? u.palaceBalance : 0), 0)
    });
  } catch(e) { next(e); }
}

// Withdraw all Palace test user balances to main casino balance
export async function withdrawPalaceTestUsers(req, res, next) {
  try {
    const palace = await getPalace();

    // Find users with palaceUserCode
    const users = await User.find({
      palaceUserCode: { $exists: true, $ne: null }
    })
    .select('username palaceUserCode balance');

    let totalWithdrawn = 0;
    let successCount = 0;
    let errorCount = 0;
    const results = [];

    for (const user of users) {
      try {
        // Get current Palace balance
        const infoResult = await palace.getUserInfo(user.palaceUserCode);
        const palaceBalance = parseFloat(infoResult.data?.data?.balance || 0);

        if (palaceBalance > 0) {
          // Withdraw all from Palace
          const withdrawResult = await palace.withdrawAllUser(user.palaceUserCode);
          
          if (withdrawResult.data?.code === 0) {
            // Add to main casino balance
            user.balance += palaceBalance;
            await user.save();

            totalWithdrawn += palaceBalance;
            successCount++;
            results.push({
              username: user.username,
              palaceUserCode: user.palaceUserCode,
              withdrawn: palaceBalance,
              status: 'success'
            });
            console.log(`✅ ${user.username} (${user.palaceUserCode}): ${palaceBalance} TL withdrawn`);
          } else {
            errorCount++;
            results.push({
              username: user.username,
              palaceUserCode: user.palaceUserCode,
              withdrawn: 0,
              status: 'error',
              message: withdrawResult.data?.message || 'Bilinmeyen hata'
            });
            console.log(`❌ ${user.username} (${user.palaceUserCode}): ${withdrawResult.data?.message}`);
          }
        } else {
          results.push({
            username: user.username,
            palaceUserCode: user.palaceUserCode,
            withdrawn: 0,
            status: 'skipped',
            message: 'Bakiye 0'
          });
        }
      } catch (e) {
        errorCount++;
        results.push({
          username: user.username,
          palaceUserCode: user.palaceUserCode,
          withdrawn: 0,
          status: 'error',
          message: e.message
        });
        console.log(`❌ ${user.username} (${user.palaceUserCode}): ${e.message}`);
      }
    }

    res.json({
      success: true,
      totalUsersChecked: users.length,
      successCount,
      errorCount,
      totalWithdrawn,
      results
    });
  } catch(e) { next(e); }
}

// Palace özet bilgisi: agent bakiyesi, kullanıcı sayısı, aktif oturum, günlük istatistik
export async function getPalaceSummary(req, res, next) {
  try {
    const palace = await getPalace();

    // Agent bilgisi (Palace API)
    let agent = null;
    let agentError = null;
    try {
      const info = await palace.getAgentInfo();
      if (info?.code === 0 && info.data) {
        agent = info.data;
      } else {
        agentError = info?.message || 'Agent bilgisi alınamadı';
      }
    } catch (e) {
      agentError = e.message;
    }

    // Kullanıcı sayıları
    const [palaceUserCount, activeSessionCount, stuckSessionCount] = await Promise.all([
      User.countDocuments({ palaceUserCode: { $exists: true, $ne: null } }),
      CasinoSession.countDocuments({ status: 'active' }),
      CasinoSession.countDocuments({ status: 'active', updatedAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) } }),
    ]);

    // Bugünkü Palace istatistikleri (rounds + GGR)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayAgg = await CasinoRound.aggregate([
      { $match: { provider: 'palace', createdAt: { $gte: startOfDay } } },
      {
        $group: {
          _id: null,
          rounds: { $sum: 1 },
          totalBet: { $sum: '$betAmount' },
          totalPayout: { $sum: '$payout' },
          ggr: { $sum: { $subtract: ['$betAmount', '$payout'] } },
          uniqueUsers: { $addToSet: '$userId' },
        },
      },
      {
        $project: {
          _id: 0,
          rounds: 1,
          totalBet: 1,
          totalPayout: 1,
          ggr: 1,
          uniqueUsers: { $size: '$uniqueUsers' },
        },
      },
    ]);
    const today = todayAgg[0] || { rounds: 0, totalBet: 0, totalPayout: 0, ggr: 0, uniqueUsers: 0 };

    res.json({
      agent,
      agentError,
      palaceUserCount,
      activeSessionCount,
      stuckSessionCount,
      today,
    });
  } catch(e) { next(e); }
}

// ─── Error log admin endpoints ─────────────────────────────────────
export async function getRecentErrors(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const lines = errorLogger.readRecent(limit);
    // Parse each line into structured entry
    const entries = lines.map(line => {
      const match = line.match(/^(\S+) \[(\w+)\] (\S+?): (.*?) \| (\{.*\})$/);
      if (match) {
        try {
          return {
            timestamp: match[1],
            level: match[2],
            category: match[3],
            message: match[4],
            meta: JSON.parse(match[5]),
            raw: line,
          };
        } catch {}
      }
      return { timestamp: '', level: 'UNKNOWN', category: '', message: line, meta: null, raw: line };
    });
    res.json({ count: entries.length, entries });
  } catch(e) { next(e); }
}

export async function getErrorLogStatus(req, res, next) {
  try {
    res.json(errorLogger.status());
  } catch(e) { next(e); }
}

export async function clearErrorLog(req, res, next) {
  try {
    const ok = errorLogger.clear();
    res.json({ success: ok });
  } catch(e) { next(e); }
}
// ── Alarm kanalı ayarları ─────────────────────────────────────────────────────

/**
 * Kanal ayarlarını kaynağıyla birlikte döner. Secret'lar maskeli gider —
 * kaydedilen bir token panelde bir daha açık gösterilmez.
 */
export async function getAlertSettings(req, res, next) {
  try {
    const items = [];
    for (const key of ALERT_KEYS) {
      const value = await getSetting(key);
      items.push({
        key,
        source: await getSettingSource(key),
        secret: SECRET_KEYS.has(key),
        value: SECRET_KEYS.has(key) ? maskSecret(value) : (value || null),
      });
    }
    res.json({ settings: items });
  } catch(e) { next(e); }
}

/**
 * Ayarları günceller. Boş string gönderilen anahtar DB'den silinir ve varsa
 * .env değerine geri düşer — panelden "temizle" bunu ifade eder.
 */
export async function updateAlertSettings(req, res, next) {
  try {
    const updates = req.body?.settings;
    if (!updates || typeof updates !== 'object')
      throw createError(400, 'INVALID_BODY', 'settings nesnesi gerekli');

    const unknown = Object.keys(updates).filter(k => !ALERT_KEYS.includes(k));
    if (unknown.length)
      throw createError(400, 'UNKNOWN_SETTING', `Bilinmeyen ayar: ${unknown.join(', ')}`);

    for (const [key, raw] of Object.entries(updates)) {
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (!value) {
        await Setting.deleteOne({ key });
      } else {
        await Setting.findOneAndUpdate(
          { key },
          { value, updatedBy: req.user.id },
          { upsert: true, new: true },
        );
      }
    }
    invalidateSettings();
    await getAlertSettings(req, res, next);
  } catch(e) { next(e); }
}

/** Kayıtlı ayarlarla gerçek bir test alarmı gönderir. */
export async function testAlertChannels(req, res, next) {
  try {
    invalidateSettings();
    const configured = {};
    for (const key of ALERT_KEYS) configured[key] = Boolean(await getSetting(key));

    const channels = {
      telegram: configured.TELEGRAM_BOT_TOKEN && configured.TELEGRAM_CHAT_ID,
      webhook: configured.ALERT_WEBHOOK_URL,
      email: configured.ALERT_EMAIL_TO,
    };
    if (!Object.values(channels).some(Boolean))
      throw createError(400, 'NO_CHANNEL', 'Tanımlı alarm kanalı yok');

    // WARN seviyesi throttle'a takılabilir; test her zaman gitsin diye CRITICAL.
    await sendAlert('CRITICAL', 'alert_test', 'Alarm kanalı testi — bu mesajı görüyorsanız hat çalışıyor.', {
      tetikleyen: req.user.id,
    });
    res.json({ sent: channels });
  } catch(e) { next(e); }
}

// ─── O6 — Oyun limitleri, RTP ve house edge ayarları ───────────────
export async function getGameSettings(req, res, next) {
  try {
    const settings = await getAllGameSettings();
    res.json({ settings });
  } catch (e) {
    next(e);
  }
}

const GAME_CACHE_INVALIDATORS = {
  'inhouse-crash': invalidateCrashSettingsCache,
  'inhouse-roulette': invalidateRouletteSettingsCache,
  'inhouse-mines': invalidateMinesSettingsCache,
  'inhouse-dice': invalidateDiceSettingsCache,
  'inhouse-limbo': invalidateLimboSettingsCache,
  'inhouse-hilo': invalidateHiloSettingsCache,
  'inhouse-dragontiger': invalidateDragonTigerSettingsCache,
  'inhouse-plinko': invalidatePlinkoSettingsCache,
  'inhouse-wheel': invalidateWheelSettingsCache,
  'inhouse-keno': invalidateKenoSettingsCache,
  'inhouse-baccarat': invalidateBaccaratSettingsCache,
  'inhouse-blackjack': invalidateBlackjackSettingsCache,
  'inhouse-videopoker': invalidateVideoPokerSettingsCache,
};

export async function updateGameSettings(req, res, next) {
  try {
    const { gameId } = req.params;
    if (!GAME_CACHE_INVALIDATORS[gameId]) {
      return res.status(400).json({ error: { code: 'UNKNOWN_GAME', message: `Bilinmeyen oyun: ${gameId}` } });
    }
    const { reason, ...updates } = req.validated;
    const { settings, changes } = await updateGameSettingsImpl(gameId, updates, req.user.id, { reason });
    GAME_CACHE_INVALIDATORS[gameId]();
    res.json({ settings, changes });
  } catch (e) {
    next(e);
  }
}

const RTP_SIMULATORS = {
  'inhouse-blackjack': simulateBlackjackRtp,
  'inhouse-videopoker': simulateVideoPokerRtp,
};

// RTP'si oyuncu kararına bağlı oyunlar (Blackjack/Video Poker) için Monte
// Carlo tahmini — kaydedilmemiş aday ayarlarla, admin kaydetmeden önce
// "bu ayarlarla RTP ne olur" görebilsin diye. Yan etkisi yok, DB'ye yazmaz.
export async function simulateGameRtp(req, res, next) {
  try {
    const { gameId } = req.params;
    const simulator = RTP_SIMULATORS[gameId];
    if (!simulator) {
      return res.status(400).json({ error: { code: 'UNKNOWN_GAME', message: `Bu oyun için simülasyon desteklenmiyor: ${gameId}` } });
    }
    const { hands, ...candidateSettings } = req.validated;
    const result = simulator(candidateSettings, hands);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

// ─── U4 — Para birimi ───────────────────────────────────────────────
// Servis katmanı (currency/index.js) zaten yazılmıştı — burada eksik olan
// yalnızca admin HTTP ucuydu.
export async function getCurrencySettings(req, res, next) {
  try {
    const active = await getActiveCurrency();
    res.json({ active, supported: listCurrencies() });
  } catch (e) {
    next(e);
  }
}

export async function updateCurrencySettings(req, res, next) {
  try {
    const { code } = req.validated;
    await setActiveCurrency(code, req.user.id);
    const active = await getActiveCurrency();
    res.json({ active });
  } catch (e) {
    next(e);
  }
}

// ─── O4 — Kademeli yönetici yetkileri ───────────────────────────────
// services/permissions.js (349 satır, 12 fonksiyon) zaten yazılmıştı —
// eksik olan yalnızca bu admin HTTP ucuydu. Not: sub-admin'lerin (role
// !== 'admin', yalnızca roles[] atanmış kullanıcılar) bu uçlara erişimi
// ŞU AN YOK — routes/admin.js'teki router-seviyesi requireAdmin hâlâ
// yalnızca role==='admin' geçiriyor (bilerek dokunulmadı, mevcut
// adminlerin kilitlenme riski almamak için). Bu tur, rol/izin YÖNETİMİNİ
// (tanımlama + atama) bağlıyor; her mevcut route'a requirePermission
// eklemek — sub-admin'lerin gerçekten kısıtlı erişebilmesi için gereken
// asıl adım — çok daha büyük, ayrı bir denetim/retrofit turu gerektiriyor.
export async function listRoles(req, res, next) {
  try {
    const roles = await getAllRoles();
    res.json({ roles });
  } catch (e) { next(e); }
}

export async function listPermissions(req, res, next) {
  try {
    const permissions = await getAllPermissions();
    res.json({ permissions });
  } catch (e) { next(e); }
}

export async function createRoleHandler(req, res, next) {
  try {
    const role = await createRole(req.validated);
    res.json({ role });
  } catch (e) { next(e); }
}

export async function updateRoleHandler(req, res, next) {
  try {
    const role = await updateRole(req.params.id, req.validated);
    res.json({ role });
  } catch (e) { next(e); }
}

export async function deleteRoleHandler(req, res, next) {
  try {
    await deleteRole(req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function assignUserRole(req, res, next) {
  try {
    const user = await assignRoleToUser(req.params.id, req.validated.roleId, req.user.id);
    res.json({ roles: user.roles });
  } catch (e) { next(e); }
}

export async function removeUserRole(req, res, next) {
  try {
    const user = await removeRoleFromUser(req.params.id, req.params.roleId);
    res.json({ roles: user.roles });
  } catch (e) { next(e); }
}

// ─── O1 — VIP/seviye programı ───────────────────────────────────────
// services/vip.js zaten yazılmıştı (awardXp artık CasinoRound/settlement'a
// bağlı — bkz. modellerdeki not) — burada yalnızca admin CRUD ucu eklendi.
export async function listVipLevels(req, res, next) {
  try {
    const levels = await getAllVipLevels();
    res.json({ levels });
  } catch (e) { next(e); }
}

export async function saveVipLevel(req, res, next) {
  try {
    const level = await upsertVipLevel(req.validated);
    res.json({ level });
  } catch (e) { next(e); }
}

export async function removeVipLevel(req, res, next) {
  try {
    await deleteVipLevel(Number(req.params.level));
    res.json({ ok: true });
  } catch (e) { next(e); }
}

// ─── O2 — Affiliate: 3 seviye ağaç görünürlüğü (salt-okunur) ────────
// Ödeme mekanizmasına dokunmuyor — bkz. services/referralTreeView.js.
export async function getReferralTree(req, res, next) {
  try {
    const tree = await getReferralTreeView(req.params.id);
    res.json({ tree });
  } catch (e) { next(e); }
}

// ─── P3 — bot oyuncular (User koleksiyonunda isBot:true) ────────────
export async function listBots(req, res, next) {
  try {
    const result = await getAllBots(req.query);
    res.json(result);
  } catch (e) { next(e); }
}

export async function createBotHandler(req, res, next) {
  try {
    const bot = await createBot(req.validated, req.user.id);
    res.status(201).json({ bot });
  } catch (e) { next(e); }
}

export async function getBotHandler(req, res, next) {
  try {
    const bot = await getBotById(req.params.id);
    if (!bot) return res.status(404).json({ error: { message: 'Bot bulunamadı' } });
    const stats = await getBotStats(req.params.id);
    res.json({ bot, stats });
  } catch (e) { next(e); }
}

export async function updateBotHandler(req, res, next) {
  try {
    const bot = await updateBot(req.params.id, req.validated);
    res.json({ bot });
  } catch (e) { next(e); }
}

export async function deleteBotHandler(req, res, next) {
  try {
    await deleteBot(req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function startAllBotsHandler(req, res, next) {
  try {
    const count = await startAllBots();
    res.json({ started: count });
  } catch (e) { next(e); }
}

export async function stopAllBotsHandler(req, res, next) {
  try {
    const count = await stopAllBots();
    res.json({ stopped: count });
  } catch (e) { next(e); }
}

// ─── Son Kazananlar simülasyonu (kozmetik, P3'ün gerçek User/bakiye
// mimarisinden bilinçli olarak ayrı — bkz. services/fakeWinners.js) ───
export async function getFakeWinnersSettings(req, res, next) {
  try {
    res.json({ config: getFakeWinnersConfig(), poolSize: getFakeWinnersPoolSize() });
  } catch (e) { next(e); }
}

export async function updateFakeWinnersSettings(req, res, next) {
  try {
    const config = await saveFakeWinnersConfig(req.body, req.user.id);
    res.json({ config, poolSize: getFakeWinnersPoolSize() });
  } catch (e) { next(e); }
}

// ─── Statik sayfa yönetimi (Footer/Hakkımızda/Yasal vb.) ───────────
export async function listStaticPages(req, res, next) {
  try {
    const pages = await listAllStaticPagesForAdmin();
    res.json({ pages });
  } catch (e) { next(e); }
}

export async function upsertStaticPage(req, res, next) {
  try {
    const page = await upsertStaticPageSvc(req.params.slug, req.validated, req.user.id);
    res.json({ page });
  } catch (e) { next(e); }
}

export async function toggleStaticPage(req, res, next) {
  try {
    const page = await toggleStaticPageSvc(req.params.slug, req.validated.isEnabled, req.user.id);
    res.json({ page });
  } catch (e) { next(e); }
}
