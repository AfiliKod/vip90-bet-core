import React, { useState, useEffect } from 'react';
import { reportsApi } from '../../api/client.js';
import { formatMoney } from '../billing/BillingDashboard.jsx';

const h = React.createElement;

export default function PlatformReports() {
  const [activeTab, setActiveTab] = useState('crossTenant');

  // Common Filters
  const [fromDate, setFromDate] = useState('2026-11-01');
  const [toDate, setToDate] = useState('2026-11-30');
  const [currency, setCurrency] = useState('TRY');
  const [groupBy, setGroupBy] = useState('tenant'); // 'tenant' | 'day'

  // Data states
  const [crossTenantData, setCrossTenantData] = useState({ report: [], totals: {} });
  const [sportsbookData, setSportsbookData] = useState({ report: [], totals: {} });
  const [balancesData, setBalancesData] = useState({ report: [], totals: {} });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchReportData();
  }, [activeTab, fromDate, toDate, currency, groupBy]);

  const fetchReportData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'crossTenant') {
        const res = await reportsApi.getCrossTenant({
          from: fromDate,
          to: toDate,
          groupBy,
          currency,
        });
        setCrossTenantData(res || { report: [], totals: {} });
      } else if (activeTab === 'sportsbook') {
        const res = await reportsApi.getSportsbook({
          from: fromDate,
          to: toDate,
          currency,
        });
        setSportsbookData(res || { report: [], totals: {} });
      } else if (activeTab === 'balances') {
        const res = await reportsApi.getPartnerBalances({
          currency,
          from: fromDate,
          to: toDate,
        });
        setBalancesData(res || { report: [], totals: {} });
      }
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Rapor verileri yüklenirken bir hata oluştu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const crossTotals = crossTenantData.totals || {};
  const sportsTotals = sportsbookData.totals || {};
  const balancesTotals = balancesData.totals || {};

  const crossCsvUrl = `/api/platform/reports/cross-tenant/export?from=${fromDate}&to=${toDate}&groupBy=${groupBy}&currency=${currency}`;
  const sportsCsvUrl = `/api/platform/reports/sportsbook-odds/export?from=${fromDate}&to=${toDate}&currency=${currency}`;

  return h(
    'div',
    { className: 'space-y-6' },

    // Header
    h(
      'div',
      { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4' },
      h(
        'div',
        null,
        h('h1', { className: 'text-2xl font-bold text-white' }, 'Platform Çapraz Operatör Raporları'),
        h('p', { className: 'text-sm text-slate-400 mt-1' }, 'Konsolide turnover, GGR, K20 bahis feed maliyetleri ve partner mutabakat bakiyeleri.')
      ),
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h(
          'a',
          {
            href: '/console/billing',
            className: 'px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors',
          },
          '← Faturalandırma Özeti'
        )
      )
    ),

    // Tabs
    h(
      'div',
      { className: 'flex border-b border-slate-800 gap-1' },
      h(
        'button',
        {
          type: 'button',
          onClick: () => setActiveTab('crossTenant'),
          className: `px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'crossTenant'
              ? 'border-indigo-500 text-white bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`,
        },
        'Çapraz Operatör Performansı'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => setActiveTab('sportsbook'),
          className: `px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'sportsbook'
              ? 'border-indigo-500 text-white bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`,
        },
        'K20 Bahis Altyapı Ücretleri'
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => setActiveTab('balances'),
          className: `px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'balances'
              ? 'border-indigo-500 text-white bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`,
        },
        'Partner Ticari Bakiyeleri'
      )
    ),

    // Filter Bar
    h(
      'div',
      { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap items-center gap-4 text-xs' },

      // Date Range
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h('label', { className: 'text-slate-400' }, 'Başlangıç:'),
        h('input', {
          type: 'date',
          value: fromDate,
          onChange: (e) => setFromDate(e.target.value),
          className: 'px-3 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700',
        })
      ),

      h(
        'div',
        { className: 'flex items-center gap-2' },
        h('label', { className: 'text-slate-400' }, 'Bitiş:'),
        h('input', {
          type: 'date',
          value: toDate,
          onChange: (e) => setToDate(e.target.value),
          className: 'px-3 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700',
        })
      ),

      // Currency
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h('label', { className: 'text-slate-400' }, 'Para Birimi:'),
        h(
          'select',
          {
            value: currency,
            onChange: (e) => setCurrency(e.target.value),
            className: 'px-3 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700',
          },
          h('option', { value: 'TRY' }, 'TRY'),
          h('option', { value: 'EUR' }, 'EUR'),
          h('option', { value: 'USD' }, 'USD')
        )
      ),

      // Group By Toggle (only for crossTenant)
      activeTab === 'crossTenant' &&
        h(
          'div',
          { className: 'flex items-center gap-2' },
          h('label', { className: 'text-slate-400' }, 'Gruplama:'),
          h(
            'div',
            { className: 'inline-flex rounded-md border border-slate-700 bg-slate-800 p-0.5' },
            h(
              'button',
              {
                type: 'button',
                onClick: () => setGroupBy('tenant'),
                className: `px-2.5 py-1 rounded text-xs transition-colors ${
                  groupBy === 'tenant' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`,
              },
              'Operatör Bazlı'
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: () => setGroupBy('day'),
                className: `px-2.5 py-1 rounded text-xs transition-colors ${
                  groupBy === 'day' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`,
              },
              'Gün Bazlı'
            )
          )
        ),

      // CSV Export Link
      h(
        'div',
        { className: 'ml-auto flex items-center gap-2' },
        activeTab === 'crossTenant' &&
          h(
            'a',
            {
              href: crossCsvUrl,
              download: `cross_tenant_report_${fromDate}_${toDate}.csv`,
              className: 'px-3 py-1.5 font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors',
            },
            'CSV İndir'
          ),
        activeTab === 'sportsbook' &&
          h(
            'a',
            {
              href: sportsCsvUrl,
              download: `sportsbook_odds_report_${fromDate}_${toDate}.csv`,
              className: 'px-3 py-1.5 font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors',
            },
            'CSV İndir'
          )
      )
    ),

    // Error Alert
    error &&
      h(
        'div',
        { className: 'p-4 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-200 text-sm' },
        error
      ),

    // Tab 1 Content: Cross-Tenant Performance
    activeTab === 'crossTenant' &&
      h(
        'div',
        { className: 'space-y-6' },

        // KPI Cards
        h(
          'div',
          { className: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3' },
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400' }, 'Casino Cirosu'),
            h('div', { className: 'text-base font-bold text-white mt-1' }, formatMoney(crossTotals.casinoTurnover, currency))
          ),
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400' }, 'Casino GGR'),
            h('div', { className: 'text-base font-bold text-emerald-400 mt-1' }, formatMoney(crossTotals.casinoGgr, currency))
          ),
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400' }, 'Spor Cirosu'),
            h('div', { className: 'text-base font-bold text-white mt-1' }, formatMoney(crossTotals.sportsTurnover, currency))
          ),
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400' }, 'Spor GGR (Gerçekleşen)'),
            h('div', { className: 'text-base font-bold text-emerald-400 mt-1' }, formatMoney(crossTotals.sportsGgrRealized, currency))
          ),
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400 font-semibold' }, 'Toplam GGR'),
            h('div', { className: 'text-base font-bold text-indigo-400 mt-1' }, formatMoney(crossTotals.totalGgr, currency))
          ),
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400' }, 'Aktif Oyuncular'),
            h('div', { className: 'text-base font-bold text-white mt-1' }, (crossTotals.activePlayers || 0).toLocaleString('tr-TR'))
          )
        ),

        // Table
        loading
          ? h('div', { className: 'p-12 text-center text-sm text-slate-500' }, 'Rapor hesaplanıyor...')
          : crossTenantData.report.length === 0
          ? h('div', { className: 'p-8 rounded-lg bg-slate-900 border border-slate-800 text-center text-sm text-slate-400' }, 'Bu kriterlerde rapor verisi bulunamadı.')
          : h(
              'div',
              { className: 'overflow-x-auto rounded-lg border border-slate-800 bg-slate-900' },
              h(
                'table',
                { className: 'w-full text-left text-xs text-slate-300 divide-y divide-slate-800' },
                h(
                  'thead',
                  { className: 'bg-slate-950/60 text-slate-400 uppercase tracking-wider' },
                  h(
                    'tr',
                    null,
                    h('th', { className: 'py-3 px-4' }, groupBy === 'tenant' ? 'Operatör' : 'Tarih'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Casino Cirosu'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Casino GGR'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Spor Cirosu'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Spor GGR'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Toplam GGR'),
                    h('th', { className: 'py-3 px-4 text-center' }, 'Aktif Oyuncu')
                  )
                ),
                h(
                  'tbody',
                  { className: 'divide-y divide-slate-800/60' },
                  crossTenantData.report.map((r) =>
                    h(
                      'tr',
                      { key: r.key, className: 'hover:bg-slate-800/40 transition-colors' },
                      h('td', { className: 'py-3 px-4 font-medium text-white' }, r.name || r.key),
                      h('td', { className: 'py-3 px-4 text-right text-slate-300' }, formatMoney(r.casinoTurnover, currency)),
                      h('td', { className: 'py-3 px-4 text-right text-emerald-400' }, formatMoney(r.casinoGgr, currency)),
                      h('td', { className: 'py-3 px-4 text-right text-slate-300' }, formatMoney(r.sportsTurnover, currency)),
                      h('td', { className: 'py-3 px-4 text-right text-emerald-400' }, formatMoney(r.sportsGgrRealized, currency)),
                      h('td', { className: 'py-3 px-4 text-right font-semibold text-indigo-300' }, formatMoney(r.totalGgr, currency)),
                      h('td', { className: 'py-3 px-4 text-center text-slate-400' }, r.activePlayers || 0)
                    )
                  )
                )
              )
            )
      ),

    // Tab 2 Content: Sportsbook Odds Fees
    activeTab === 'sportsbook' &&
      h(
        'div',
        { className: 'space-y-6' },

        // KPI Cards
        h(
          'div',
          { className: 'grid grid-cols-2 md:grid-cols-5 gap-3' },
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400' }, 'Toplam Bahis Cirosu'),
            h('div', { className: 'text-base font-bold text-white mt-1' }, formatMoney(sportsTotals.sportsTurnover, currency))
          ),
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400' }, 'Toplam Bahis GGR'),
            h('div', { className: 'text-base font-bold text-emerald-400 mt-1' }, formatMoney(sportsTotals.sportsGgr, currency))
          ),
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400' }, 'Sabit Aylık Ücretler'),
            h('div', { className: 'text-base font-bold text-slate-200 mt-1' }, formatMoney(sportsTotals.fixedFee, currency))
          ),
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400' }, 'Ciro Oranı Ücretleri'),
            h('div', { className: 'text-base font-bold text-indigo-400 mt-1' }, formatMoney(sportsTotals.turnoverFee, currency))
          ),
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400 font-semibold' }, 'Toplam Altyapı Ücreti'),
            h('div', { className: 'text-base font-bold text-emerald-400 mt-1' }, formatMoney(sportsTotals.totalFee, currency))
          )
        ),

        // Table
        loading
          ? h('div', { className: 'p-12 text-center text-sm text-slate-500' }, 'Rapor hesaplanıyor...')
          : sportsbookData.report.length === 0
          ? h('div', { className: 'p-8 rounded-lg bg-slate-900 border border-slate-800 text-center text-sm text-slate-400' }, 'Bu dönemde bahis verisi bulunamadı.')
          : h(
              'div',
              { className: 'overflow-x-auto rounded-lg border border-slate-800 bg-slate-900' },
              h(
                'table',
                { className: 'w-full text-left text-xs text-slate-300 divide-y divide-slate-800' },
                h(
                  'thead',
                  { className: 'bg-slate-950/60 text-slate-400 uppercase tracking-wider' },
                  h(
                    'tr',
                    null,
                    h('th', { className: 'py-3 px-4' }, 'Operatör (Tenant)'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Bahis Cirosu'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Bahis GGR'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Sabit Ücret'),
                    h('th', { className: 'py-3 px-4 text-center' }, 'Ciro Oranı'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Ciro Ücreti'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Toplam Maliyet')
                  )
                ),
                h(
                  'tbody',
                  { className: 'divide-y divide-slate-800/60' },
                  sportsbookData.report.map((r) =>
                    h(
                      'tr',
                      { key: r.tenantId, className: 'hover:bg-slate-800/40 transition-colors' },
                      h(
                        'td',
                        { className: 'py-3 px-4 font-medium text-white' },
                        h('div', null, r.tenantName || r.tenantKey),
                        h('div', { className: 'text-slate-500 font-mono text-xs' }, r.tenantKey)
                      ),
                      h('td', { className: 'py-3 px-4 text-right text-slate-300' }, formatMoney(r.sportsTurnover, currency)),
                      h('td', { className: 'py-3 px-4 text-right text-emerald-400' }, formatMoney(r.sportsGgr, currency)),
                      h('td', { className: 'py-3 px-4 text-right text-slate-400' }, formatMoney(r.fixedFee, currency)),
                      h('td', { className: 'py-3 px-4 text-center text-slate-400' }, r.turnoverRate ? `${(r.turnoverRate * 100).toFixed(2)}%` : '-'),
                      h('td', { className: 'py-3 px-4 text-right text-indigo-400' }, formatMoney(r.turnoverFee, currency)),
                      h('td', { className: 'py-3 px-4 text-right font-bold text-white' }, formatMoney(r.totalFee, currency))
                    )
                  )
                )
              )
            )
      ),

    // Tab 3 Content: Partner Commercial Balances
    activeTab === 'balances' &&
      h(
        'div',
        { className: 'space-y-6' },

        // KPI Cards
        h(
          'div',
          { className: 'grid grid-cols-2 md:grid-cols-4 gap-3' },
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400' }, 'Toplam Kesilen Ekstre Tutarı'),
            h('div', { className: 'text-base font-bold text-white mt-1' }, formatMoney(balancesTotals.issuedAmount || 0, currency))
          ),
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400' }, 'Ödenen / Kapatılan Tutar'),
            h('div', { className: 'text-base font-bold text-emerald-400 mt-1' }, formatMoney(balancesTotals.settledAmount || 0, currency))
          ),
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400 font-semibold' }, 'Bekleyen Açık Bakiye'),
            h('div', { className: 'text-base font-bold text-amber-400 mt-1' }, formatMoney(balancesTotals.pendingAmount || 0, currency))
          ),
          h(
            'div',
            { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800' },
            h('div', { className: 'text-xs text-slate-400' }, 'Toplam Ekstre Sayısı'),
            h('div', { className: 'text-base font-bold text-white mt-1' }, balancesTotals.statementsCount || 0)
          )
        ),

        // Table
        loading
          ? h('div', { className: 'p-12 text-center text-sm text-slate-500' }, 'Bakiyeler yükleniyor...')
          : balancesData.report?.length === 0
          ? h('div', { className: 'p-8 rounded-lg bg-slate-900 border border-slate-800 text-center text-sm text-slate-400' }, 'Partner bakiye verisi bulunamadı.')
          : h(
              'div',
              { className: 'overflow-x-auto rounded-lg border border-slate-800 bg-slate-900' },
              h(
                'table',
                { className: 'w-full text-left text-xs text-slate-300 divide-y divide-slate-800' },
                h(
                  'thead',
                  { className: 'bg-slate-950/60 text-slate-400 uppercase tracking-wider' },
                  h(
                    'tr',
                    null,
                    h('th', { className: 'py-3 px-4' }, 'Partner'),
                    h('th', { className: 'py-3 px-4 text-center' }, 'Ekstre Sayısı'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Kesilen Tutar'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Ödenen Tutar'),
                    h('th', { className: 'py-3 px-4 text-right' }, 'Açık Bakiye')
                  )
                ),
                h(
                  'tbody',
                  { className: 'divide-y divide-slate-800/60' },
                  (balancesData.report || []).map((b) =>
                    h(
                      'tr',
                      { key: b.partnerId, className: 'hover:bg-slate-800/40 transition-colors' },
                      h('td', { className: 'py-3 px-4 font-medium text-white' }, b.partnerName || b.partnerKey),
                      h('td', { className: 'py-3 px-4 text-center text-slate-400' }, b.statementsCount || 0),
                      h('td', { className: 'py-3 px-4 text-right text-slate-300' }, formatMoney(b.issuedAmount, currency)),
                      h('td', { className: 'py-3 px-4 text-right text-emerald-400' }, formatMoney(b.settledAmount, currency)),
                      h('td', { className: 'py-3 px-4 text-right font-semibold text-amber-400' }, formatMoney(b.pendingAmount, currency))
                    )
                  )
                )
              )
            )
      )
  );
}
