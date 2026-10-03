import Agent from '../models/Agent.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import escapeStringRegexp from 'escape-string-regexp';
import { getIO } from './socketEmitter.js';
import { createTransaction } from './ledger.js';
import { createError } from '../middleware/error.js';

/**
 * Create a new agent (admin action)
 */
export async function createAgent(userId, adminId, options = {}) {
  const { session = null, commissionRate = 10, notes = '' } = options;

  const user = await User.findById(userId).session(session);
  if (!user) throw createError(404, 'USER_NOT_FOUND', 'User not found');
  if (user.isAgent) throw createError(409, 'ALREADY_AGENT', 'User is already an agent');

  const agent = await Agent.create([{
    userId: user._id,
    players: [],
    commissionRate,
    balance: 0,
    isActive: true,
    registeredBy: adminId,
    notes,
  }], { session });

  user.isAgent = true;
  user.agentId = agent[0]._id;
  await user.save({ session });

  return agent[0];
}

/**
 * Assign a player to an agent (admin action)
 */
export async function assignPlayerToAgent(playerId, agentId, adminId, options = {}) {
  const { session = null } = options;

  const agent = await Agent.findById(agentId).session(session);
  if (!agent) throw createError(404, 'AGENT_NOT_FOUND', 'Agent not found');
  if (!agent.isActive) throw createError(400, 'AGENT_INACTIVE', 'Agent is not active');

  const player = await User.findById(playerId).session(session);
  if (!player) throw createError(404, 'PLAYER_NOT_FOUND', 'Player not found');
  if (player.agentId) {
    if (player.agentId.equals(agentId)) {
      // Already assigned to this agent - silently return
      return agent;
    }
    throw createError(409, 'PLAYER_ALREADY_ASSIGNED', 'Player already assigned to another agent');
  }

  // Add to agent's players
  if (!agent.players.some(id => id.equals(playerId))) {
    agent.players.push(playerId);
    await agent.save({ session });
  }

  // Update player's agentId
  player.agentId = agent._id;
  await player.save({ session });

  return agent;
}

/**
 * Remove player from agent (admin action)
 */
export async function removePlayerFromAgent(playerId, agentId, options = {}) {
  const { session = null } = options;

  const agent = await Agent.findById(agentId).session(session);
  if (!agent) throw createError(404, 'AGENT_NOT_FOUND', 'Agent not found');

  const player = await User.findById(playerId).session(session);
  if (!player) throw createError(404, 'PLAYER_NOT_FOUND', 'Player not found');
  if (!player.agentId || !player.agentId.equals(agentId)) {
    throw createError(400, 'PLAYER_NOT_ASSIGNED', 'Player not assigned to this agent');
  }

  agent.players = agent.players.filter(id => !id.equals(playerId));
  await agent.save({ session });

  player.agentId = null;
  await player.save({ session });

  return agent;
}

/**
 * Agent-to-player fund transfer (O3 - strict financial rules)
 * DUAL-SIDED TRANSACTION: agent balance decreases, player balance increases
 * Both create separate Transaction records linked together
 */
export async function transferFundsAgentToPlayer(agentUserId, playerId, amount, note, options = {}) {
  const { session = null } = options;

  if (!amount || amount <= 0) throw createError(400, 'INVALID_AMOUNT', 'Invalid amount');

  const agent = await Agent.findOne({ userId: agentUserId }).session(session);
  if (!agent) throw createError(404, 'AGENT_NOT_FOUND', 'Agent not found');
  if (!agent.isActive) throw createError(400, 'AGENT_INACTIVE', 'Agent is not active');

  const player = await User.findById(playerId).session(session);
  if (!player) throw createError(404, 'PLAYER_NOT_FOUND', 'Player not found');
  if (!player.agentId || !player.agentId.equals(agent._id)) {
    throw createError(400, 'PLAYER_NOT_OWNED', 'Player not owned by this agent');
  }

  const transferId = new mongoose.Types.ObjectId(); // Link both transactions
  const idempotencyPrefix = `agent_transfer_${transferId}`;

  // 1. Decrease agent balance (atomic: check + subtract in one operation)
  const agentBalanceBefore = agent.balance;
  const updatedAgent = await Agent.findOneAndUpdate(
    { _id: agent._id, balance: { $gte: amount } },
    { $inc: { balance: -amount } },
    { new: true, session },
  );
  if (!updatedAgent) {
    throw createError(400, 'INSUFFICIENT_BALANCE', 'Agent insufficient balance');
  }

  const { transaction: agentTransaction } = await createTransaction({
    userId: agentUserId,
    type: 'agent_transfer_out',
    amount: -amount, // Negative for outgoing
    balanceBefore: agentBalanceBefore,
    balanceAfter: updatedAgent.balance,
    referenceId: transferId,
    idempotencyKey: `${idempotencyPrefix}_out`,
    source: 'admin',
    metadata: { playerId, note },
    relatedTransactionId: transferId,
    createdBy: agentUserId,
  }, { session });

  // 2. Increase player balance (atomic $inc, mirroring the agent-side update above)
  const playerBalanceBefore = player.balance;
  const updatedPlayer = await User.findByIdAndUpdate(
    player._id,
    { $inc: { balance: amount } },
    { new: true, session },
  );

  const { transaction: playerTransaction } = await createTransaction({
    userId: player._id,
    type: 'agent_transfer_in',
    amount: amount, // Positive for incoming
    balanceBefore: playerBalanceBefore,
    balanceAfter: updatedPlayer.balance,
    referenceId: transferId,
    idempotencyKey: `${idempotencyPrefix}_in`,
    source: 'admin',
    metadata: { agentUserId, note },
    relatedTransactionId: agentTransaction._id,
    createdBy: agentUserId,
  }, { session });

  // Real-time updates
  const io = getIO();
  if (io) {
    io.to(`user:${agentUserId}`).emit('balance:update', { balance: updatedAgent.balance });
    io.to(`user:${player._id}`).emit('balance:update', { balance: updatedPlayer.balance });
  }

  return {
    transferId,
    agentTransaction,
    playerTransaction,
    agentBalance: updatedAgent.balance,
    playerBalance: updatedPlayer.balance,
  };
}

/**
 * Get agent's players with pagination
 */
export async function getAgentPlayers(agentUserId, options = {}) {
  const { page = 1, limit = 20, search = '' } = options;
  const skip = (Number(page) - 1) * Number(limit);

  const agent = await Agent.findOne({ userId: agentUserId });
  if (!agent) throw createError(404, 'AGENT_NOT_FOUND', 'Agent not found');

  const playerIds = agent.players;
  const filter = { _id: { $in: playerIds } };
  if (search) {
    const re = new RegExp(search, 'i');
    filter.$or = [{ username: re }, { email: re }];
  }

  const [players, total] = await Promise.all([
    User.find(filter)
      .select('username email balance createdAt isActive')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  return { players, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

/**
 * Get agent stats
 */
export async function getAgentStats(agentUserId) {
  const agent = await Agent.findOne({ userId: agentUserId });
  if (!agent) throw createError(404, 'AGENT_NOT_FOUND', 'Agent not found');

  const playerIds = agent.players;
  const [playerCount, totalBalance, totalWagered, totalDeposits] = await Promise.all([
    User.countDocuments({ _id: { $in: playerIds } }),
    User.aggregate([
      { $match: { _id: { $in: playerIds } } },
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]),
    // Would need Bet/CasinoRound models for real stats
    Promise.resolve(0),
    Promise.resolve(0),
  ]);

  return {
    agentId: agent._id,
    userId: agent.userId,
    commissionRate: agent.commissionRate,
    agentBalance: agent.balance,
    playerCount: playerCount,
    totalPlayerBalance: totalBalance[0]?.total || 0,
    totalWagered,
    totalDeposits,
    isActive: agent.isActive,
  };
}

/**
 * Get all agents (admin)
 */
export async function getAllAgents(options = {}) {
  const { page = 1, limit = 20, status = 'all', search = '' } = options;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = {};
  // UI kuralı (satır rozeti): isActive === false değilse aktif.
  if (status === 'active') filter.isActive = { $ne: false };
  if (status === 'inactive') filter.isActive = false;
  if (search && typeof search === 'string') {
    const trimmed = search.trim().slice(0, 100);
    if (trimmed) {
      const re = new RegExp(escapeStringRegexp(trimmed), 'i');
      const matchedUsers = await User.find({ $or: [{ username: re }, { email: re }] })
        .select('_id')
        .limit(1000);
      filter.userId = { $in: matchedUsers.map(u => u._id) };
    }
  }

  const [agents, total, statGroups] = await Promise.all([
    Agent.find(filter)
      .populate('userId', 'username email balance createdAt')
      .populate('registeredBy', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Agent.countDocuments(filter),
    // Sekme sayaçları + KPI şeridi: filtresiz, global dağılım.
    Agent.aggregate([
      { $group: {
        _id: null,
        active: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } },
        inactive: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] } },
        players: { $sum: { $size: { $ifNull: ['$players', []] } } },
      } },
    ]),
  ]);

  const s = statGroups[0] || { active: 0, inactive: 0, players: 0 };

  return {
    agents,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    stats: {
      all: s.active + s.inactive,
      active: s.active,
      inactive: s.inactive,
      players: s.players,
    },
  };
}

/**
 * Update agent settings (admin)
 */
export async function updateAgent(agentId, updates, options = {}) {
  const { session = null } = options;

  const allowedUpdates = ['commissionRate', 'isActive', 'notes'];
  const updateData = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowedUpdates.includes(k))
  );

  const agent = await Agent.findByIdAndUpdate(agentId, updateData, { new: true, session, runValidators: true });
  if (!agent) throw createError(404, 'AGENT_NOT_FOUND', 'Agent not found');

  return agent;
}

/**
 * Get agent by userId
 */
export async function getAgentByUserId(userId) {
  return Agent.findOne({ userId }).populate('userId', 'username email balance');
}

/**
 * Agent commission payout from player losses (when player loses, agent gets %)
 * This would be called from settlement logic
 */
export async function payAgentCommission(playerId, houseProfit, options = {}) {
  const { session = null, sourceId = null } = options;

  const player = await User.findById(playerId).select('agentId').session(session);
  if (!player?.agentId) return null;

  const agent = await Agent.findById(player.agentId).session(session);
  if (!agent || !agent.isActive) return null;

  const commission = parseFloat((houseProfit * (agent.commissionRate / 100)).toFixed(2));
  if (commission <= 0) return null;

  // Tekrar koruması: anahtar ödemeyi doğuran olaydan (sourceId) türetilir ve
  // bakiye DEĞİŞMEDEN önce kontrol edilir — createTransaction'ın kendi
  // idempotency kontrolü yalnız ledger satırını engeller, bakiye $inc'ini değil.
  // sourceId yoksa (eski çağrılar) her çağrı ayrı ödeme sayılır.
  const idempotencyKey = sourceId
    ? `agent_commission_${agent._id}_${sourceId}`
    : `agent_commission_${agent._id}_${player._id}_${Date.now()}`;
  if (sourceId && await Transaction.exists({ idempotencyKey }).session(session)) return null;

  const balanceBefore = agent.balance;
  agent.balance = parseFloat((agent.balance + commission).toFixed(2));
  await agent.save({ session });

  const { transaction } = await createTransaction({
    userId: agent.userId,
    type: 'agent_commission',
    amount: commission,
    balanceBefore,
    balanceAfter: agent.balance,
    note: `Agent komisyonu (${agent.commissionRate}%) - Oyuncu: ${player.username || player._id}`,
    referenceId: player._id,
    idempotencyKey,
    source: 'system',
  }, { session });

  const io = getIO();
  if (io) io.to(`user:${agent.userId}`).emit('balance:update', { balance: agent.balance });

  return { commission, transaction };
}