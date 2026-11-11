import crypto from 'crypto';
import User from '../models/User.js';
import { createError } from '../middleware/error.js';

// F1: usernames of accounts created by an external login (Telegram, Google,
// wallet). The plain base may already be taken (a local account registered
// before the prefixes were reserved, or two identities sharing a prefix), so
// the creation tries a bounded list of candidates, all at most 30 characters.
export const PROVIDER_USERNAME_MAX = 30;
const RANDOM_CANDIDATES = 5;

/**
 * Candidates for a new provider account: the base, the base + a stable
 * suffix from the provider identity (last 6 alphanumerics), then 5 random
 * suffixes. Characters outside [A-Za-z0-9_] become '_'.
 */
export function providerUsernameCandidates(base, stableSource = '') {
  const safe = String(base).replace(/[^A-Za-z0-9_]/g, '_');
  const stable = String(stableSource).replace(/[^A-Za-z0-9]/g, '').slice(-6);
  const out = [safe.slice(0, PROVIDER_USERNAME_MAX)];
  if (stable) out.push(`${safe.slice(0, PROVIDER_USERNAME_MAX - 1 - stable.length)}_${stable}`);
  for (let i = 0; i < RANDOM_CANDIDATES; i++) {
    out.push(`${safe.slice(0, PROVIDER_USERNAME_MAX - 9)}_${crypto.randomBytes(4).toString('hex')}`);
  }
  return [...new Set(out)];
}

/**
 * Create a provider account under the first free candidate username.
 * buildDoc(username) returns the User document. A duplicate username taken
 * in between moves to the next candidate (outside a transaction only: a
 * failed insert aborts a transaction). A duplicate on another unique key
 * (the provider identity or its synthetic email: a concurrent first login)
 * calls findWinner(); a returned user is used instead of an error.
 * Returns { user, created }.
 */
export async function createProviderUser(candidates, buildDoc, { session = null, findWinner = null } = {}) {
  let lastErr;
  for (const username of candidates) {
    if (await User.exists({ username }).session(session)) continue;
    try {
      // User.create(docs, options) with an array always returns an array.
      const [created] = await User.create([buildDoc(username)], { session });
      return { user: created, created: true };
    } catch (e) {
      if (e?.code === 11000 && e?.keyPattern?.username && !session) { lastErr = e; continue; }
      if (e?.code === 11000 && !session && findWinner) {
        const winner = await findWinner(e);
        if (winner) return { user: winner, created: false };
      }
      throw e;
    }
  }
  throw lastErr || createError(500, 'USERNAME_UNAVAILABLE', 'Kullanıcı adı üretilemedi');
}
