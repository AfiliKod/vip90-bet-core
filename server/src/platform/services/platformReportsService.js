import TenantDailyStat from '../../models/TenantDailyStat.js';
import OperatorFeePlan from '../../models/OperatorFeePlan.js';
import PartnerStatement from '../../models/PartnerStatement.js';
import Tenant from '../../models/Tenant.js';
import Partner from '../../models/Partner.js';
import { roundMoney } from './commissionCalculator.js';

/**
 * Cross-tenant performance report aggregating turnover and GGR across operators.
 *
 * @param {object} params
 * @param {string} params.from - Start date (YYYY-MM-DD inclusive)
 * @param {string} params.to - End date (YYYY-MM-DD inclusive)
 * @param {string} [params.groupBy='tenant'] - 'tenant' or 'day'
 * @param {string} [params.currency='TRY'] - Monocurrency filter
 * @returns {Promise<{ report: Array<object>, totals: object, currency: string, period: { from: string, to: string } }>}
 */
export async function getCrossTenantPerformanceReport({ from, to, groupBy = 'tenant', currency = 'TRY' }) {
  const match = { date: { $gte: from, $lte: to }, currency };
  const stats = await TenantDailyStat.find(match).populate('tenantId', 'key name').lean();

  const grouped = {};
  const totals = {
    casinoTurnover: 0,
    casinoGgr: 0,
    sportsTurnover: 0,
    sportsGgrRealized: 0,
    totalGgr: 0,
    activePlayers: 0,
  };

  for (const s of stats) {
    const isDay = groupBy === 'day';
    const key = isDay ? s.date : (s.tenantId?.key || String(s.tenantId?._id || s.tenantId));
    const name = isDay ? s.date : (s.tenantId?.name || key);

    if (!grouped[key]) {
      grouped[key] = {
        key,
        name,
        casinoTurnover: 0,
        casinoGgr: 0,
        sportsTurnover: 0,
        sportsGgrRealized: 0,
        totalGgr: 0,
        activePlayers: 0,
      };
    }

    const item = grouped[key];
    const cTurnover = s.casinoTurnover || 0;
    const cGgr = s.casinoGgr || 0;
    const sTurnover = s.sportsTurnover || 0;
    const sGgr = s.sportsGgrRealized || 0;
    const totGgr = cGgr + sGgr;
    const actPlayers = s.activePlayers || 0;

    item.casinoTurnover += cTurnover;
    item.casinoGgr += cGgr;
    item.sportsTurnover += sTurnover;
    item.sportsGgrRealized += sGgr;
    item.totalGgr += totGgr;
    item.activePlayers += actPlayers;

    totals.casinoTurnover += cTurnover;
    totals.casinoGgr += cGgr;
    totals.sportsTurnover += sTurnover;
    totals.sportsGgrRealized += sGgr;
    totals.totalGgr += totGgr;
    totals.activePlayers += actPlayers;
  }

  for (const item of Object.values(grouped)) {
    item.casinoTurnover = roundMoney(item.casinoTurnover);
    item.casinoGgr = roundMoney(item.casinoGgr);
    item.sportsTurnover = roundMoney(item.sportsTurnover);
    item.sportsGgrRealized = roundMoney(item.sportsGgrRealized);
    item.totalGgr = roundMoney(item.totalGgr);
  }

  totals.casinoTurnover = roundMoney(totals.casinoTurnover);
  totals.casinoGgr = roundMoney(totals.casinoGgr);
  totals.sportsTurnover = roundMoney(totals.sportsTurnover);
  totals.sportsGgrRealized = roundMoney(totals.sportsGgrRealized);
  totals.totalGgr = roundMoney(totals.totalGgr);

  return { report: Object.values(grouped), totals, currency, period: { from, to } };
}

/**
 * K20 Sportsbook odds feed fee report per operator based on active OperatorFeePlans.
 *
 * @param {object} params
 * @param {string} params.from - Start date (YYYY-MM-DD inclusive)
 * @param {string} params.to - End date (YYYY-MM-DD inclusive)
 * @param {string} [params.currency='TRY'] - Monocurrency filter
 * @returns {Promise<{ report: Array<object>, totals: object, currency: string, period: { from: string, to: string } }>}
 */
export async function getSportsbookOddsReport({ from, to, currency = 'TRY' }) {
  const stats = await TenantDailyStat.find({ date: { $gte: from, $lte: to }, currency })
    .populate('tenantId', 'key name')
    .lean();

  const feePlans = await OperatorFeePlan.find({ validTo: null }).lean();
  const feeMap = new Map(feePlans.map((fp) => [String(fp.tenantId), fp]));

  const byTenant = {};
  for (const s of stats) {
    const tid = String(s.tenantId?._id || s.tenantId);
    if (!byTenant[tid]) {
      const fp = feeMap.get(tid);
      const sbFee = fp?.sportsbookFee;
      const model = sbFee?.model || 'none';
      const fixedMonthlyFee = (model === 'fixed' || model === 'both') ? (sbFee?.fixedMonthlyFee || 0) : 0;
      const turnoverRate = (model === 'turnover_percentage' || model === 'both') ? (sbFee?.turnoverRate || 0) : 0;

      byTenant[tid] = {
        tenantId: tid,
        tenantKey: s.tenantId?.key || tid,
        tenantName: s.tenantId?.name || tid,
        sportsTurnover: 0,
        sportsGgr: 0,
        fixedFee: fixedMonthlyFee,
        turnoverRate,
        turnoverFee: 0,
        totalFee: 0,
      };
    }
    byTenant[tid].sportsTurnover += s.sportsTurnover || 0;
    byTenant[tid].sportsGgr += s.sportsGgrRealized || 0;
  }

  const totals = {
    sportsTurnover: 0,
    sportsGgr: 0,
    fixedFee: 0,
    turnoverFee: 0,
    totalFee: 0,
  };

  for (const item of Object.values(byTenant)) {
    item.sportsTurnover = roundMoney(item.sportsTurnover);
    item.sportsGgr = roundMoney(item.sportsGgr);
    item.fixedFee = roundMoney(item.fixedFee);
    item.turnoverFee = roundMoney(item.sportsTurnover * item.turnoverRate);
    item.totalFee = roundMoney(item.fixedFee + item.turnoverFee);

    totals.sportsTurnover = roundMoney(totals.sportsTurnover + item.sportsTurnover);
    totals.sportsGgr = roundMoney(totals.sportsGgr + item.sportsGgr);
    totals.fixedFee = roundMoney(totals.fixedFee + item.fixedFee);
    totals.turnoverFee = roundMoney(totals.turnoverFee + item.turnoverFee);
    totals.totalFee = roundMoney(totals.totalFee + item.totalFee);
  }

  return { report: Object.values(byTenant), totals, currency, period: { from, to } };
}

/**
 * Partner commercial balances report aggregating statement balances per partner.
 *
 * @param {object} [params]
 * @param {string} [params.currency='TRY']
 * @param {string} [params.partnerId]
 * @param {string} [params.from]
 * @param {string} [params.to]
 * @returns {Promise<{ report: Array<object>, totals: object, currency: string, period?: { from: string, to: string } }>}
 */
export async function getPartnerCommercialBalancesReport({ currency = 'TRY', partnerId, from, to } = {}) {
  const partnerMatch = partnerId ? { _id: partnerId } : {};
  const partners = await Partner.find(partnerMatch).lean();
  const partnerMap = new Map(partners.map((p) => [String(p._id), p]));

  const stmtMatch = { currency };
  if (partnerId) stmtMatch.partnerId = partnerId;
  if (from && to) {
    stmtMatch.periodStart = { $gte: from };
    stmtMatch.periodEnd = { $lte: to };
  }

  const statements = await PartnerStatement.find(stmtMatch).lean();

  const byPartner = {};

  for (const p of partners) {
    const pid = String(p._id);
    byPartner[pid] = {
      partnerId: pid,
      partnerKey: p.key,
      partnerName: p.name,
      direction: p.defaultCommercialTerms?.model || 'revenue_share',
      currency,
      draftAmount: 0,
      issuedAmount: 0,
      settledAmount: 0,
      voidedAmount: 0,
      outstandingBalance: 0,
      statementsCount: 0,
    };
  }

  for (const stmt of statements) {
    const pid = String(stmt.partnerId);
    if (!byPartner[pid]) {
      const p = partnerMap.get(pid);
      byPartner[pid] = {
        partnerId: pid,
        partnerKey: p?.key || pid,
        partnerName: p?.name || pid,
        direction: stmt.direction || p?.defaultCommercialTerms?.model || 'revenue_share',
        currency,
        draftAmount: 0,
        issuedAmount: 0,
        settledAmount: 0,
        voidedAmount: 0,
        outstandingBalance: 0,
        statementsCount: 0,
      };
    }

    const item = byPartner[pid];
    item.statementsCount += 1;
    const amount = stmt.finalAmount ?? stmt.netAmount ?? 0;

    if (stmt.status === 'draft') {
      item.draftAmount += amount;
    } else if (stmt.status === 'issued') {
      item.issuedAmount += amount;
      item.outstandingBalance += amount;
    } else if (stmt.status === 'settled') {
      item.settledAmount += amount;
    } else if (stmt.status === 'voided') {
      item.voidedAmount += amount;
    }
  }

  const totals = {
    draftAmount: 0,
    issuedAmount: 0,
    settledAmount: 0,
    voidedAmount: 0,
    outstandingBalance: 0,
    statementsCount: 0,
  };

  for (const item of Object.values(byPartner)) {
    item.draftAmount = roundMoney(item.draftAmount);
    item.issuedAmount = roundMoney(item.issuedAmount);
    item.settledAmount = roundMoney(item.settledAmount);
    item.voidedAmount = roundMoney(item.voidedAmount);
    item.outstandingBalance = roundMoney(item.outstandingBalance);

    totals.draftAmount = roundMoney(totals.draftAmount + item.draftAmount);
    totals.issuedAmount = roundMoney(totals.issuedAmount + item.issuedAmount);
    totals.settledAmount = roundMoney(totals.settledAmount + item.settledAmount);
    totals.voidedAmount = roundMoney(totals.voidedAmount + item.voidedAmount);
    totals.outstandingBalance = roundMoney(totals.outstandingBalance + item.outstandingBalance);
    totals.statementsCount += item.statementsCount;
  }

  const result = { report: Object.values(byPartner), totals, currency };
  if (from && to) {
    result.period = { from, to };
  }
  return result;
}
