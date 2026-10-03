import { checkRiskEligibility, evaluateRisk } from '../services/riskEngine.js';
import { createError } from './error.js';

export function enforceRiskCheck(action) {
  return async (req, res, next) => {
    try {
      const playerId = req.user?.id || req.params.playerId;
      if (!playerId) return next();

      const decision = await checkRiskEligibility(playerId, action, {
        amount: req.body?.amount,
        ip: req.ip,
      });

      if (decision === 'BLOCK') {
        return next(createError(403, 'RISK_BLOCKED', 'Account is blocked due to risk assessment'));
      }
      if (decision === 'RESTRICT') {
        return next(createError(403, 'RISK_RESTRICTED', 'Account is restricted due to risk assessment'));
      }
      if (decision === 'REVIEW') {
        res.setHeader('X-Risk-Review', 'required');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export async function emitRiskEvent(playerId, event, context = {}) {
  try {
    return await evaluateRisk(playerId, event, context);
  } catch {
    return null;
  }
}
