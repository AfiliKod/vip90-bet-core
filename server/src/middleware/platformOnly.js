import { getTenancyMode } from '../config/tenancy.js';
import { createError } from './error.js';

/**
 * Multi mode: only platform-scoped staff may pass (spec §4.6, §9 G-14: event settlement
 * is a platform action on the shared catalog). Single mode: no change, the install's own
 * admin keeps every action it has today.
 */
export function requirePlatformInMultiMode(req, res, next) {
  if (getTenancyMode() !== 'multi') return next();
  if (req.staff?.scope === 'platform') return next();
  return next(createError(403, 'PLATFORM_ONLY', 'Bu işlem yalnız platform personeline açıktır'));
}
