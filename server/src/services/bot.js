import Bot from '../models/Bot.js';
import User from '../models/User.js';
import { getIO } from './socketEmitter.js';

/**
 * Bot Service - Manages AI player bots
 */

// Bot behavior presets
export const BOT_PRESETS = {
  casual: {
    betIntervalMin: 30000,
    betIntervalMax: 120000,
    minBetPercent: 1,
    maxBetPercent: 3,
    riskLevel: 30,
    sessionDurationMin: 300000,
    sessionDurationMax: 900000,
  },
  aggressive: {
    betIntervalMin: 10000,
    betIntervalMax: 30000,
    minBetPercent: 3,
    maxBetPercent: 8,
    riskLevel: 80,
    sessionDurationMin: 600000,
    sessionDurationMax: 1800000,
  },
  conservative: {
    betIntervalMin: 60000,
    betIntervalMax: 180000,
    minBetPercent: 0.5,
    maxBetPercent: 2,
    riskLevel: 15,
    sessionDurationMin: 600000,
    sessionDurationMax: 1800000,
  },
  high_roller: {
    betIntervalMin: 20000,
    betIntervalMax: 60000,
    minBetPercent: 5,
    maxBetPercent: 15,
    riskLevel: 70,
    sessionDurationMin: 300000,
    sessionDurationMax: 900000,
  },
  bonus_hunter: {
    betIntervalMin: 15000,
    betIntervalMax: 45000,
    minBetPercent: 1,
    maxBetPercent: 5,
    riskLevel: 50,
    sessionDurationMin: 900000,
    sessionDurationMax: 3600000,
  },
};

/**
 * Create a new bot (admin only)
 */
export async function createBot(data, adminId, options = {}) {
  const { session = null } = options;
  
  const { username, email, password, botType = 'casual', behavior = {}, limits = {}, notes = '' } = data;
  
  if (await Bot.findOne({ $or: [{ username }, { email }] }).session(session)) {
    throw new Error('Bot username or email already exists');
  }
  
  // Merge preset with custom behavior
  const preset = BOT_PRESETS[botType] || BOT_PRESETS.casual;
  const mergedBehavior = { ...preset, ...behavior };
  
  const bot = await Bot.create([{
    username,
    email,
    password,
    isBot: true,
    botType,
    behavior: mergedBehavior,
    limits: { ...BOT_PRESETS.casual, ...limits }, // Use default limits as base
    isActive: true,
    currentState: 'idle',
    createdBy: adminId,
    notes,
  }], { session });
  
  return bot[0];
}

/**
 * Get all bots with pagination (admin)
 */
export async function getAllBots(options = {}) {
  const { page = 1, limit = 20, status = 'all', botType = 'all' } = options;
  const skip = (Number(page) - 1) * Number(limit);
  
  const filter = {};
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (botType !== 'all') filter.botType = botType;
  
  const [bots, total] = await Promise.all([
    Bot.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Bot.countDocuments(filter),
  ]);
  
  return { bots, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

/**
 * Get bot by ID
 */
export async function getBotById(botId) {
  return Bot.findById(botId).select('-password');
}

/**
 * Update bot settings (admin)
 */
export async function updateBot(botId, updates, options = {}) {
  const { session = null } = options;
  
  const allowedUpdates = [
    'botType', 'behavior', 'limits', 'isActive', 'notes'
  ];
  
  const updateData = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowedUpdates.includes(k))
  );
  
  // If botType changed, apply preset
  if (updateData.botType && BOT_PRESETS[updateData.botType]) {
    updateData.behavior = { ...BOT_PRESETS[updateData.botType], ...(updates.behavior || {}) };
  }
  
  const bot = await Bot.findByIdAndUpdate(botId, updateData, { new: true, session, runValidators: true }).select('-password');
  if (!bot) throw new Error('Bot not found');
  
  return bot;
}

/**
 * Delete bot (admin)
 */
export async function deleteBot(botId) {
  const bot = await Bot.findByIdAndDelete(botId);
  if (!bot) throw new Error('Bot not found');
  return true;
}

/**
 * Get bot stats
 */
export async function getBotStats(botId) {
  const bot = await Bot.findById(botId).select('stats currentState nextActionAt');
  if (!bot) throw new Error('Bot not found');
  
  return {
    botId: bot._id,
    ...bot.stats,
    currentState: bot.currentState,
    nextActionAt: bot.nextActionAt,
    uptime: bot.stats.lastActiveAt ? Date.now() - bot.stats.lastActiveAt : 0,
  };
}

/**
 * Get all active bots for scheduler
 */
export async function getActiveBots() {
  return Bot.find({ isActive: true, isBot: true }).select('username behavior limits stats currentState nextActionAt');
}

/**
 * Schedule next action for a bot
 */
export function scheduleNextAction(bot) {
  const now = Date.now();
  const { behavior } = bot;
  
  if (bot.currentState === 'playing') {
    // Schedule next bet
    const interval = Math.random() * (behavior.betIntervalMax - behavior.betIntervalMin) + behavior.betIntervalMin;
    bot.nextActionAt = new Date(now + interval);
    bot.currentState = 'playing';
  } else if (bot.currentState === 'on_break') {
    // Schedule end of break
    const breakDuration = Math.random() * (behavior.breakDurationMax - behavior.breakDurationMin) + behavior.breakDurationMin;
    bot.nextActionAt = new Date(now + breakDuration);
  } else {
    // Idle -> start session
    bot.currentState = 'playing';
    const sessionDuration = Math.random() * (behavior.sessionDurationMax - behavior.sessionDurationMin) + behavior.sessionDurationMin;
    bot.nextActionAt = new Date(now + Math.min(interval, sessionDuration));
  }
  
  return bot.nextActionAt;
}

/**
 * Execute bot action (place bet, etc.)
 */
export async function executeBotAction(botId) {
  const bot = await Bot.findById(botId);
  if (!bot || !bot.isActive) return null;
  
  const now = Date.now();
  
  // Check if it's time to act
  if (bot.nextActionAt && bot.nextActionAt > now) {
    return { executed: false, reason: 'Not time yet' };
  }
  
  // Check limits
  if (bot.stats.totalWagered > bot.limits.maxDailyLoss) {
    bot.currentState = 'stopped';
    bot.isActive = false;
    await bot.save();
    return { executed: false, reason: 'Daily loss limit reached' };
  }
  
  if (bot.stats.totalBets >= bot.limits.maxDailyBets) {
    bot.currentState = 'on_break';
    bot.nextActionAt = new Date(now + 3600000); // 1 hour break
    await bot.save();
    return { executed: false, reason: 'Daily bet limit reached' };
  }
  
  // Execute based on current state
  switch (bot.currentState) {
    case 'playing':
      return await executeBotBet(bot);
    case 'on_break':
      // Resume playing
      bot.currentState = 'playing';
      bot.nextActionAt = new Date(now + 5000); // Quick resume
      await bot.save();
      return { executed: false, reason: 'Break ended, resuming' };
    case 'idle':
      // Start new session
      bot.currentState = 'playing';
      bot.stats.lastActiveAt = new Date();
      await bot.save();
      return await executeBotBet(bot);
    case 'stopped':
      return { executed: false, reason: 'Bot stopped' };
    default:
      return { executed: false, reason: 'Unknown state' };
  }
}

/**
 * Execute a bot bet
 */
async function executeBotBet(bot) {
  // This would integrate with actual game services
  // For now, simulate a bet
  
  const betAmount = Math.random() * (bot.behavior.maxBetPercent - bot.behavior.minBetPercent) + bot.behavior.minBetPercent;
  const betAmountFinal = Math.max(1, Math.floor(bot.balance * betAmount / 100));
  
  if (betAmountFinal > bot.balance) {
    bot.currentState = 'on_break';
    bot.nextActionAt = new Date(Date.now() + 60000);
    await bot.save();
    return { executed: false, reason: 'Insufficient balance' };
  }
  
  // Simulate bet result (50/50 for simplicity)
  const won = Math.random() > 0.5;
  const payout = won ? betAmountFinal * 2 : 0;
  const net = payout - betAmountFinal;
  
  bot.balance += net;
  bot.stats.totalBets += 1;
  bot.stats.totalWagered += betAmountFinal;
  bot.stats.totalWon += payout;
  bot.stats.totalLost += Math.max(0, -net);
  
  if (net > 0) {
    if (net > bot.stats.biggestWin) bot.stats.biggestWin = net;
  } else {
    if (-net > bot.stats.biggestLoss) bot.stats.biggestLoss = -net;
  }
  
  bot.stats.lastActiveAt = new Date();
  bot.stats.gamesPlayed.set('simulated', (bot.stats.gamesPlayed.get('simulated') || 0) + 1);
  
  // Schedule next action
  scheduleNextAction(bot);
  await bot.save();
  
  // Emit real-time update
  const io = getIO();
  if (io) {
    io.emit('bot:action', {
      botId: bot._id,
      username: bot.username,
      action: 'bet',
      betAmount: betAmountFinal,
      won,
      payout,
      balance: bot.balance,
    });
  }
  
  return { executed: true, betAmount: betAmountFinal, won, payout, net };
}

/**
 * Start all active bots (called on server startup)
 */
export async function startAllBots() {
  const bots = await getActiveBots();
  for (const bot of bots) {
    if (bot.currentState === 'idle' || bot.currentState === 'playing') {
      bot.currentState = 'playing';
      scheduleNextAction(bot);
      await bot.save();
    }
  }
  return bots.length;
}

/**
 * Stop all bots
 */
export async function stopAllBots() {
  const bots = await Bot.find({ isBot: true, isActive: true });
  for (const bot of bots) {
    bot.currentState = 'stopped';
    bot.nextActionAt = null;
    await bot.save();
  }
  return bots.length;
}

/**
 * Get bots needing action (for scheduler)
 */
export async function getBotsNeedingAction() {
  const now = new Date();
  return Bot.find({
    isBot: true,
    isActive: true,
    currentState: { $in: ['playing', 'idle'] },
    nextActionAt: { $lte: new Date() },
  });
}

/**
 * Run bot scheduler (called periodically)
 */
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

/**
 * Get bot configuration presets
 */
export function getBotPresets() {
  return BOT_PRESETS;
}