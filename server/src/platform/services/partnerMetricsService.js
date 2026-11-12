import TenantDailyStat from '../../models/TenantDailyStat.js';
import PartnerOperatorLink from '../../models/PartnerOperatorLink.js';

export async function getPartnerLinkedTenantIds(partnerId) {
  const links = await PartnerOperatorLink.find({ partnerId, validTo: null }).select('tenantId').lean();
  return links.map((l) => l.tenantId);
}

export function applySmallCellSuppression(activePlayers) {
  if (typeof activePlayers === 'number' && activePlayers < 5) {
    return '<5';
  }
  return activePlayers;
}

function statsFilter(tenantIds, { from, to } = {}) {
  const filter = { tenantId: { $in: tenantIds } };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  return filter;
}

function emptyTotals() {
  return {
    casinoTurnover: 0,
    casinoGgr: 0,
    sportsTurnover: 0,
    sportsGgrRealized: 0,
    bonusCost: 0,
    deposits: 0,
    withdrawals: 0,
    activePlayers: 0,
  };
}

function sumStats(stats) {
  const totals = emptyTotals();
  for (const s of stats) {
    totals.casinoTurnover += s.casinoTurnover || 0;
    totals.casinoGgr += s.casinoGgr || 0;
    totals.sportsTurnover += s.sportsTurnover || 0;
    totals.sportsGgrRealized += s.sportsGgrRealized || 0;
    totals.bonusCost += s.bonusCost || 0;
    totals.deposits += s.deposits || 0;
    totals.withdrawals += s.withdrawals || 0;
    totals.activePlayers += s.activePlayers || 0;
  }
  totals.activePlayers = applySmallCellSuppression(totals.activePlayers);
  return totals;
}

export async function getPortfolioMetrics(partnerId, { from, to } = {}) {
  const tenantIds = await getPartnerLinkedTenantIds(partnerId);
  const stats = await TenantDailyStat.find(statsFilter(tenantIds, { from, to })).lean();
  return { totals: sumStats(stats), periodStats: stats };
}

export async function getTenantMetrics(partnerId, tenantId, { from, to } = {}) {
  const stats = await TenantDailyStat.find(statsFilter([tenantId], { from, to })).lean();
  return { metrics: sumStats(stats) };
}
