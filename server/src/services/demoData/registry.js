// server/src/services/demoData/registry.js
import * as userSeed from './userSeed.js';
import * as sportsSeed from './sportsSeed.js';
import * as casinoSeed from './casinoSeed.js';
import * as kycSeed from './kycSeed.js';
import * as riskSeed from './riskSeed.js';
import * as ticketSeed from './ticketSeed.js';
import * as agentSeed from './agentSeed.js';
import * as paymentRequestSeed from './paymentRequestSeed.js';
import { pickWeighted } from './randomUtils.js';

export const CATEGORY_IDS = ['users', 'sports', 'casino', 'kyc', 'risk', 'tickets', 'agents', 'payments'];

const GENERATORS = {
  users: userSeed, sports: sportsSeed, casino: casinoSeed, kyc: kycSeed,
  risk: riskSeed, tickets: ticketSeed, agents: agentSeed, payments: paymentRequestSeed,
};

// 'users' temizlenirken ÖNCE temizlenmesi gereken bağımlı kategoriler
// (orphan userId referansı kalmasın) — bkz. spec § Bağımlılık sırası.
const DEPENDENTS_OF_USERS = ['sports', 'casino', 'kyc', 'risk', 'tickets', 'agents', 'payments'];

// Canlı tick ağırlıkları — casino/sports en sık, agents en seyrek (bkz. spec § Admin UI).
const LIVE_TICK_WEIGHTS = [
  ['casino', 30], ['sports', 25], ['users', 20], ['kyc', 8],
  ['risk', 7], ['tickets', 5], ['payments', 4], ['agents', 1],
];

export function isValidCategory(category) {
  return CATEGORY_IDS.includes(category);
}

export async function loadCategory(category, count) {
  if (!isValidCategory(category)) throw new Error(`Bilinmeyen kategori: ${category}`);
  return GENERATORS[category].load(count);
}

export async function clearCategory(category) {
  if (!isValidCategory(category)) throw new Error(`Bilinmeyen kategori: ${category}`);
  if (category === 'users') {
    for (const dep of DEPENDENTS_OF_USERS) {
      await GENERATORS[dep].clear();
    }
  }
  return GENERATORS[category].clear();
}

export async function clearAll() {
  return clearCategory('users');
}

export async function getStatus() {
  const entries = await Promise.all(
    CATEGORY_IDS.map(async (id) => [id, await GENERATORS[id].status()]),
  );
  return Object.fromEntries(entries);
}

export async function runLiveTick() {
  const tickCount = Math.random() < 0.3 ? 2 : 1;
  const results = [];
  for (let i = 0; i < tickCount; i++) {
    const category = pickWeighted(LIVE_TICK_WEIGHTS);
    try {
      const result = await GENERATORS[category].liveTick();
      results.push({ category, result });
    } catch (e) {
      console.error(`[demoData] liveTick(${category}) hatası:`, e.message);
    }
  }
  return results;
}
