import { getTenancyMode } from './tenancy.js';
import { requireDemoFlag } from './tenancy.js';
import { createError } from '../middleware/error.js';

/**
 * Single source of truth for the future tenancy switch. TENANCY_MODE is not
 * used anywhere else yet; until multi-tenancy lands it only gates demo-only
 * features. Anything other than "multi" is single-tenant mode.
 */
export function isMultiTenancyMode(env = process.env) {
  return getTenancyMode(env) === 'multi';
}

/**
 * POST /transactions/deposit credits the balance with no payment at all. It is
 * a sales-demo feature: off unless DEMO_INSTANT_DEPOSIT=true, and never on in
 * multi-tenancy mode.
 */
export function isDemoInstantDepositEnabled(env = process.env) {
  return String(env.DEMO_INSTANT_DEPOSIT || '').toLowerCase() === 'true'
    && !isMultiTenancyMode(env);
}

export const requireDemoInstantDeposit = requireDemoFlag('instantDeposit');