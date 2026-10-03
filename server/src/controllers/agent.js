import mongoose from 'mongoose';
import * as agentService from '../services/agent.js';
import Agent from '../models/Agent.js';
import { createError } from '../middleware/error.js';
import { withTransactionRetry } from '../utils/transactionRetry.js';

export async function createAgent(req, res, next) {
  try {
    const { userId, commissionRate, notes } = req.validated;
    const agent = await agentService.createAgent(userId, req.user.id, { commissionRate, notes });
    res.status(201).json({ agent });
  } catch (e) { next(e); }
}

export async function getAllAgents(req, res, next) {
  try {
    const { page, limit, status, search } = req.query;
    const result = await agentService.getAllAgents({ page, limit, status, search: search || '' });
    res.json(result);
  } catch (e) { next(e); }
}

export async function getAgentStats(req, res, next) {
  try {
    const agent = await Agent.findById(req.params.agentId);
    if (!agent) throw createError(404, 'AGENT_NOT_FOUND', 'Agent bulunamadı');
    const stats = await agentService.getAgentStats(agent.userId);
    res.json(stats);
  } catch (e) { next(e); }
}

export async function assignPlayer(req, res, next) {
  try {
    const { playerId } = req.validated;
    const agent = await agentService.assignPlayerToAgent(playerId, req.params.agentId, req.user.id);
    res.json({ agent });
  } catch (e) { next(e); }
}

export async function removePlayer(req, res, next) {
  try {
    const agent = await agentService.removePlayerFromAgent(req.params.playerId, req.params.agentId);
    res.json({ agent });
  } catch (e) { next(e); }
}

export async function transferFunds(req, res, next) {
  const session = await mongoose.startSession();
  try {
    const result = await withTransactionRetry(session, async () => {
      const { playerId, amount, note } = req.validated;
      const agent = await Agent.findById(req.params.agentId).session(session);
      if (!agent) throw createError(404, 'AGENT_NOT_FOUND', 'Agent bulunamadı');
      return agentService.transferFundsAgentToPlayer(agent.userId, playerId, amount, note, { session });
    });
    res.json(result);
  } catch (e) { next(e); }
  finally { session.endSession(); }
}

export async function updateAgent(req, res, next) {
  try {
    const agent = await agentService.updateAgent(req.params.agentId, req.validated);
    res.json({ agent });
  } catch (e) { next(e); }
}
