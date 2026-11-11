import { checkRiskEligibility, evaluateRisk } from '../services/riskEngine.js';
import { createError } from './error.js';

/**
 * Risk decision for `action`, shared by the middleware and middleware-less
 * paths (V8: chat tip). BLOCK/RESTRICT throw 403; REVIEW and ALLOW return the
 * decision (the middleware marks REVIEW with a header).
 */
export async function assertRiskAllowed(playerId, action, context = {}, check = checkRiskEligibility) {
  const decision = await check(playerId, action, context);
  if (decision === 'BLOCK') {
    throw createError(403, 'RISK_BLOCKED', 'Account is blocked due to risk assessment');
  }
  if (decision === 'RESTRICT') {
    throw createError(403, 'RISK_RESTRICTED', 'Account is restricted due to risk assessment');
  }
  return decision;
}

export function enforceRiskCheck(action) {
  return async (req, res, next) => {
    try {
      const playerId = req.user?.id || req.params.playerId;
      if (!playerId) return next();

      const decision = await assertRiskAllowed(playerId, action, {
        amount: req.body?.amount,
        ip: req.ip,
      });

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
