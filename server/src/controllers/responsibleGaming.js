import * as responsibleGamingService from '../services/responsibleGaming.js';
import { getAuditLogs } from '../services/audit.js';

/**
 * Get player's responsible gaming status
 */
export async function getPlayerStatus(req, res, next) {
  try {
    const status = await responsibleGamingService.getPlayerResponsibleGamingStatus(req.user.id);
    res.json(status);
  } catch (e) { next(e); }
}

/**
 * Set deposit limit
 */
export async function setDepositLimit(req, res, next) {
  try {
    const { limitType, amount } = req.validated;
    const limits = await responsibleGamingService.setDepositLimit(req.user.id, limitType, amount);
    res.json({ limits });
  } catch (e) { next(e); }
}

/**
 * Set loss limit
 */
export async function setLossLimit(req, res, next) {
  try {
    const { limitType, amount } = req.validated;
    const limits = await responsibleGamingService.setLossLimit(req.user.id, limitType, amount);
    res.json({ limits });
  } catch (e) { next(e); }
}

/**
 * Set wager limit
 */
export async function setWagerLimit(req, res, next) {
  try {
    const { limitType, amount } = req.validated;
    const limits = await responsibleGamingService.setWagerLimit(req.user.id, limitType, amount);
    res.json({ limits });
  } catch (e) { next(e); }
}

/**
 * Set session limit
 */
export async function setSessionLimit(req, res, next) {
  try {
    const { minutes } = req.validated;
    const limits = await responsibleGamingService.setSessionLimit(req.user.id, minutes);
    res.json({ limits });
  } catch (e) { next(e); }
}

/**
 * Activate cool-off period
 */
export async function activateCoolOff(req, res, next) {
  try {
    const { duration, reason } = req.validated;
    const user = await responsibleGamingService.activateCoolOff(req.user.id, duration, reason);
    res.json({ message: 'Soğuma dönemi etkinleştirildi', coolOffUntil: user.responsibleLimits.coolOffUntil });
  } catch (e) { next(e); }
}

/**
 * Activate self-exclusion
 */
export async function activateSelfExclusion(req, res, next) {
  try {
    const { until, reason } = req.validated;
    const user = await responsibleGamingService.activateSelfExclusion(req.user.id, new Date(until), reason);
    res.json({ message: 'Kendi kendini hariç tutma etkinleştirildi', selfExclusionUntil: user.responsibleLimits.selfExclusionUntil });
  } catch (e) { next(e); }
}

/**
 * Get restricted players (admin)
 */
export async function getRestrictedPlayers(req, res, next) {
  try {
    const { page, limit, type, search } = req.query;
    const result = await responsibleGamingService.getRestrictedPlayers({ page, limit, type, search });
    res.json(result);
  } catch (e) { next(e); }
}

/**
 * Restrict account (admin)
 */
export async function restrictAccount(req, res, next) {
  try {
    const { userId } = req.params;
    const { reason } = req.validated;
    const user = await responsibleGamingService.restrictAccount(userId, reason, req.user.id);
    res.json({ message: 'Hesap kısıtlandı', user });
  } catch (e) { next(e); }
}

/**
 * Lift restriction (admin)
 */
export async function liftRestriction(req, res, next) {
  try {
    const { userId } = req.params;
    const user = await responsibleGamingService.liftRestriction(userId, req.user.id);
    res.json({ message: 'Kısıtlama kaldırıldı', user });
  } catch (e) { next(e); }
}

/**
 * Get responsible gaming audit log (admin)
 */
export async function getResponsibleGamingAudit(req, res, next) {
  try {
    const { page, limit, userId } = req.query;
    const result = await getAuditLogs({
      category: 'responsible_gaming',
      targetId: userId || undefined,
      page, limit,
    });
    res.json({ audit: result.logs || result.items || result });
  } catch (e) { next(e); }
}
