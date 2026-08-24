import crypto from 'crypto';
import User from '../models/User.js';
import { getIO } from './socketEmitter.js';
import { signAccess } from '../controllers/auth.js';

/**
 * Bot Service — AI oyuncu botları.
 *
 * P3 mimari kararı: botlar `Bot` koleksiyonunda AYRI kayıtlar DEĞİL,
 * `User` koleksiyonunda `isBot:true` bayraklı GERÇEK kullanıcılardır.
 * `executeBotBet` gerçek oyun matematiğini ikinci kez yazmak yerine, bot
 * için imzalanmış kısa ömürlü bir JWT ile kendi sunucusuna (routes/
 * inhouse.js) dahili bir HTTP isteği atar — böylece bot, gerçek bir
 * oyuncunun kullandığı AYNI kodu, AYNI RTP ayarlarıyla kullanır.
 *
 * (Önceki tasarımda `Bot.balance` şemada hiç tanımlı değildi ve
 * `executeBotBet` gerçek oyunlara hiç bağlanmadan %50/%50 sahte bir
 * sonuç üretiyordu — NaN bakiye bug'ı içeriyordu, hiçbir route/job onu
 * çağırmadığı için hiç fark edilmemişti.)
 */

const INTERNAL_API_BASE = process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 3001}`;

// Bot davranış presetleri
export const BOT_PRESETS = {
  casual:       { betIntervalMinMs: 30000,  betIntervalMaxMs: 120000, minBetPercent: 1,   maxBetPercent: 3,  riskLevel: 30 },
  aggressive:   { betIntervalMinMs: 10000,  betIntervalMaxMs: 30000,  minBetPercent: 3,   maxBetPercent: 8,  riskLevel: 80 },
  conservative: { betIntervalMinMs: 60000,  betIntervalMaxMs: 180000, minBetPercent: 0.5, maxBetPercent: 2,  riskLevel: 15 },
  high_roller:  { betIntervalMinMs: 20000,  betIntervalMaxMs: 60000,  minBetPercent: 5,   maxBetPercent: 15, riskLevel: 70 },
  bonus_hunter: { betIntervalMinMs: 15000,  betIntervalMaxMs: 45000,  minBetPercent: 1,   maxBetPercent: 5,  riskLevel: 50 },
};

// Bot'un oynayabileceği basit/tek-istekli oyunlar (Mines/Blackjack/HiLo/
// VideoPoker gibi çok adımlı, oturum gerektiren oyunlar bilerek dışarıda
// bırakıldı — bot mantığını gereksiz karmaşıklaştırmamak için).
const BOT_GAMES = ['dice', 'limbo', 'plinko', 'wheel', 'keno', 'roulette', 'baccarat', 'dragontiger'];

function randomBetBody(gameId, betAmount) {
  switch (gameId) {
    case 'dice': return { amount: betAmount, target: 20 + Math.floor(Math.random() * 60), over: Math.random() > 0.5 };
    case 'limbo': return { amount: betAmount, target: (1.2 + Math.random() * 3).toFixed(2) };
    case 'plinko': return { amount: betAmount, risk: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)], rows: 16 };
    case 'wheel': return { amount: betAmount, risk: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] };
    case 'keno': return { amount: betAmount, picks: [1, 2, 3, 4, 5].map(() => 1 + Math.floor(Math.random() * 40)) };
    case 'roulette': return { amount: betAmount, bets: [{ type: Math.random() > 0.5 ? 'red' : 'black', amount: betAmount }] };
    case 'baccarat': return { amount: betAmount, bet: ['player', 'banker', 'tie'][Math.floor(Math.random() * 3)] };
    case 'dragontiger': return { amount: betAmount, bet: ['dragon', 'tiger', 'tie'][Math.floor(Math.random() * 3)] };
    default: return { amount: betAmount };
  }
}

const BOT_GAME_PATH = {
  dice: '/dice/roll', limbo: '/limbo/play', plinko: '/plinko/drop', wheel: '/wheel/spin',
  keno: '/keno/play', roulette: '/roulette/spin', baccarat: '/baccarat/deal', dragontiger: '/dragontiger/deal',
};

/** Bot adına kısa ömürlü bir JWT üretir — gerçek oyun route'larını kendi kimliğiyle çağırabilsin diye. */
function botAccessToken(botUser) {
  return signAccess(botUser);
}

export async function createBot(data, adminId) {
  const { username, email, password, botType = 'casual', behavior = {}, limits = {}, notes = '' } = data;

  if (await User.findOne({ $or: [{ username }, { email }] })) {
    throw new Error('Bot username or email already exists');
  }

  const preset = BOT_PRESETS[botType] || BOT_PRESETS.casual;
  const bot = await User.create({
    username, email,
    password: password || crypto.randomBytes(16).toString('hex'),
    isBot: true,
    emailVerified: true,
    botProfile: {
      botType,
      behavior: { ...preset, ...behavior },
      limits: { maxDailyLoss: 1000, maxDailyBets: 100, minBalanceToPlay: 10, ...limits },
      currentState: 'idle',
      createdBy: adminId,
      notes,
    },
  });

  return bot;
}

export async function getAllBots(options = {}) {
  const { page = 1, limit = 20, status = 'all', botType = 'all' } = options;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = { isBot: true };
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (botType !== 'all') filter['botProfile.botType'] = botType;

  const [bots, total] = await Promise.all([
    User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  return { bots, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

export async function getBotById(botId) {
  return User.findOne({ _id: botId, isBot: true }).select('-password');
}

export async function updateBot(botId, updates) {
  const setOps = {};
  if (updates.isActive !== undefined) setOps.isActive = updates.isActive;
  if (updates.notes !== undefined) setOps['botProfile.notes'] = updates.notes;
  if (updates.botType && BOT_PRESETS[updates.botType]) {
    setOps['botProfile.botType'] = updates.botType;
    setOps['botProfile.behavior'] = { ...BOT_PRESETS[updates.botType], ...(updates.behavior || {}) };
  } else if (updates.behavior) {
    for (const [k, v] of Object.entries(updates.behavior)) setOps[`botProfile.behavior.${k}`] = v;
  }
  if (updates.limits) {
    for (const [k, v] of Object.entries(updates.limits)) setOps[`botProfile.limits.${k}`] = v;
  }

  const bot = await User.findOneAndUpdate({ _id: botId, isBot: true }, { $set: setOps }, { new: true, runValidators: true }).select('-password');
  if (!bot) throw new Error('Bot not found');
  return bot;
}

export async function deleteBot(botId) {
  const bot = await User.findOneAndDelete({ _id: botId, isBot: true });
  if (!bot) throw new Error('Bot not found');
  return true;
}

export async function getBotStats(botId) {
  const bot = await User.findOne({ _id: botId, isBot: true }).select('botProfile');
  if (!bot) throw new Error('Bot not found');

  const stats = bot.botProfile.stats;
  return {
    botId: bot._id,
    ...stats.toObject(),
    currentState: bot.botProfile.currentState,
    nextActionAt: bot.botProfile.nextActionAt,
    uptime: stats.lastActiveAt ? Date.now() - stats.lastActiveAt : 0,
  };
}

export async function getActiveBots() {
  return User.find({ isBot: true, isActive: true }).select('username balance botProfile');
}

export function scheduleNextAction(bot) {
  const now = Date.now();
  const { behavior } = bot.botProfile;
  const interval = Math.random() * (behavior.betIntervalMaxMs - behavior.betIntervalMinMs) + behavior.betIntervalMinMs;
  bot.botProfile.nextActionAt = new Date(now + interval);
  return bot.botProfile.nextActionAt;
}

export async function executeBotAction(botId) {
  const bot = await User.findOne({ _id: botId, isBot: true });
  if (!bot || !bot.isActive) return null;

  const now = Date.now();
  const profile = bot.botProfile;

  if (profile.nextActionAt && profile.nextActionAt > now) {
    return { executed: false, reason: 'Not time yet' };
  }

  // Günlük sayaçları gerekirse sıfırla (24 saatten eski sayaç)
  const dayMs = 24 * 60 * 60 * 1000;
  if (!profile.stats.dailyBetsSince || now - profile.stats.dailyBetsSince.getTime() > dayMs) {
    profile.stats.dailyBetsSince = new Date();
    profile.stats.totalBets = 0;
    profile.stats.totalWagered = 0;
  }

  if (profile.stats.totalWagered > profile.limits.maxDailyLoss) {
    profile.currentState = 'stopped';
    bot.isActive = false;
    await bot.save();
    return { executed: false, reason: 'Daily loss limit reached' };
  }

  if (profile.stats.totalBets >= profile.limits.maxDailyBets) {
    profile.currentState = 'on_break';
    profile.nextActionAt = new Date(now + 3600000);
    await bot.save();
    return { executed: false, reason: 'Daily bet limit reached' };
  }

  if (bot.balance < profile.limits.minBalanceToPlay) {
    profile.currentState = 'on_break';
    profile.nextActionAt = new Date(now + 300000);
    await bot.save();
    return { executed: false, reason: 'Insufficient balance' };
  }

  switch (profile.currentState) {
    case 'playing':
    case 'idle':
      profile.currentState = 'playing';
      return await executeBotBet(bot);
    case 'on_break':
      profile.currentState = 'playing';
      profile.nextActionAt = new Date(now + 5000);
      await bot.save();
      return { executed: false, reason: 'Break ended, resuming' };
    case 'stopped':
      return { executed: false, reason: 'Bot stopped' };
    default:
      return { executed: false, reason: 'Unknown state' };
  }
}

/** Bot adına gerçek bir oyun API'sine dahili HTTP isteği atarak bahis oynar. */
async function executeBotBet(bot) {
  const profile = bot.botProfile;
  const betPercent = Math.random() * (profile.behavior.maxBetPercent - profile.behavior.minBetPercent) + profile.behavior.minBetPercent;
  const betAmount = Math.max(1, Math.floor(bot.balance * betPercent / 100));

  if (betAmount > bot.balance) {
    profile.currentState = 'on_break';
    profile.nextActionAt = new Date(Date.now() + 60000);
    await bot.save();
    return { executed: false, reason: 'Insufficient balance' };
  }

  const gameId = BOT_GAMES[Math.floor(Math.random() * BOT_GAMES.length)];
  const token = botAccessToken(bot);
  const body = randomBetBody(gameId, betAmount);

  let result;
  try {
    const res = await fetch(`${INTERNAL_API_BASE}/api/inhouse${BOT_GAME_PATH[gameId]}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    result = await res.json();
    if (!res.ok) throw new Error(result?.error?.message || result?.error || `HTTP ${res.status}`);
  } catch (e) {
    // Oyun isteği başarısız oldu (ör. oyun devre dışı, limit dışı) — bot'u
    // kısa bir molaya sok, hatayı yutup zinciri kırma.
    profile.currentState = 'on_break';
    profile.nextActionAt = new Date(Date.now() + 30000);
    await bot.save();
    return { executed: false, reason: `Game request failed: ${e.message}` };
  }

  const payout = result.payout ?? 0;
  const net = payout - betAmount;

  // Gerçek route zaten bot.balance'ı güncelledi (aynı User kaydı) —
  // burada yalnızca güncel bakiyeyi taze okuyup istatistikleri işliyoruz.
  const fresh = await User.findById(bot._id).select('balance');
  bot.balance = fresh.balance;

  profile.stats.totalBets += 1;
  profile.stats.totalWagered += betAmount;
  profile.stats.totalWon += Math.max(0, payout);
  profile.stats.lastActiveAt = new Date();

  scheduleNextAction(bot);
  await bot.save();

  const io = getIO();
  if (io) {
    io.emit('bot:action', {
      botId: bot._id, username: bot.username, gameId,
      betAmount, payout, net, balance: bot.balance,
    });
  }

  return { executed: true, gameId, betAmount, payout, net };
}

export async function startAllBots() {
  const bots = await getActiveBots();
  for (const bot of bots) {
    if (bot.botProfile.currentState === 'idle' || bot.botProfile.currentState === 'playing') {
      bot.botProfile.currentState = 'playing';
      scheduleNextAction(bot);
      await bot.save();
    }
  }
  return bots.length;
}

export async function stopAllBots() {
  const bots = await User.find({ isBot: true, isActive: true });
  for (const bot of bots) {
    bot.botProfile.currentState = 'stopped';
    bot.botProfile.nextActionAt = null;
    await bot.save();
  }
  return bots.length;
}

export async function getBotsNeedingAction() {
  return User.find({
    isBot: true,
    isActive: true,
    'botProfile.currentState': { $in: ['playing', 'idle'] },
    'botProfile.nextActionAt': { $lte: new Date() },
  });
}

export async function runBotScheduler() {
  const bots = await getBotsNeedingAction();
  const results = [];

  for (const bot of bots) {
    try {
      const result = await executeBotAction(bot._id);
      results.push({ botId: bot._id, ...result });
    } catch (e) {
      console.error(`Bot ${bot._id} action failed:`, e.message);
      results.push({ botId: bot._id, error: e.message });
    }
  }

  return results;
}

export function getBotPresets() {
  return BOT_PRESETS;
}
