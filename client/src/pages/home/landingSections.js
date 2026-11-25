/**
 * Landing page (`/`) section logic: which sections render, in which order.
 *
 * The landing page shares the admin "Pages" section order (`page.home`
 * setting, see pageContent.js) with the casino page. It renders only the ids
 * below; the rest of DEFAULT_SECTION_ORDER (legacy quickNav/features/
 * bottomCta) is ignored here.
 *
 * A section whose module is turned off is dropped instead of rendering an
 * empty block: sports rows need `betting`, provider game rows need
 * `casino-content`. Our own games (inhouseGames) and the promo slider never
 * depend on a module.
 */
import { resolveSectionOrder } from './pageContent.js';

export const LANDING_SECTION_IDS = ['hero', 'liveBets', 'casinoGames', 'sportsBets', 'inhouseGames'];

const NEEDS_BETTING = new Set(['liveBets', 'sportsBets']);
const NEEDS_CASINO = new Set(['casinoGames']);

/**
 * @param {unknown} sectionOrder  saved order from GET /pages/home (may be missing)
 * @param {{ betting?: boolean, casino?: boolean }} modules  availability; a missing flag counts as available
 * @returns {string[]} landing section ids in render order
 */
export function resolveLandingSections(sectionOrder, modules = {}) {
  const betting = modules.betting !== false;
  const casino = modules.casino !== false;
  return resolveSectionOrder(sectionOrder).filter(id => {
    if (!LANDING_SECTION_IDS.includes(id)) return false;
    if (NEEDS_BETTING.has(id) && !betting) return false;
    if (NEEDS_CASINO.has(id) && !casino) return false;
    return true;
  });
}

/**
 * First `limit` events that have odds a player can click, keeping the
 * server's order (start time ascending). Events without odds would render as
 * nothing in MiniEventCard and leave gaps in the row.
 */
export function pickEventsWithOdds(events, hasOdds, limit = 8) {
  if (!Array.isArray(events)) return [];
  const out = [];
  for (const ev of events) {
    if (out.length >= limit) break;
    if (ev && hasOdds(ev)) out.push(ev);
  }
  return out;
}
