import Agent from '../models/Agent.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';
import { getIO } from './socketEmitter.js';

/**
 * Create a new agent (admin action)
 */
export async function createAgent(userId, adminId, options = {}) {
  const { session = null, commissionRate = 10, notes = '' } = options;

  const user = await User.findById(userId).session(session);
  if (!user) throw new Error('User not found');
  if (user.isAgent) throw new Error('User is already an agent');

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
  if (!agent) throw new Error('Agent not found');
  if (!agent.isActive) throw new Error('Agent is not active');

  const player = await User.findById(playerId).session(session);
  if (!player) throw new Error('Player not found');
  if (player.agentId) {
    if (player.agentId.equals(agentId)) {
      // Already assigned to this agent - silently return
      return agent;
    }
    throw new Error('Player already assigned to another agent');
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
  if (!agent) throw new Error('Agent not found');

  const player = await User.findById(playerId).session(session);
  if (!player) throw new Error('Player not found');
  if (!player.agentId || !player.agentId.equals(agentId)) {
    throw new Error('Player not assigned to this agent');
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

  if (!amount || amount <= 0) throw new Error('Invalid amount');

  const agent = await Agent.findOne({ userId: agentUserId }).session(session);
  if (!agent) throw new Error('Agent not found');
  if (!agent.isActive) throw new Error('Agent is not active');

  const player = await User.findById(playerId).session(session);
  if (!player) throw new Error('Player not found');
  if (!player.agentId || !player.agentId.equals(agent._id)) {
    throw new Error('Player not owned by this agent');
  }

  // Check agent has sufficient balance
  if (agent.balance < amount) {
    throw new Error('Agent insufficient balance');
  }

  const transferId = new mongoose.Types.ObjectId(); // Link both transactions

  // 1. Decrease agent balance
  const agentBalanceBefore = agent.balance;
  agent.balance = parseFloat((agent.balance - amount).toFixed(2));
  await agent.save({ session });

  const agentTransaction = await Transaction.create([{
    userId: agentUserId,
    type: 'agent_transfer_out',
    amount: -amount, // Negative for outgoing
    balanceBefore: agentBalanceBefore,
    balanceAfter: agent.balance,
    note: `Agent → Oyuncu transferi: ${note || 'Bakiye aktarımı'}`,
    referenceId: transferId,
    createdBy: agentUserId,
  }], { session });

  // 2. Increase player balance
  const playerBalanceBefore = player.balance;
  player.balance = parseFloat((player.balance + amount).toFixed(2));
  await player.save({ session });

  const playerTransaction = await Transaction.create([{
    userId: player._id,
    type: 'agent_transfer_in',
    amount: amount, // Positive for incoming
    balanceBefore: playerBalanceBefore,
    balanceAfter: player.balance,
    note: `Agent transferi: ${note || 'Bakiye aktarımı'}`,
    referenceId: transferId,
    createdBy: agentUserId,
  }], { session });

  // Real-time updates
  const io = getIO();
  if (io) {
    io.to(`user:${agentUserId}`).emit('balance:update', { balance: agent.balance });
    io.to(`user:${player._id}`).emit('balance:update', { balance: player.balance });
  }

  return {
    transferId,
    agentTransaction: agentTransaction[0],
    playerTransaction: playerTransaction[0],
    agentBalance: agent.balance,
    playerBalance: player.balance,
  };
}

/**
 * Get agent's players with pagination
 */
export async function getAgentPlayers(agentUserId, options = {}) {
  const { page = 1, limit = 20, search = '' } = options;
  const skip = (Number(page) - 1) * Number(limit);

  const agent = await Agent.findOne({ userId: agentUserId });
  if (!agent) throw new Error('Agent not found');

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
  if (!agent) throw new Error('Agent not found');

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
  const { page = 1, limit = 20, status = 'all' } = options;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = {};
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  const [agents, total] = await Promise.all([
    Agent.find(filter)
      .populate('userId', 'username email balance createdAt')
      .populate('registeredBy', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Agent.countDocuments(filter),
  ]);

  return { agents, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
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
  if (!agent) throw new Error('Agent not found');

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
  const { session = null } = options;

  const player = await User.findById(playerId).select('agentId').session(session);
  if (!player?.agentId) return null;

  const agent = await Agent.findById(player.agentId).session(session);
  if (!agent || !agent.isActive) return null;

  const commission = parseFloat((houseProfit * (agent.commissionRate / 100)).toFixed(2));
  if (commission <= 0) return null;

  const balanceBefore = agent.balance;
  agent.balance = parseFloat((agent.balance + commission).toFixed(2));
  await agent.save({ session });

  const transaction = await Transaction.create([{
    userId: agent.userId,
    type: 'agent_commission',
    amount: commission,
    balanceBefore,
    balanceAfter: agent.balance,
    note: `Agent komisyonu (${agent.commissionRate}%) - Oyuncu: ${player.username || player._id}`,
    referenceId: player._id,
  }], { session });

  const io = getIO();
  if (io) io.to(`user:${agent.userId}`).emit('balance:update', { balance: agent.balance });

  return { commission, transaction: transaction[0] };
}