import {
  getCrossTenantPerformanceReport,
  getSportsbookOddsReport,
  getPartnerCommercialBalancesReport,
} from '../services/platformReportsService.js';

export async function getCrossTenantReportHandler(req, res, next) {
  try {
    const { from, to, groupBy, currency } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

    const data = await getCrossTenantPerformanceReport({ from, to, groupBy, currency });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getSportsbookReportHandler(req, res, next) {
  try {
    const { from, to, currency } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

    const data = await getSportsbookOddsReport({ from, to, currency });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getPartnerBalancesReportHandler(req, res, next) {
  try {
    const { currency, partnerId, from, to } = req.query;
    const data = await getPartnerCommercialBalancesReport({ currency, partnerId, from, to });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function exportCrossTenantCsvHandler(req, res, next) {
  try {
    const { from, to, groupBy, currency } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

    const { report } = await getCrossTenantPerformanceReport({ from, to, groupBy, currency });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="cross_tenant_report_${from}_${to}.csv"`);

    res.write('Identifier,Name,Casino Turnover,Casino GGR,Sports Turnover,Sports GGR,Total GGR\n');
    for (const r of report) {
      res.write(
        `"${r.key}","${(r.name || '').replace(/"/g, '""')}",${r.casinoTurnover},${r.casinoGgr},${r.sportsTurnover},${r.sportsGgrRealized},${r.totalGgr}\n`
      );
    }
    res.end();
  } catch (err) {
    next(err);
  }
}

export async function exportSportsbookCsvHandler(req, res, next) {
  try {
    const { from, to, currency } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to dates are required' });

    const { report } = await getSportsbookOddsReport({ from, to, currency });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sportsbook_odds_report_${from}_${to}.csv"`);

    res.write('Tenant Key,Tenant Name,Sports Turnover,Sports GGR,Fixed Fee,Turnover Rate,Turnover Fee,Total Fee\n');
    for (const r of report) {
      res.write(
        `"${r.tenantKey}","${(r.tenantName || '').replace(/"/g, '""')}",${r.sportsTurnover},${r.sportsGgr},${r.fixedFee},${r.turnoverRate},${r.turnoverFee},${r.totalFee}\n`
      );
    }
    res.end();
  } catch (err) {
    next(err);
  }
}
