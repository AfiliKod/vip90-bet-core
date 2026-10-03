import crypto from 'crypto';
import mongoose from 'mongoose';
import { withTransactionRetry } from '../utils/transactionRetry.js';
import { createTransaction } from '../services/ledger.js';
import User from '../models/User.js';
import Event from '../models/Event.js';
import Bet from '../models/Bet.js';
import Transaction from '../models/Transaction.js';
import BonusWagering from '../models/BonusWagering.js';
import GameTask from '../models/GameTask.js';
import CasinoRound from '../models/CasinoRound.js';
import CasinoSession from '../models/CasinoSession.js';
import Promotion from '../models/Promotion.js';
import VipLevel from '../models/VipLevel.js';
import RiskProfile from '../models/RiskProfile.js';
import { createError } from '../middleware/error.js';
import { getAdminCounts, broadcastAdminCounts } from '../services/adminCounts.js';
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
import { getAllGameSettings } from '../services/gameSettings.js';
import { updateDailyStats } from '../services/responsibleGaming.js';
import { getActiveCurrency, listCurrencies, setActiveCurrency } from '../currency/index.js';
import { getIgames } from '../services/casinoPromo/provider.js';
import * as promoGrants from '../services/casinoPromo/grants.js';
import { listPromoGrantsQuerySchema } from '../validators/admin.js';
import {
  getAllRoles, getAllPermissions, createRole, updateRole, deleteRole,
  assignRoleToUser, removeRoleFromUser, userHasPermission, getUserPermissions,
} from '../services/permissions.js';
import { getAllVipLevels, upsertVipLevel, deleteVipLevel } from '../services/vip.js';
import { getReferralTreeView } from '../services/referralTreeView.js';
import { createBot, getAllBots, getBotById, updateBot, deleteBot, getBotStats, startAllBots, stopAllBots } from '../services/bot.js';
import { listAllForAdmin as listAllStaticPagesForAdmin, upsertPage as upsertStaticPageSvc, togglePage as toggleStaticPageSvc } from '../services/staticPages.js';
import { setFeaturedGameCodes as setFeaturedGameCodesImpl, getFeaturedGameCodes } from '../games/index.js';
import * as demoDataRegistry from '../services/demoData/registry.js';

// In-house oyun provider'ı ayrı (ücretli) bir pakettir — bu kurulumda hiç
// bulunmayabilir (bkz. app.js'deki aynı opsiyonel yükleme deseni).
let updateProviderGameSettings = null;
let simulateBlackjackRtp = null;
let simulateVideoPokerRtp = null;
try {
  ({ updateSettings: updateProviderGameSettings } = await import('../premium/inhouse-provider/inhouseProviderClient.js'));
  ({ simulateBlackjackRtp, simulateVideoPokerRtp } = await import('../premium/inhouse-provider/math/rtpSimulator.js'));
} catch {
  // In-house oyun provider'ı bu kurulumda mevcut değil.
}

// Bahis sonuçlandırma motoru (oran çekme + grading) da ayrı (ücretli) bir
// pakettir — aynı opsiyonel yükleme deseni. Event/Bet modelleri ve temel
// CRUD çekirdekte kalıyor, yalnızca "nasıl sonuçlandırılır" mantığı taşınıyor.
let settleEvent = null;
try {
  ({ settleEvent } = await import('../premium/betting/settlement.js'));
} catch {
  // Bahis sonuçlandırma motoru bu kurulumda mevcut değil.
}

// Phase B13 — ReDoS protection
function safeRegex(input, maxLength = 100) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().slice(0, maxLength);
  if (!trimmed) return null;
  return new RegExp(escapeStringRegexp(trimmed), 'i');
}

// ─── Standard Admin Functions ──────────────────────────────────────

// Users listesi ve facet sayaçları aynı filtre tanımlarını kullanır.
// VIP = taban seviyenin (level 1, Bronze) ÜSTÜNDE bir VipLevel'e sahip olmak:
// services/vip.js checkLevelUp herkese sessizce Bronze atar; yalnızca
// "vipLevel != null" demek tüm oyuncuları VIP sayardı.
const STATUS_FILTERS = {
  active:    { isActive: true,  deletedAt: null },
  suspended: { isActive: false, deletedAt: null },
  deleted:   { deletedAt: { $ne: null } },
};

async function vipFilter() {
  const ids = await VipLevel.find({ level: { $gt: 1 } }).distinct('_id');
  return { vipLevel: { $in: ids }, deletedAt: null };
}

async function statusFilter(status) {
  if (status === 'vip') return vipFilter();
  return STATUS_FILTERS[status] ? { ...STATUS_FILTERS[status] } : {};
}

export async function getUsers(req, res, next) {
  try {
    const { search = '', status = 'all', page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = await statusFilter(status);
    if (search) {
      const re = safeRegex(search);
      if (re) filter.$or = [{ username: re }, { email: re }];
    }
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .populate('referredBy', 'username')
        .populate('roles', 'name displayName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(filter),
    ]);

    // Sayfadaki kullanıcılar için tek toplu risk sorgusu (N+1 yok).
    const profiles = users.length
      ? await RiskProfile.find({ playerId: { $in: users.map(u => u._id) } }).select('playerId riskLevel').lean()
      : [];
    const riskByUser = new Map(profiles.map(p => [String(p.playerId), String(p.riskLevel).toLowerCase()]));
    const rows = users.map(u => ({
      ...u,
      kycTier: u.kycStatus || null,
      riskTier: riskByUser.get(String(u._id)) || null,
    }));

    res.json({ users: rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch(e) { next(e); }
}

export async function getUsersFacets(req, res, next) {
  try {
    const [vip, all, active, suspended, deleted] = await Promise.all([
      vipFilter().then(f => User.countDocuments(f)),
      User.countDocuments({}),
      User.countDocuments(STATUS_FILTERS.active),
      User.countDocuments(STATUS_FILTERS.suspended),
      User.countDocuments(STATUS_FILTERS.deleted),
    ]);
    res.json({ all, active, suspended, deleted, vip });
  } catch(e) { next(e); }
}

// Delta alanları: modelde geçmiş anlık görüntü (bakiye/aktivite geçmişi) tutulmadığı
// için hesaplanamaz; uydurmak yerine null döner, istemci satırı gizler.
export async function getUsersKpis(req, res, next) {
  try {
    const now = Date.now();
    const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const [active30d, kycPending, newToday, avg] = await Promise.all([
      User.countDocuments({ deletedAt: null, lastLoginAt: { $gte: since30d } }),
      User.countDocuments({ kycStatus: { $in: ['pending', 'under_review'] } }),
      User.countDocuments({ createdAt: { $gte: startOfToday } }),
      User.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: null, avg: { $avg: '$balance' } } },
      ]),
    ]);
    res.json({
      active30d,
      kycPending,
      avgBalance: Math.round((avg[0]?.avg || 0) * 100) / 100,
      newToday,
      active30dDeltaPct: null,
      avgBalanceDeltaPct: null,
    });
  } catch(e) { next(e); }
}

export async function createUser(req, res, next) {
  try {
    const { username, email, password, role, referredBy, phone, dateOfBirth, roles } = req.validated;
    if (await User.findOne({ $or: [{ username }, { email }] }))
      throw createError(409, 'USER_EXISTS', 'Kullanıcı adı veya email zaten kullanımda');

    let referredById = null;
    if (referredBy) {
      const referrer = await User.findOne({ username: referredBy, deletedAt: null });
      if (!referrer) throw createError(400, 'REFERRER_NOT_FOUND', 'Referans kullanıcısı bulunamadı');
      referredById = referrer._id;
    }

    // roles yalnızca role='admin' iken VE isteği yapanın admin:roles:write
    // izni varsa uygulanır — UI'da zaten gizli, ama sunucu tarafında da
    // ayrıca zorlanıyor (izinsiz biri payload'a elle roles ekleyemez).
    if (roles?.length && (role !== 'admin' || !(await userHasPermission(req.user.id, 'admin:roles:write')))) {
      throw createError(403, 'FORBIDDEN', 'Yetki yok: admin:roles:write');
    }

    const user = await User.create({ username, email, password, role, referredBy: referredById, phone: phone || null, dateOfBirth: dateOfBirth || null });

    if (roles?.length) {
      for (const roleId of roles) {
        await assignRoleToUser(user._id, roleId, req.user.id);
      }
    }

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

    if (type === 'bonus') {
      // SECURITY FIX (H10): Use atomic $inc for balance update
      const balanceBeforeUser = await User.findById(req.params.id);
      if (!balanceBeforeUser) throw createError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı');
      const balanceBefore = balanceBeforeUser.balance;

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { $inc: { balance: amount } },
        { new: true }
      );

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

      const idempotencyKey = `admin_balance_${req.params.id}_${crypto.randomUUID()}`;
      const { transaction } = await createTransaction({
        userId: user._id,
        type: 'bonus',
        amount,
        balanceBefore,
        balanceAfter: user.balance,
        note: note || '',
        createdBy: req.user.id,
        idempotencyKey,
        source: 'admin',
      });

      // bonusBalance artık kilitli/çevrim bekleyen tutarın göstergesi (mirror).
      const { getLockedAmount } = await import('../services/wagering.js');
      await User.findByIdAndUpdate(user._id, { bonusBalance: await getLockedAmount(user._id) });

      return res.json({ user: user.toSafeObject(), transaction });
    }

    // SECURITY FIX (H10): Use atomic $inc for balance update
    const balanceBeforeUser = await User.findById(req.params.id);
    if (!balanceBeforeUser) throw createError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı');
    const balanceBefore = balanceBeforeUser.balance;

    if (type === 'debit') {
      if (balanceBefore < amount) throw createError(400, 'INSUFFICIENT_BALANCE', 'Yetersiz bakiye');
    }

    const incAmount = type === 'credit' ? amount : -amount;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $inc: { balance: incAmount } },
      { new: true }
    );

    const idempotencyKey = `admin_balance_${req.params.id}_${crypto.randomUUID()}`;
    const { transaction } = await createTransaction({
      userId: user._id,
      type: 'admin_adjustment',
      amount: type === 'debit' ? -amount : amount,
      balanceBefore,
      balanceAfter: user.balance,
      note: note || '',
      createdBy: req.user.id,
      idempotencyKey,
      source: 'admin',
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
    const { page = 1, limit = 30, search = '', sport = '' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const filter = { archivedAt: { $ne: null } };
    if (sport && sport !== 'all') filter.sport = String(sport);
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
    // SECURITY FIX (M1): Whitelist allowed fields to prevent mass assignment
    const allowedFields = ['homeTeam', 'awayTeam', 'league', 'leagueFlag', 'sport', 'status', 'result', 'startTime', 'markets', 'archivedAt'];
    const filtered = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowedFields.includes(k))
    );
    const event = await Event.findByIdAndUpdate(req.params.id, filtered, { new:true });
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
    if (!settleEvent) {
      return res.status(503).json({ error: { code: 'MODULE_NOT_INSTALLED', message: 'Bahis sonuçlandırma motoru bu kurulumda mevcut değil.' } });
    }
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
    // isSeed filtresi bilerek yok: seed/demo veri analytics ile birlikte
    // bu genel sayaçlara da dahildir (bkz. Faz 3 kararı).
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
    const { status, page, limit } = req.query;
    const filter = status && status !== 'all' ? { status: String(status) } : {};
    // Sabit limit(200) yerine gerçek sayfalama — 200'den fazla kırık oyun
    // kaydı biriktikçe eski kuyruk sessizce kırpılıyordu.
    const perPage = Math.max(1, Math.min(parseInt(limit) || 20, 100));
    const current = Math.max(1, parseInt(page) || 1);
    const [tasks, total] = await Promise.all([
      GameTask.find(filter).sort({ detectedAt: -1 })
        .skip((current - 1) * perPage)
        .limit(perPage),
      GameTask.countDocuments(filter),
    ]);
    res.json({
      tasks,
      total,
      page: current,
      pages: Math.max(1, Math.ceil(total / perPage)),
    });
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

    // isSeed filtresi bilerek yok (seed nesilleri gerçekçi house-edge ile
    // üretilir — casinoSeed.js / sportsSeed.js; bkz. Faz 3 kararı).
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

// ─── Igames Casino Admin Handlers ─────────────────────────────────────

// getIgames: test/mock override için services/casinoPromo/provider.js

export async function getIgamesAgentInfo(req, res, next) {
  try {
    const igames = await getIgames();
    const result = await igames.getAgentInfo();
    res.json(result.data);
  } catch(e) { next(e); }
}

export async function setIgamesRtp(req, res, next) {
  try {
    const { rtp } = req.body;
    if (typeof rtp !== 'number' || rtp < 75 || rtp > 95) {
      throw createError(400, 'INVALID_RTP', 'RTP 75-95 arasında olmalı');
    }
    const igames = await getIgames();
    const result = await igames.setAgentRTP(rtp);
    res.json(result.data);
  } catch(e) { next(e); }
}

// Sağlayıcıda şu an açık oyun oturumları (bonus call yalnızca bunlara verilebilir).
export async function getIgamesOnlinePlays(req, res, next) {
  try {
    const igames = await getIgames();
    const result = await igames.getOnlineGames();
    const rows = Array.isArray(result.data?.data) ? result.data.data : [];
    // Çalışan bonus call kayıtlarını canlı listeyle eşitle; senkron hatası yanıtı bozmasın.
    try { await promoGrants.syncBonusCallsFromOnline(rows); }
    catch (syncErr) { console.error('[casinoPromo] online sync failed:', syncErr.message); }
    res.json({
      plays: rows.map(r => ({
        gplay_id: r.gplay_id,
        user_name: r.user_name,
        game_name: r.game_name,
        game_code: r.game_code,
        provider_name: r.provider_name,
        spend: r.spend,
        win: r.win,
        call_enable: !!r.call_enable,
        call_id: r.call_id || null,
        call_status: r.call_status,
        last_update: r.last_update,
      })),
    });
  } catch (e) { next(e); }
}

function promoActor(req) {
  return { id: req.user.id, username: req.user.username || 'admin' };
}

export async function startIgamesBonusCall(req, res, next) {
  try {
    const { gplay_id, set_point, memo } = req.validated;
    const grant = await promoGrants.startBonusCall({ actor: promoActor(req), gplayId: gplay_id, setPoint: set_point, memo });
    res.json(grant);
  } catch(e) { next(e); }
}

export async function cancelIgamesBonusCall(req, res, next) {
  try {
    const grant = await promoGrants.cancelBonusCall({ actor: promoActor(req), grantId: req.validated.grant_id });
    res.json(grant);
  } catch(e) { next(e); }
}

export async function getPromoConfig(req, res, next) {
  try {
    res.json(await promoGrants.getPromoConfig());
  } catch(e) { next(e); }
}

export async function listPromoGrants(req, res, next) {
  try {
    const parsed = listPromoGrantsQuerySchema.safeParse(req.query || {});
    if (!parsed.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Geçersiz sorgu', details: parsed.error.flatten() } });
    }
    res.json(await promoGrants.listGrants(parsed.data));
  } catch(e) { next(e); }
}

export async function createFreeRound(req, res, next) {
  try {
    const b = req.validated;
    const grant = await promoGrants.createFreeRound({
      actor: promoActor(req),
      userId: b.user_id,
      providerId: b.provider_id,
      gameCode: b.game_code,
      gameName: b.game_name,
      rounds: b.rounds,
      bet: b.bet,
      win: b.win,
      scenario: b.scenario ?? null,
      expiresAt: b.expires_at,
      memo: b.memo,
    });
    res.status(201).json(grant);
  } catch(e) { next(e); }
}

export async function cancelFreeRound(req, res, next) {
  try {
    const grant = await promoGrants.cancelFreeRound({ actor: promoActor(req), grantId: req.validated.grant_id });
    res.json(grant);
  } catch(e) { next(e); }
}

export async function getIgamesBonusCallConfig(req, res, next) {
  try {
    const igames = await getIgames();
    const result = await igames.getCallConfig();
    res.json(result.data);
  } catch(e) { next(e); }
}

export async function createIgamesUser(req, res, next) {
  try {
    const igames = await getIgames();
    const { name, linkToUserId } = req.validated || req.body;
    const result = await igames.createUser(name);
    if (result.data?.code !== 0) {
      throw createError(400, 'IGAMES_ERROR', result.data?.message || 'User oluşturulamadı');
    }
    // Optionally link igames user_code to local user
    if (linkToUserId && result.data?.data?.user_code) {
      await User.findByIdAndUpdate(linkToUserId, { palaceUserCode: result.data.data.user_code });
    }
    res.json(result.data);
  } catch(e) { next(e); }
}

export async function launchIgamesGame(req, res, next) {
  try {
    const igames = await getIgames();
    const { user_code, game_id, mode, language, return_url } = req.body;
    // Ensure user_code exists for the authenticated user
    const user = await User.findById(req.user.id);
    if (!user) throw createError(404, 'USER_NOT_FOUND', 'Kullanıcı bulunamadı');
    if (!user.palaceUserCode) {
      throw createError(400, 'IGAMES_USER_NOT_LINKED', 'Kullanıcı Igames hesabına bağlı değil. Önce kullanıcı oluşturun.');
    }

    const result = await igames.launchGame({
      userCode: user.palaceUserCode,
      gameId: game_id,
      mode,
      language,
      returnUrl: return_url
    });
    if (result.data?.code !== 0) {
      throw createError(400, 'IGAMES_ERROR', result.data?.message || 'Oyun başlatılamadı');
    }
    res.json(result.data);
  } catch(e) { next(e); }
}

export async function getIgamesGameList(req, res, next) {
  try {
    const igames = await getIgames();
    const { provider, page, limit } = req.query;
    const result = await igames.getGameList(provider, Number(page) || 1, Number(limit) || 50);
    res.json(result.data);
  } catch(e) { next(e); }
}

// Get all test users with Igames balances
export async function getIgamesTestUsers(req, res, next) {
  try {
    const igames = await getIgames();

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
        const info = await igames.getUserInfo(user.palaceUserCode);
        userList.push({
          _id: user._id,
          username: user.username,
          palaceUserCode: user.palaceUserCode,
          casinoBalance: user.balance,
          igamesBalance: info.data?.data?.balance || 0,
          currency: info.data?.data?.currency || 4,
          createdAt: user.createdAt
        });
      } catch (e) {
        userList.push({
          _id: user._id,
          username: user.username,
          palaceUserCode: user.palaceUserCode,
          casinoBalance: user.balance,
          igamesBalance: 'error',
          error: e.message
        });
      }
    }

    res.json({
      users: userList,
      totalUsers: userList.length,
      totalIgamesBalance: userList.reduce((sum, u) => sum + (typeof u.igamesBalance === 'number' ? u.igamesBalance : 0), 0)
    });
  } catch(e) { next(e); }
}

// Withdraw all Igames test user balances to main casino balance
export async function withdrawIgamesTestUsers(req, res, next) {
  try {
    const igames = await getIgames();

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
        // Get current Igames balance
        const infoResult = await igames.getUserInfo(user.palaceUserCode);
        const igamesBalance = parseFloat(infoResult.data?.data?.balance || 0);

        if (igamesBalance > 0) {
          // Withdraw all from Igames
          const withdrawResult = await igames.withdrawAllUser(user.palaceUserCode);
          
          if (withdrawResult.data?.code === 0) {
            // Add to main casino balance (atomic)
            await User.findByIdAndUpdate(user._id, { $inc: { balance: igamesBalance } });

            totalWithdrawn += igamesBalance;
            successCount++;
            results.push({
              username: user.username,
              palaceUserCode: user.palaceUserCode,
              withdrawn: igamesBalance,
              status: 'success'
            });
            console.log(`✅ ${user.username} (${user.palaceUserCode}): ${igamesBalance} TL withdrawn`);
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

// Igames özet bilgisi: agent bakiyesi, kullanıcı sayısı, aktif oturum, günlük istatistik
export async function getIgamesSummary(req, res, next) {
  try {
    const igames = await getIgames();

    // Agent bilgisi (Igames API)
    let agent = null;
    let agentError = null;
    try {
      const info = await igames.getAgentInfo();
      if (info?.code === 0 && info.data) {
        agent = info.data;
      } else {
        agentError = info?.message || 'Agent bilgisi alınamadı';
      }
    } catch (e) {
      agentError = e.message;
    }

    // Kullanıcı sayıları
    const [igamesUserCount, activeSessionCount, stuckSessionCount] = await Promise.all([
      User.countDocuments({ palaceUserCode: { $exists: true, $ne: null } }),
      CasinoSession.countDocuments({ status: 'active' }),
      CasinoSession.countDocuments({ status: 'active', updatedAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) } }),
    ]);

    // Bugünkü Igames istatistikleri (rounds + GGR)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayAgg = await CasinoRound.aggregate([
      { $match: { provider: 'igames', createdAt: { $gte: startOfDay } } },
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
      igamesUserCount,
      activeSessionCount,
      stuckSessionCount,
      today,
    });
  } catch(e) { next(e); }
}

// ─── Error log admin endpoints ─────────────────────────────────────
export async function getRecentErrors(req, res, next) {
  try {
    // Hata günlüğü bir dosya/log tamponundan okunuyor (DB sorgusu DEĞİL), bu
    // yüzden sayfalama .skip() değil dizi dilimlemedir: `total` yaşam boyu
    // toplam değil, okunabilen tamponun boyutudur (readRecent üst sınırı 500).
    // `limit` = sayfa boyutu; okuma penceresi daima tam tampon (500) ki
    // ?page=5 de tüm sayfaları kapsayacak kayıtla beslenebilsin.
    const perPage = Math.max(1, Math.min(parseInt(req.query.limit) || 20, 200));
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const lines = errorLogger.readRecent(500);
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
    const total = entries.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const current = Math.min(page, pages);
    res.json({
      entries: entries.slice((current - 1) * perPage, current * perPage),
      count: entries.length,
      total,
      page: current,
      pages,
    });
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

// TAM 13 in-house oyun da artık çok-kiracılı provider mimarisine taşındı
// (bkz. server/src/provider/) — ayarları doğrudan bu DB'den değil, operatör
// API anahtarıyla PUT /api/provider/v1/settings/:gameId üzerinden yönetiliyor.
// Admin panelimiz "kısayol yok" kararı gereği gelecekteki alıcıların
// kullanacağı AYNI yoldan (gerçek HTTP round-trip) geçiyor.
const PROVIDER_GAME_SHORT_IDS = {
  'inhouse-crash': 'crash',
  'inhouse-roulette': 'roulette',
  'inhouse-mines': 'mines',
  'inhouse-dice': 'dice',
  'inhouse-limbo': 'limbo',
  'inhouse-wheel': 'wheel',
  'inhouse-plinko': 'plinko',
  'inhouse-keno': 'keno',
  'inhouse-hilo': 'hilo',
  'inhouse-blackjack': 'blackjack',
  'inhouse-baccarat': 'baccarat',
  'inhouse-videopoker': 'videopoker',
  'inhouse-dragontiger': 'dragontiger',
};

export async function updateGameSettings(req, res, next) {
  try {
    if (!updateProviderGameSettings) {
      return res.status(503).json({ error: { code: 'MODULE_NOT_INSTALLED', message: 'In-house oyun provider\'ı bu kurulumda mevcut değil.' } });
    }
    const { gameId } = req.params;
    const { reason, ...updates } = req.validated;

    const shortId = PROVIDER_GAME_SHORT_IDS[gameId];
    if (!shortId) {
      return res.status(400).json({ error: { code: 'UNKNOWN_GAME', message: `Bilinmeyen oyun: ${gameId}` } });
    }
    const { settings, changes } = await updateProviderGameSettings(shortId, { ...updates, reason });
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
    if (!simulateBlackjackRtp || !simulateVideoPokerRtp) {
      return res.status(503).json({ error: { code: 'MODULE_NOT_INSTALLED', message: 'In-house oyun provider\'ı bu kurulumda mevcut değil.' } });
    }
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
    res.json({ roles: user.roles, role: user.role });
  } catch (e) { next(e); }
}

/**
 * Oturumdaki admin'in kendi izinleri. UI'ın "buna yapabilir miyim?"
 * kararını almak için gerekir (rol atama düğmesi yalnız admin:roles:write
 * olanlarda görünmeli). Tek bir 'super_admin' kontrolüyle yetmez: roller
 * farklı yetkiler veriyor.
 */
export async function getMyPermissions(req, res, next) {
  try {
    const permissions = await getUserPermissions(req.user.id);
    res.json({ permissions: permissions.map(p => p.key) });
  } catch (e) { next(e); }
}

// ─── O1 — VIP/seviye programı ───────────────────────────────────────
// services/vip.js zaten yazılmıştı (awardXp artık CasinoRound/settlement'a
// bağlı — bkz. modellerdeki not) — burada yalnızca admin CRUD ucu eklendi.
// ─── Kampanyalar/promosyonlar (Promotion) — admin CRUD ──────────────────────
// Öncesinde tek yaratım yolu tek seferlik bir script'ti; şimdi panelden
// yönetilebiliyor. list TÜM kayıtları döner (isActive:false dahil — admin
// pasif kampanyaları da görüp yeniden aktive edebilmeli), kullanıcı-yüzü
// GET /promotions ise sadece isActive:true döndürmeye devam ediyor (değişmedi).
export async function listPromotions(req, res, next) {
  try {
    const promotions = await Promotion.find().sort({ createdAt: -1 });
    res.json({ promotions });
  } catch (e) { next(e); }
}

export async function savePromotion(req, res, next) {
  try {
    const { id, ...fields } = req.validated;
    let promotion;
    if (id) {
      promotion = await Promotion.findByIdAndUpdate(id, fields, { new: true, runValidators: true });
      if (!promotion) throw createError(404, 'NOT_FOUND', 'Kampanya bulunamadı');
    } else {
      promotion = await Promotion.create(fields);
    }
    res.json({ promotion });
  } catch (e) { next(e); }
}

export async function deletePromotion(req, res, next) {
  try {
    const promotion = await Promotion.findByIdAndDelete(req.params.id);
    if (!promotion) throw createError(404, 'NOT_FOUND', 'Kampanya bulunamadı');
    res.json({ ok: true });
  } catch (e) { next(e); }
}

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

// ─── KYC Kimlik Doğrulama — admin işlemleri ───────────────────────────────
import { kycConfig } from '../config/kyc.js';
import { getAllKycSubmissions, getKycStats, approveKyc, rejectKyc, setKycUnderReview } from '../services/kyc.js';
import KycDocument from '../models/KycDocument.js';

export async function getKycSettings(req, res, next) {
  try {
    const settings = await kycConfig.getAll();
    res.json({ settings });
  } catch (e) { next(e); }
}

export async function updateKycSettings(req, res, next) {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      throw createError(400, 'INVALID_BODY', 'settings nesnesi gerekli');
    }
    for (const [key, value] of Object.entries(settings)) {
      await kycConfig.set(key, value, req.user.id);
    }
    res.json({ settings: await kycConfig.getAll() });
  } catch (e) { next(e); }
}

export async function testKycConnection(req, res, next) {
  try {
    const provider = await kycConfig.get('KYC_PROVIDER');
    if (provider !== 'sumsub') throw createError(400, 'NOT_SUMSUB', 'Provider Sumsub değil');
    const appToken = await kycConfig.get('SUMSUB_APP_TOKEN');
    if (!appToken) throw createError(400, 'NO_TOKEN', 'App Token tanımlı değil');
    res.json({ ok: true, provider });
  } catch (e) { next(e); }
}

export async function getKycSubmissions(req, res, next) {
  try {
    const { status, page, limit, search } = req.query;
    const result = await getAllKycSubmissions({ status, page, limit, search });
    res.json(result);
  } catch (e) { next(e); }
}

export async function getKycSubmissionDetail(req, res, next) {
  try {
    const user = await User.findById(req.params.id)
      .select('username email kycStatus kycSubmittedAt kycApprovedAt kycRejectedAt kycRejectionReason kycVerified kycProvider');
    if (!user) throw createError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı');

    const documents = await KycDocument.find({ userId: req.params.id })
      .sort({ createdAt: -1 })
      .select('documentType fileName fileSize mimeType fileUrl status reviewedBy reviewedAt rejectionReason metadata createdAt');

    res.json({ user, documents });
  } catch (e) { next(e); }
}

export async function approveKycSubmission(req, res, next) {
  try {
    const user = await approveKyc(req.params.id, req.user.id, { notes: req.body.notes || '' });
    broadcastAdminCounts();
    res.json({ user: user.toSafeObject() });
  } catch (e) { next(e); }
}

export async function rejectKycSubmission(req, res, next) {
  try {
    if (!req.body.reason) throw createError(400, 'REASON_REQUIRED', 'Red sebebi gerekli');
    const user = await rejectKyc(req.params.id, req.user.id, req.body.reason);
    broadcastAdminCounts();
    res.json({ user: user.toSafeObject() });
  } catch (e) { next(e); }
}

export async function setKycSubmissionUnderReview(req, res, next) {
  try {
    const user = await setKycUnderReview(req.params.id, req.user.id);
    res.json({ user: user.toSafeObject() });
  } catch (e) { next(e); }
}

export async function getKycStatsAdmin(req, res, next) {
  try {
    const stats = await getKycStats();
    res.json(stats);
  } catch (e) { next(e); }
}

// ─── Crypto Ödeme Ağ Geçidi — admin işlemleri ───────────────────────────────
import CryptoDeposit from '../models/CryptoDeposit.js';
import BankDepositRequest from '../models/BankDepositRequest.js';
import { CRYPTO_SETTINGS } from '../config/crypto.js';
import { transferUSDT, getHotWalletBalance } from '../services/cryptoService.js';

export async function getCryptoPendingDeposits(req, res, next) {
  try {
    const deposits = await CryptoDeposit.find({ status: 'pending_approval' })
      .populate('userId', 'username email')
      .sort({ createdAt: -1 });
    res.json(deposits);
  } catch (e) { next(e); }
}

export async function getCryptoPendingWithdrawals(req, res, next) {
  try {
    const withdrawals = await Transaction.find({ type: 'crypto_withdraw', status: 'pending' })
      .populate('userId', 'username email')
      .sort({ createdAt: -1 });
    res.json(withdrawals);
  } catch (e) { next(e); }
}

export async function getAllCryptoDeposits(req, res, next) {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = { type: 'crypto_deposit' };
    if (status) filter.status = status;
    const skip = (+page - 1) * +limit;
    const [transactions, total] = await Promise.all([
      Transaction.find(filter).populate('userId', 'username email').sort({ createdAt: -1 }).skip(skip).limit(+limit),
      Transaction.countDocuments(filter),
    ]);
    res.json({ transactions, total, page: +page, limit: +limit });
  } catch (e) { next(e); }
}

export async function getAllCryptoWithdrawals(req, res, next) {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = { type: 'crypto_withdraw' };
    if (status) filter.status = status;
    const skip = (+page - 1) * +limit;
    const [transactions, total] = await Promise.all([
      Transaction.find(filter).populate('userId', 'username email').sort({ createdAt: -1 }).skip(skip).limit(+limit),
      Transaction.countDocuments(filter),
    ]);
    res.json({ transactions, total, page: +page, limit: +limit });
  } catch (e) { next(e); }
}

/**
 * GET /admin/crypto/stats — Wallet → Crypto özet kartları.
 * Yatırma/çekim toplamı yalnız tamamlanmış kayıtlar; çekim iadesi (pozitif tutarlı
 * crypto_withdraw kaydı) çekim sayılmaz. `count` iade kayıtları hariç tüm kayıtlar.
 */
export async function getCryptoStats(req, res, next) {
  try {
    const withdrawFilter = { type: 'crypto_withdraw', amount: { $lt: 0 } };
    const [deposits, payouts, depositCount, payoutCount] = await Promise.all([
      Transaction.aggregate([
        { $match: { type: 'crypto_deposit', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Transaction.aggregate([
        { $match: { ...withdrawFilter, status: 'completed' } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ]),
      Transaction.countDocuments({ type: 'crypto_deposit' }),
      Transaction.countDocuments(withdrawFilter),
    ]);
    const depositsTotal = deposits[0]?.total || 0;
    const payoutsTotal = payouts[0]?.total || 0;
    res.json({
      deposits: { total: depositsTotal, count: depositCount },
      payouts: { total: payoutsTotal, count: payoutCount },
      net: depositsTotal - payoutsTotal,
      count: depositCount + payoutCount,
    });
  } catch (e) { next(e); }
}

/**
 * GET /admin/bank/stats — Wallet → Bank özet kartları.
 * Toplamlar yalnız onaylanmış (approved) talepler; `count` tüm talepler.
 */
export async function getBankStats(req, res, next) {
  try {
    const groups = await BankDepositRequest.aggregate([
      { $group: { _id: { type: '$type', status: '$status' }, count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]);
    const sum = (type, onlyApproved) => groups
      .filter(g => g._id.type === type && (!onlyApproved || g._id.status === 'approved'))
      .reduce((acc, g) => ({ total: acc.total + g.total, count: acc.count + g.count }), { total: 0, count: 0 });
    const depositsApproved = sum('deposit', true);
    const payoutsApproved = sum('withdraw', true);
    res.json({
      deposits: { total: depositsApproved.total, count: sum('deposit', false).count },
      payouts: { total: payoutsApproved.total, count: sum('withdraw', false).count },
      net: depositsApproved.total - payoutsApproved.total,
      count: groups.reduce((acc, g) => acc + g.count, 0),
    });
  } catch (e) { next(e); }
}

export async function getCryptoTxDetail(req, res, next) {
  try {
    const tx = await Transaction.findById(req.params.id).populate('userId', 'username email balance bonusBalance');
    if (!tx) return res.status(404).json({ error: 'İşlem bulunamadı' });

    const user = await User.findById(tx.userId._id).select('username email balance bonusBalance');
    const locked = await (await import('../services/wagering.js')).getLockedAmount(user._id);
    const withdrawable = Math.max(0, parseFloat((user.balance - locked).toFixed(2)));

    const wagerings = await (await import('../models/BonusWagering.js')).default.find({
      userId: user._id, status: 'active',
    }).select('bonusAmount wageringRequired wageringProgress');

    let cryptoDeposit = null;
    if (tx.type === 'crypto_deposit') {
      cryptoDeposit = tx.cryptoDepositId
        ? await CryptoDeposit.findById(tx.cryptoDepositId)
        : await CryptoDeposit.findOne({ userId: user._id, status: { $in: ['pending_approval', 'credited'] } }).sort({ createdAt: -1 });
    }

    // Hot wallet bakiyesi (çekim pending ise)
    let hotWallet = null;
    if (tx.type === 'crypto_withdraw' && tx.status === 'pending') {
      try {
        const { getHotWalletBalance } = await import('../services/cryptoService.js');
        hotWallet = await getHotWalletBalance();
      } catch { hotWallet = null; }
    }

    // Yatırma adresi bakiyesi (yatırım pending ise — blockchain'den doğrulama)
    let depositWallet = null;
    if (tx.type === 'crypto_deposit' && tx.status === 'pending' && cryptoDeposit?.toAddress) {
      try {
        const { getWalletBalance } = await import('../services/cryptoService.js');
        depositWallet = await getWalletBalance(cryptoDeposit.toAddress);
      } catch { depositWallet = null; }
    }

    res.json({
      transaction: tx,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        bonusLocked: locked,
        withdrawable,
        activeWagerings: wagerings,
      },
      cryptoDeposit,
      hotWallet,
      depositWallet,
    });
    broadcastAdminCounts();
  } catch (e) { next(e); }
}

/**
 * GET /admin/crypto/tx-verify/:txHash — Blockchain'de txHash doğrulaması
 */
export async function verifyCryptoTx(req, res, next) {
  try {
    const { txHash } = req.params;
    if (!txHash || txHash.length < 10) {
      return res.status(400).json({ error: 'Geçersiz txHash' });
    }

    const { getNetworkConfig } = await import('../services/cryptoService.js');
    const cfg = getNetworkConfig();

    const resp = await fetch(`${cfg.tronGrid}/v1/transactions/${txHash}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      return res.json({ confirmed: false, found: false, error: `TronGrid: ${resp.status}` });
    }

    const data = await resp.json();
    const tx = data.data?.[0];

    if (!tx) {
      return res.json({ confirmed: false, found: false });
    }

    const contractRet = tx.ret?.[0]?.contractRet;
    const blockNumber = tx.block_number;
    const confirmed = contractRet === 'SUCCESS';

    res.json({
      confirmed,
      found: true,
      blockNumber,
      contractRet,
      energyUsed: tx.energy_usage_total,
      timestamp: tx.raw_data?.timestamp,
    });
  } catch (e) { next(e); }
}

export async function updateCryptoSettings(req, res, next) {
  try {
    const { deposit, withdraw, usdtTryRate, network } = req.body;
    if (deposit) {
      CRYPTO_SETTINGS.deposit.autoCreditLimit = deposit.autoCreditLimit ?? CRYPTO_SETTINGS.deposit.autoCreditLimit;
      CRYPTO_SETTINGS.deposit.requireApprovalAbove = deposit.requireApprovalAbove ?? CRYPTO_SETTINGS.deposit.requireApprovalAbove;
    }
    if (withdraw) {
      CRYPTO_SETTINGS.withdraw.autoProcessLimit = withdraw.autoProcessLimit ?? CRYPTO_SETTINGS.withdraw.autoProcessLimit;
      CRYPTO_SETTINGS.withdraw.requireApprovalAbove = withdraw.requireApprovalAbove ?? CRYPTO_SETTINGS.withdraw.requireApprovalAbove;
    }
    if (usdtTryRate !== undefined) {
      CRYPTO_SETTINGS.usdtTryRate = Math.max(0, Number(usdtTryRate) || 1);
    }
    if (network && ['mainnet', 'shasta', 'nile'].includes(network)) {
      CRYPTO_SETTINGS.network = network;
    }
    res.json(CRYPTO_SETTINGS);
  } catch (e) { next(e); }
}

export async function approveCryptoDeposit(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const result = await withTransactionRetry(session, async () => {
      const tx = await Transaction.findById(req.params.id).session(session);
      if (!tx || tx.type !== 'crypto_deposit') return { status: 404, body: { error: 'Yatırma bulunamadı' } };
      if (tx.status !== 'pending') return { status: 400, body: { error: 'Bu yatırma zaten işlenmiş' } };

      const deposit = tx.cryptoDepositId
        ? await CryptoDeposit.findById(tx.cryptoDepositId).session(session)
        : await CryptoDeposit.findOne({ userId: tx.userId, status: 'pending_approval' }).sort({ createdAt: -1 }).session(session);
      if (!deposit) return { status: 404, body: { error: 'Yatırma detayı bulunamadı' } };
      if (deposit.status !== 'pending_approval') return { status: 400, body: { error: 'Bu yatırma zaten işlenmiş' } };

      const user = await User.findById(deposit.userId).session(session);
      const balBefore = user.balance;
      user.balance = +(user.balance + deposit.creditedTRY).toFixed(2);
      await user.save({ session });

      tx.status = 'completed';
      tx.balanceAfter = user.balance;
      tx.note = `USDT TRC20 ${deposit.usdtAmount} USDT — Admin onayı ile eklendi`;
      await tx.save({ session });

      deposit.status = 'credited';
      deposit.creditedAt = new Date();
      await deposit.save({ session });

      return { status: 200, body: { ok: true, newBalance: user.balance }, _rg: { userId: deposit.userId, amount: deposit.creditedTRY } };
    });
    if (result.status === 200 && result._rg) {
      await updateDailyStats(result._rg.userId, 'deposit', result._rg.amount).catch((e) => {
        console.error('[RG] updateDailyStats (admin crypto deposit) failed:', e.message);
      });
    }
    res.status(result.status).json(
      result.status === 200 ? { ok: result.body.ok, newBalance: result.body.newBalance } : result.body
    );
  } catch (e) {
    next(e);
  } finally {
    session.endSession();
  }
}

export async function rejectCryptoDeposit(req, res, next) {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx || tx.type !== 'crypto_deposit') return res.status(404).json({ error: 'Yatırma bulunamadı' });
    if (tx.status !== 'pending') return res.status(400).json({ error: 'Bu yatırma zaten işlenmiş' });

    const deposit = tx.cryptoDepositId
      ? await CryptoDeposit.findById(tx.cryptoDepositId)
      : await CryptoDeposit.findOne({ userId: tx.userId, status: 'pending_approval' }).sort({ createdAt: -1 });
    if (!deposit) return res.status(404).json({ error: 'Yatırma detayı bulunamadı' });

    deposit.status = 'rejected';
    await deposit.save();

    tx.status = 'rejected';
    tx.note = (tx.note || '') + '— Reddedildi';
    await tx.save();

    broadcastAdminCounts();
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function approveCryptoWithdrawal(req, res, next) {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Çekim bulunamadı' });
    if (tx.status !== 'pending') return res.status(400).json({ error: 'Bu çekim zaten işlenmiş' });

    // Demo kaydı: zincire ASLA gitme (gerçek transferUSDT hot wallet'tan para gönderir).
    if (tx.isSeed) {
      tx.status = 'completed';
      tx.note = `${tx.note} — demo kaydı, zincir transferi yapılmadı`;
      await tx.save();
      broadcastAdminCounts();
      return res.json({ ok: true, txHash: null, demo: true });
    }

    // Adres/miktar metadata'dan; eski kayıtlar (metadata öncesi) için nottan.
    const meta = tx.metadata || {};
    const addrMatch = tx.note?.match(/→ ([T][A-Za-z0-9]{33})/);
    const amtMatch = tx.note?.match(/([\d.]+) USDT/);
    const toAddress = meta.toAddress || addrMatch?.[1];
    const usdtAmount = Number(meta.usdtAmount ?? (amtMatch ? parseFloat(amtMatch[1]) : NaN));
    if (!toAddress || !/^T[A-Za-z0-9]{33}$/.test(toAddress) || !Number.isFinite(usdtAmount) || usdtAmount <= 0) {
      return res.status(400).json({ error: 'Çekim detayları okunamadı' });
    }

    const result = await transferUSDT(toAddress, usdtAmount);
    if (!result.success) return res.status(500).json({ error: `Transfer başarısız: ${result.error}` });

    tx.status = 'completed';
    tx.note = `${tx.note} — txHash: ${result.txHash}`;
    tx.metadata = { ...meta, toAddress, usdtAmount, txHash: result.txHash };
    tx.markModified('metadata');
    await tx.save();

    broadcastAdminCounts();
    res.json({ ok: true, txHash: result.txHash });
  } catch (e) { next(e); }
}

export async function rejectCryptoWithdrawal(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const result = await withTransactionRetry(session, async () => {
      const tx = await Transaction.findById(req.params.id).session(session);
      if (!tx) return { status: 404, body: { error: 'Çekim bulunamadı' } };
      if (tx.status !== 'pending') return { status: 400, body: { error: 'Bu çekim zaten işlenmiş' } };

      // Bakiyeyi iade et
      const user = await User.findById(tx.userId).session(session);
      const refundAmount = Math.abs(tx.amount);
      const balBefore = user.balance;
      user.balance = +(user.balance + refundAmount).toFixed(2);
      await user.save({ session });

      await createTransaction({
        userId: user._id,
        type: 'crypto_withdraw',
        amount: refundAmount,
        balanceBefore: balBefore,
        balanceAfter: user.balance,
        note: 'Çekim reddedildi — bakiye iade edildi',
        status: 'completed',
        idempotencyKey: `crypto_withdraw_reject_${tx._id}`,
        source: 'admin',
      }, { session });

      tx.status = 'rejected';
      tx.note = `${tx.note} — Reddedildi, bakiye iade edildi`;
      await tx.save({ session });

      const result = { status: 200, body: { ok: true, newBalance: user.balance } };
      broadcastAdminCounts();
      return result;
    });
    res.status(result.status).json(result.body);
  } catch (e) {
    next(e);
  } finally {
    session.endSession();
  }
}

// ─── Referans Komisyonu Ayarları — admin işlemleri ────────────────────────────
import { REFERRAL_SETTINGS } from '../config/referral.js';

export function getReferralSettings(_req, res) {
  res.json(REFERRAL_SETTINGS);
}

export function updateReferralSettings(req, res, next) {
  try {
    const { enabled, commissionRate } = req.body ?? {};

    if (typeof enabled === 'boolean') {
      REFERRAL_SETTINGS.enabled = enabled;
    }

    if (commissionRate !== undefined) {
      const rate = Number(commissionRate);
      if (Number.isNaN(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ error: 'Komisyon oranı 0-100 arasında olmalı' });
      }
      REFERRAL_SETTINGS.commissionRate = rate;
    }

    res.json(REFERRAL_SETTINGS);
  } catch (e) { next(e); }
}

// ─── Canlı aktivite akışı (admin dashboard ilk sayfa) ──────────────────────
import ActivityEvent from '../models/ActivityEvent.js';

export async function getAdminQueueCounts(req, res, next) {
  try {
    res.json(await getAdminCounts());
  } catch (e) { next(e); }
}

export async function listActivity(req, res, next) {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (type) filter.type = type;
    const pageNum = Math.max(1, Math.floor(Number(page) || 1));
    const limitNum = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
    const skip = (pageNum - 1) * limitNum;

    const [events, total] = await Promise.all([
      ActivityEvent.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).populate('userId', 'username'),
      ActivityEvent.countDocuments(filter),
    ]);

    res.json({ events, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (e) { next(e); }
}

const DEMO_DATA_LIVE_CONFIG_KEY = 'demoData.live.config';

export async function getDemoDataStatus(req, res, next) {
  try {
    const categories = await demoDataRegistry.getStatus();
    const row = await Setting.findOne({ key: DEMO_DATA_LIVE_CONFIG_KEY }).lean();
    const live = row?.value ? JSON.parse(row.value) : { enabled: false, tickIntervalMinutes: 2 };
    res.json({ categories, live });
  } catch (e) { next(e); }
}

export async function loadDemoDataCategory(req, res, next) {
  try {
    const { category } = req.params;
    if (!demoDataRegistry.isValidCategory(category)) {
      return res.status(400).json({ error: 'INVALID_CATEGORY' });
    }
    const count = Math.max(1, Math.min(10000, parseInt(req.body?.count, 10) || 0));
    const result = await demoDataRegistry.loadCategory(category, count);
    res.json(result);
  } catch (e) { next(e); }
}

export async function clearDemoDataCategory(req, res, next) {
  try {
    const { category } = req.params;
    if (!demoDataRegistry.isValidCategory(category)) {
      return res.status(400).json({ error: 'INVALID_CATEGORY' });
    }
    const result = await demoDataRegistry.clearCategory(category);
    res.json(result);
  } catch (e) { next(e); }
}

export async function startDemoDataLive(req, res, next) {
  try {
    // Spec §Güvenlik: canlı simülasyon en az 1 seed kullanıcı varken başlayabilir.
    if (await User.countDocuments({ isSeed: true }) === 0) {
      return res.status(400).json({ error: 'NO_SEED_USERS' });
    }
    const tickIntervalMinutes = Math.max(1, Math.min(60, parseInt(req.body?.tickIntervalMinutes, 10) || 2));
    await Setting.findOneAndUpdate(
      { key: DEMO_DATA_LIVE_CONFIG_KEY },
      { key: DEMO_DATA_LIVE_CONFIG_KEY, value: JSON.stringify({ enabled: true, tickIntervalMinutes }) },
      { upsert: true },
    );
    const { startDemoDataLiveJob } = await import('../jobs/demoDataLiveSimulation.js');
    startDemoDataLiveJob(tickIntervalMinutes * 60 * 1000);
    res.json({ enabled: true, tickIntervalMinutes });
  } catch (e) { next(e); }
}

export async function stopDemoDataLive(req, res, next) {
  try {
    await Setting.findOneAndUpdate(
      { key: DEMO_DATA_LIVE_CONFIG_KEY },
      { key: DEMO_DATA_LIVE_CONFIG_KEY, value: JSON.stringify({ enabled: false, tickIntervalMinutes: 2 }) },
      { upsert: true },
    );
    const { stopDemoDataLiveJob } = await import('../jobs/demoDataLiveSimulation.js');
    stopDemoDataLiveJob();
    res.json({ enabled: false });
  } catch (e) { next(e); }
}
