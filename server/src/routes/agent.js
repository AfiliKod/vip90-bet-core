import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requirePermission } from '../services/permissions.js';
import { validate } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { createAgentSchema, assignPlayerSchema, transferFundsSchema, updateAgentSchema } from '../validators/agent.js';
import * as ctrl from '../controllers/agent.js';

const r = Router();
r.use(requireAuth, requireAdmin, requirePermission('admin:agent:read'));

r.get('/', ctrl.getAllAgents);
r.get('/:agentId/stats', ctrl.getAgentStats);

r.post('/', requirePermission('admin:agent:write'), auditLog('AGENT_CREATE'), validate(createAgentSchema), ctrl.createAgent);
r.patch('/:agentId', requirePermission('admin:agent:write'), auditLog('AGENT_UPDATE'), validate(updateAgentSchema), ctrl.updateAgent);
r.post('/:agentId/players', requirePermission('admin:agent:write'), auditLog('AGENT_ASSIGN_PLAYER'), validate(assignPlayerSchema), ctrl.assignPlayer);
r.delete('/:agentId/players/:playerId', requirePermission('admin:agent:write'), auditLog('AGENT_REMOVE_PLAYER'), ctrl.removePlayer);
r.post('/:agentId/transfer', requirePermission('admin:agent:write'), auditLog('AGENT_TRANSFER_FUNDS'), validate(transferFundsSchema), ctrl.transferFunds);

export default r;
