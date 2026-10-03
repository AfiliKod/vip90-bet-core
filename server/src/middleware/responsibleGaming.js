/**
 * Responsible Gaming Middleware (Phase 2C)
 *
 * Server-side enforcement for responsible gaming limits.
 */
import { checkPlayerEligibility } from '../services/responsibleGaming.js';
import { createError } from './error.js';

/**
 * Middleware factory for responsible gaming enforcement.
 *
 * @param {String} action - Action type (deposit, withdraw, bet, play)
 * @param {Function} getContext - Function to extract context from request
 * @returns {Function} Express middleware
 */
export function enforceResponsibleGaming(action, getContext = (req) => ({})) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(createError(401, 'UNAUTHORIZED', 'Token gerekli'));
      }

      const context = getContext(req);
      const eligibility = await checkPlayerEligibility(req.user.id, action, context);

      switch (eligibility) {
        case 'BLOCK':
          return next(createError(403, 'ACCOUNT_RESTRICTED', 'Hesabınız sorumlu oyun nedeniyle kısıtlıdır'));
        case 'RESTRICT':
          return next(createError(403, 'LIMIT_EXCEEDED', 'Sorumlu oyun limitiniz aşıldı'));
        case 'ALLOW':
        default:
          next();
      }
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to check self-exclusion.
 */
export function checkSelfExclusion(req, res, next) {
  return enforceResponsibleGaming('play')(req, res, next);
}

/**
 * Middleware to check deposit limits.
 */
export function checkDepositLimits(req, res, next) {
  return enforceResponsibleGaming('deposit', (req) => ({
    amount: req.body?.amount || req.validated?.amount || 0,
  }))(req, res, next);
}

/**
 * Middleware to check bet limits.
 */
export function checkBetLimits(req, res, next) {
  return enforceResponsibleGaming('bet', (req) => ({
    amount: req.body?.stake || req.validated?.stake || 0,
  }))(req, res, next);
}
