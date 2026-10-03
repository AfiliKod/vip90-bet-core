/**
 * Responsible Gaming Service (Phase 2C)
 *
 * Provides server-side enforcement for responsible gaming limits,
 * cool-off periods, self-exclusion, and account restrictions.
 */
import mongoose from 'mongoose';
import escapeStringRegexp from 'escape-string-regexp';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { createTransaction } from './ledger.js';
import { logAuditEvent } from './audit.js';

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Pazar
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Pazartesi'ye çek
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthStart(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Check player eligibility for a specific action.
 *
 * @param {String} playerId - Player ID
 * @param {String} action - Action type (deposit, withdraw, bet, play)
 * @param {Object} context - Additional context (amount, etc.)
 * @returns {String} ALLOW, RESTRICT, or BLOCK
 */
export async function checkPlayerEligibility(playerId, action, context = {}) {
  const user = await User.findById(playerId);
  if (!user) return 'BLOCK';

  // Check if account is restricted
  if (user.accountRestricted) {
    return 'BLOCK';
  }

  // Check self-exclusion
  if (user.responsibleLimits.selfExclusionUntil && user.responsibleLimits.selfExclusionUntil > new Date()) {
    return 'BLOCK';
  }

  // Check cool-off period
  if (user.responsibleLimits.coolOffUntil && user.responsibleLimits.coolOffUntil > new Date()) {
    return 'BLOCK';
  }

  // Check limits based on action
  const { amount = 0 } = context;

  switch (action) {
    case 'deposit':
      return checkDepositLimits(user, amount);
    case 'withdraw':
      return checkWithdrawLimits(user, amount);
    case 'bet':
      return checkBetLimits(user, amount);
    case 'play':
      return checkSessionLimits(user);
    default:
      return 'ALLOW';
  }
}

/**
 * `updateDailyStats`'ın yazma-tarafı periyot reset'i (satır ~346-357) yalnızca
 * bir sonraki `updateDailyStats` çağrısında tetiklenir — okuma tarafında
 * (limit kontrolleri) periyodun gerçekten dönüp dönmediğine bakılmazsa,
 * dünün sayaçları bugün de "aşılmış" görünmeye devam eder ve kullanıcı hiçbir
 * yeni işlem yapamadan (deposit/bet/play) kilitli kalır — kilidi açacak tek
 * yol da zaten engellenen bir işlem olduğu için kendi kendini besleyen bir
 * döngü oluşur. Bu üç fonksiyon, ancak GERÇEKTEN geçmiş bir periyoda ait
 * (lastUpdated/weekStart/monthStart set edilmiş VE eski) sayaçları sıfırlar;
 * hiç set edilmemiş (null) damga "henüz hiç kullanılmamış" anlamına gelir ve
 * mevcut değer olduğu gibi güvenilir sayılır (ör. doğrudan seed edilmiş test/
 * migration verisi).
 */
function effectiveDailyStats(user) {
  const daily = user.dailyStats || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (daily.lastUpdated && daily.lastUpdated < today) return {};
  return daily;
}

function effectiveWeeklyStats(user) {
  const weekly = user.weeklyStats || {};
  if (weekly.weekStart && weekly.weekStart < getWeekStart()) return {};
  return weekly;
}

function effectiveMonthlyStats(user) {
  const monthly = user.monthlyStats || {};
  if (monthly.monthStart && monthly.monthStart < getMonthStart()) return {};
  return monthly;
}

/**
 * Check deposit limits.
 */
function checkDepositLimits(user, amount) {
  const limits = user.responsibleLimits;
  const daily = effectiveDailyStats(user);
  const weekly = effectiveWeeklyStats(user);
  const monthly = effectiveMonthlyStats(user);

  if (limits.depositDaily && (daily.deposits || 0) + amount > limits.depositDaily) return 'RESTRICT';
  if (limits.depositWeekly && (weekly.deposits || 0) + amount > limits.depositWeekly) return 'RESTRICT';
  if (limits.depositMonthly && (monthly.deposits || 0) + amount > limits.depositMonthly) return 'RESTRICT';

  return 'ALLOW';
}

/**
 * Check withdrawal limits.
 */
function checkWithdrawLimits(user, amount) {
  // Withdrawal limits are typically not restricted by responsible gaming
  // but we can add them if needed
  return 'ALLOW';
}

/**
 * Check bet limits.
 */
function checkBetLimits(user, amount) {
  const limits = user.responsibleLimits;
  const daily = effectiveDailyStats(user);
  const weekly = effectiveWeeklyStats(user);
  const monthly = effectiveMonthlyStats(user);

  if (limits.wagerDaily && (daily.wagers || 0) + amount > limits.wagerDaily) return 'RESTRICT';
  if (limits.wagerWeekly && (weekly.wagers || 0) + amount > limits.wagerWeekly) return 'RESTRICT';
  if (limits.wagerMonthly && (monthly.wagers || 0) + amount > limits.wagerMonthly) return 'RESTRICT';

  return checkLossLimits(user);
}

/**
 * Check accumulated loss limits (daily/weekly/monthly).
 *
 * Projeksiyon değil, ZATEN BİRİKMİŞ kayıp kontrol edilir — bir bahsin/spin'in
 * kaybedip kaybetmeyeceği önceden bilinemez. Periyot içinde `losses` negatife
 * düşebilir (Igames'in kötümser-varsayım deseninde bir kazanç birikmiş kaybı
 * aşarsa) — bu DOĞRU bir durumdur (oyuncu net kârdayken kısıtlanmamalı), bu
 * yüzden burada sıfıra kırpma YAPILMAZ. `effective*Stats` zaten stale/eski
 * periyot verisini okumadan önce sıfırladığı için bir periyodun negatifliği
 * bir SONRAKİ periyoda taşınmaz.
 */
function checkLossLimits(user) {
  const limits = user.responsibleLimits;
  const daily = effectiveDailyStats(user);
  const weekly = effectiveWeeklyStats(user);
  const monthly = effectiveMonthlyStats(user);

  if (limits.lossDaily && (daily.losses || 0) >= limits.lossDaily) return 'RESTRICT';
  if (limits.lossWeekly && (weekly.losses || 0) >= limits.lossWeekly) return 'RESTRICT';
  if (limits.lossMonthly && (monthly.losses || 0) >= limits.lossMonthly) return 'RESTRICT';

  return 'ALLOW';
}

/**
 * Check session limits.
 *
 * Session timeout takibi frontend'e bırakılmış durumda; burada asıl kontrol
 * edilen, bir casino oturumu başlatılmadan/devam ettirilmeden ÖNCE birikmiş
 * kayıp limitinin aşılıp aşılmadığı (3. parti casino — Igames/inhouse — bahis
 * bazlı 'bet' action'ını kullanmaz, oturum başına 'play' action'ını kullanır).
 */
function checkSessionLimits(user) {
  return checkLossLimits(user);
}

/**
 * Set deposit limit for a user.
 *
 * @param {String} userId - User ID
 * @param {String} limitType - Limit type (daily, weekly, monthly)
 * @param {Number} amount - Limit amount
 * @returns {Object} Updated limits
 */
export async function setDepositLimit(userId, limitType, amount) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const type = limitType || 'daily';
  const field = `responsibleLimits.deposit${type.charAt(0).toUpperCase() + type.slice(1)}`;
  user.set(field, amount);
  await user.save();

  return user.responsibleLimits;
}

/**
 * Set loss limit for a user.
 *
 * @param {String} userId - User ID
 * @param {String} limitType - Limit type (daily, weekly, monthly)
 * @param {Number} amount - Limit amount
 * @returns {Object} Updated limits
 */
export async function setLossLimit(userId, limitType, amount) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const type = limitType || 'daily';
  const field = `responsibleLimits.loss${type.charAt(0).toUpperCase() + type.slice(1)}`;
  user.set(field, amount);
  await user.save();

  return user.responsibleLimits;
}

/**
 * Set wager limit for a user.
 *
 * @param {String} userId - User ID
 * @param {String} limitType - Limit type (daily, weekly, monthly)
 * @param {Number} amount - Limit amount
 * @returns {Object} Updated limits
 */
export async function setWagerLimit(userId, limitType, amount) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const type = limitType || 'daily';
  const field = `responsibleLimits.wager${type.charAt(0).toUpperCase() + type.slice(1)}`;
  user.set(field, amount);
  await user.save();

  return user.responsibleLimits;
}

/**
 * Set session limit for a user.
 *
 * @param {String} userId - User ID
 * @param {Number} minutes - Session timeout in minutes
 * @returns {Object} Updated limits
 */
export async function setSessionLimit(userId, minutes) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  user.responsibleLimits.sessionTimeoutMin = minutes;
  await user.save();

  return user.responsibleLimits;
}

/**
 * Activate cool-off period for a user.
 *
 * @param {String} userId - User ID
 * @param {Number} duration - Duration in hours
 * @param {String} reason - Reason for cool-off
 * @returns {Object} Updated user
 */
export async function activateCoolOff(userId, duration, reason = '') {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  user.responsibleLimits.coolOffUntil = new Date(Date.now() + duration * 60 * 60 * 1000);
  user.responsibleLimits.coolOffReason = reason;
  await user.save();

  return user;
}

/**
 * Activate self-exclusion for a user.
 *
 * @param {String} userId - User ID
 * @param {Date} until - Exclusion end date
 * @param {String} reason - Reason for self-exclusion
 * @returns {Object} Updated user
 */
export async function activateSelfExclusion(userId, until, reason = '') {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  user.responsibleLimits.selfExclusionUntil = until;
  await user.save();

  return user;
}

/**
 * Restrict a user account.
 *
 * @param {String} userId - User ID
 * @param {String} reason - Reason for restriction
 * @param {String} adminId - Admin who restricted
 * @returns {Object} Updated user
 */
export async function restrictAccount(userId, reason, adminId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  user.accountRestricted = true;
  user.restrictionReason = reason;
  user.restrictedBy = adminId;
  user.restrictedAt = new Date();
  await user.save();

  await logAuditEvent({
    actorId: adminId,
    actorType: 'admin',
    actorUsername: String(adminId),
    action: 'RESPONSIBLE_GAMING_RESTRICT',
    category: 'responsible_gaming',
    targetType: 'user',
    targetId: userId,
    reason,
  }).catch((e) => console.error('[audit] restrictAccount log failed:', e.message));

  return user;
}

/**
 * Lift account restriction.
 *
 * @param {String} userId - User ID
 * @param {String} adminId - Admin who lifted restriction
 * @returns {Object} Updated user
 */
export async function liftRestriction(userId, adminId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  user.accountRestricted = false;
  user.restrictionReason = '';
  user.restrictedBy = null;
  user.restrictedAt = null;
  await user.save();

  await logAuditEvent({
    actorId: adminId,
    actorType: 'admin',
    actorUsername: String(adminId),
    action: 'RESPONSIBLE_GAMING_LIFT',
    category: 'responsible_gaming',
    targetType: 'user',
    targetId: userId,
  }).catch((e) => console.error('[audit] liftRestriction log failed:', e.message));

  return user;
}

/**
 * Update daily stats for a user.
 * This should be called after each deposit, bet, or loss.
 *
 * @param {String} userId - User ID
 * @param {String} type - Stats type (deposit, loss, wager)
 * @param {Number} amount - Amount to add
 * @returns {Object} Updated stats
 */
export async function updateDailyStats(userId, type, amount) {
  const field = type === 'deposit' ? 'deposits' : type === 'loss' ? 'losses' : type === 'wager' ? 'wagers' : null;
  if (!field) throw new Error(`Invalid stat type: ${type}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = getWeekStart();
  const monthStart = getMonthStart();

  // Atomik periyot resetleri — okuma yok, sunucu tarafında koşullu $set.
  // Eşzamanlı iki istek de "eski periyot" görse bile, ikincisinin filtresi
  // birincinin update'i uygulandıktan sonra tekrar değerlendirilir ve artık
  // eşleşmez (no-op) — resetler idempotent olduğu için veri kaybı olmaz.
  await User.updateOne(
    { _id: userId, $or: [{ 'dailyStats.lastUpdated': { $lt: today } }, { 'dailyStats.lastUpdated': null }] },
    { $set: { 'dailyStats.deposits': 0, 'dailyStats.losses': 0, 'dailyStats.wagers': 0 } },
  );
  await User.updateOne(
    { _id: userId, $or: [{ 'weeklyStats.weekStart': { $lt: weekStart } }, { 'weeklyStats.weekStart': null }] },
    { $set: { 'weeklyStats.deposits': 0, 'weeklyStats.losses': 0, 'weeklyStats.wagers': 0, 'weeklyStats.weekStart': weekStart } },
  );
  await User.updateOne(
    { _id: userId, $or: [{ 'monthlyStats.monthStart': { $lt: monthStart } }, { 'monthlyStats.monthStart': null }] },
    { $set: { 'monthlyStats.deposits': 0, 'monthlyStats.losses': 0, 'monthlyStats.wagers': 0, 'monthlyStats.monthStart': monthStart } },
  );

  // Artış her zaman atomik $inc — resetlerden bağımsız olarak asla kaybolmaz.
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $inc: {
        [`dailyStats.${field}`]: amount,
        [`weeklyStats.${field}`]: amount,
        [`monthlyStats.${field}`]: amount,
      },
      $set: { 'dailyStats.lastUpdated': new Date() },
    },
    { new: true },
  );
  if (!user) throw new Error('User not found');

  return { daily: user.dailyStats, weekly: user.weeklyStats, monthly: user.monthlyStats };
}

/**
 * Get player's responsible gaming status.
 *
 * @param {String} userId - User ID
 * @returns {Object} Responsible gaming status
 */
export async function getPlayerResponsibleGamingStatus(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const now = new Date();
  const isCoolingOff = user.responsibleLimits.coolOffUntil && user.responsibleLimits.coolOffUntil > now;
  const isSelfExcluded = user.responsibleLimits.selfExclusionUntil && user.responsibleLimits.selfExclusionUntil > now;

  return {
    limits: user.responsibleLimits,
    dailyStats: user.dailyStats,
    weeklyStats: user.weeklyStats,
    monthlyStats: user.monthlyStats,
    isCoolingOff,
    isSelfExcluded,
    isRestricted: user.accountRestricted,
    restrictionReason: user.restrictionReason,
  };
}

/**
 * Get all restricted players (admin function).
 *
 * @param {Object} filters - Filter options
 * @returns {Object} Paginated restricted players
 */
export async function getRestrictedPlayers(filters = {}) {
  const { page = 1, limit = 20, type = 'all', search = '' } = filters;
  const skip = (Number(page) - 1) * Number(limit);

  // Client alt çizgili (self_exclusion/cool_off/loss_limit/wager_limit),
  // switch alt çizgisiz bekliyordu — ikisini de normalize et
  const normalizedType = String(type).toLowerCase().replace(/_/g, '');

  let query = {};
  const now = new Date();

  switch (normalizedType) {
    case 'restricted':
      query = { accountRestricted: true };
      break;
    case 'cooloff':
      query = { 'responsibleLimits.coolOffUntil': { $gt: now } };
      break;
    case 'selfexclusion':
      query = { 'responsibleLimits.selfExclusionUntil': { $gt: now } };
      break;
    case 'losslimit':
      query = { 'responsibleLimits.lossDaily': { $gt: 0 } };
      break;
    case 'wagerlimit':
      query = { 'responsibleLimits.wagerDaily': { $gt: 0 } };
      break;
    default:
      query = {
        $or: [
          { accountRestricted: true },
          { 'responsibleLimits.coolOffUntil': { $gt: now } },
          { 'responsibleLimits.selfExclusionUntil': { $gt: now } },
          { 'responsibleLimits.lossDaily': { $gt: 0 } },
          { 'responsibleLimits.wagerDaily': { $gt: 0 } },
        ],
      };
  }

  // Kullanıcı araması: client `search` gönderiyordu ama servis desteklemiyordu —
  // filtre kutusu sessizce hiçbir şey yapmıyordu. type sorgusuyla AND'lenir.
  const trimmed = typeof search === 'string' ? search.trim() : '';
  if (trimmed) {
    const re = new RegExp(escapeStringRegexp(trimmed), 'i');
    query = { ...query, $and: [{ $or: [{ username: re }, { email: re }] }] };
  }

  const [players, total] = await Promise.all([
    User.find(query)
      .select('username email accountRestricted restrictionReason restrictedAt responsibleLimits')
      .sort({ restrictedAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(query),
  ]);

  const pages = Math.ceil(total / Number(limit));
  return {
    players,
    total,
    page: Number(page),
    pages,
    // Client data.totalPages okuyordu — ikisini de döndür
    totalPages: pages,
  };
}
