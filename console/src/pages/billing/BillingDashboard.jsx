import React, { useState, useEffect } from 'react';
import { billingApi } from '../../api/client.js';

const h = React.createElement;

export function formatMoney(amount, currency = 'TRY') {
  if (amount === undefined || amount === null || isNaN(amount)) return `0.00 ${currency}`;
  const formatted = Number(amount).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
}

export const STATEMENT_STATUS_MAP = {
  draft: { label: 'Taslak', badge: 'bg-slate-800 text-slate-300 border-slate-700' },
  issued: { label: 'Kesildi', badge: 'bg-indigo-950 text-indigo-400 border-indigo-500/40' },
  settled: { label: 'Ödendi', badge: 'bg-emerald-950 text-emerald-400 border-emerald-500/40' },
  voided: { label: 'İptal', badge: 'bg-rose-950 text-rose-400 border-rose-500/40' },
};

export const DIRECTION_MAP = {
  revenue_share: 'Gelir Paylaşımı (RevShare)',
  wholesale: 'Toptan / Platform Ücreti',
  both: 'Karma (RevShare + Toptan)',
};

export default function BillingDashboard() {
  const [statements, setStatements] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [stmtsRes, plansRes] = await Promise.allSettled([
        billingApi.listStatements({}),
        billingApi.listPlans(),
      ]);

      if (stmtsRes.status === 'fulfilled') {
        setStatements(stmtsRes.value?.statements || []);
      } else {
        const err = stmtsRes.reason?.response?.data?.error?.message || 'Ekstreler alınamadı';
        setError(err);
      }

      if (plansRes.status === 'fulfilled') {
        setPlans(plansRes.value?.plans || []);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Faturalandırma verileri yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  // Group by currency without cross-currency summing
  const currencyStats = {};
  const statusCounts = { total: 0, draft: 0, issued: 0, settled: 0, voided: 0 };

  for (const s of statements) {
    statusCounts.total += 1;
    if (statusCounts[s.status] !== undefined) {
      statusCounts[s.status] += 1;
    }

    const cur = s.currency || 'TRY';
    if (!currencyStats[cur]) {
      currencyStats[cur] = { revShare: 0, wholesale: 0, totalNet: 0 };
    }

    if (s.direction === 'revenue_share') {
      currencyStats[cur].revShare += s.finalAmount || 0;
    } else if (s.direction === 'wholesale') {
      currencyStats[cur].wholesale += s.finalAmount || 0;
    } else {
      currencyStats[cur].revShare += s.finalAmount || 0;
    }
    currencyStats[cur].totalNet += s.finalAmount || 0;
  }

  const currencies = Object.keys(currencyStats);

  return h(
    'div',
    { className: 'space-y-8' },

    // Header
    h(
      'div',
      { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4' },
      h(
        'div',
        null,
        h('h1', { className: 'text-2xl font-bold text-white' }, 'Faturalandırma ve Ücret Yönetimi'),
        h('p', { className: 'text-sm text-slate-400 mt-1' }, 'Operatör ücret planları, partner komisyon ekstreleri ve mutabakat özeti.')
      ),
      h(
        'div',
        { className: 'flex flex-wrap items-center gap-2' },
        h(
          'a',
          {
            href: '/console/billing/plans',
            className: 'px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors',
          },
          'Ücret Planları'
        ),
        h(
          'a',
          {
            href: '/console/billing/statements',
            className: 'px-3 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors',
          },
          'Hesap Ekstreleri'
        ),
        h(
          'a',
          {
            href: '/console/reports',
            className: 'px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors',
          },
          'Platform Raporları'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: fetchDashboardData,
            className: 'px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors',
          },
          'Yenile'
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

    // KPI Cards
    h(
      'div',
      { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' },

      // Card 1: Ekstre Sayıları
      h(
        'div',
        { className: 'p-5 rounded-lg bg-slate-900 border border-slate-800 shadow-sm' },
        h('div', { className: 'text-xs font-medium text-slate-400 uppercase tracking-wider' }, 'Toplam Ekstre'),
        h('div', { className: 'text-2xl font-bold text-white mt-2' }, statusCounts.total),
        h(
          'div',
          { className: 'flex flex-wrap gap-2 text-xs text-slate-400 mt-3 pt-3 border-t border-slate-800/80' },
          h('span', { className: 'text-indigo-400 font-medium' }, `${statusCounts.issued} Kesildi`),
          h('span', null, '•'),
          h('span', { className: 'text-slate-300' }, `${statusCounts.draft} Taslak`),
          h('span', null, '•'),
          h('span', { className: 'text-rose-400' }, `${statusCounts.voided} İptal`)
        )
      ),

      // Card 2: Gelir Paylaşımı (RevShare)
      h(
        'div',
        { className: 'p-5 rounded-lg bg-slate-900 border border-slate-800 shadow-sm' },
        h('div', { className: 'text-xs font-medium text-slate-400 uppercase tracking-wider' }, 'Gelir Paylaşımı (RevShare)'),
        currencies.length === 0
          ? h('div', { className: 'text-2xl font-bold text-slate-500 mt-2' }, '0.00 TRY')
          : h(
              'div',
              { className: 'mt-2 space-y-1' },
              currencies.map((cur) =>
                h(
                  'div',
                  { key: cur, className: 'text-xl font-bold text-emerald-400' },
                  formatMoney(currencyStats[cur].revShare, cur)
                )
              )
            ),
        h('div', { className: 'text-xs text-slate-500 mt-3 pt-3 border-t border-slate-800/80' }, 'Platformun partnerlere ödeyeceği hak ediş')
      ),

      // Card 3: Toptan & Platform Ücretleri (Wholesale)
      h(
        'div',
        { className: 'p-5 rounded-lg bg-slate-900 border border-slate-800 shadow-sm' },
        h('div', { className: 'text-xs font-medium text-slate-400 uppercase tracking-wider' }, 'Toptan / Platform Ücreti'),
        currencies.length === 0
          ? h('div', { className: 'text-2xl font-bold text-slate-500 mt-2' }, '0.00 TRY')
          : h(
              'div',
              { className: 'mt-2 space-y-1' },
              currencies.map((cur) =>
                h(
                  'div',
                  { key: cur, className: 'text-xl font-bold text-indigo-400' },
                  formatMoney(currencyStats[cur].wholesale, cur)
                )
              )
            ),
        h('div', { className: 'text-xs text-slate-500 mt-3 pt-3 border-t border-slate-800/80' }, 'Partnerlerin platforma ödeyeceği sabit/lisans')
      ),

      // Card 4: Aktif Ücret Planları
      h(
        'div',
        { className: 'p-5 rounded-lg bg-slate-900 border border-slate-800 shadow-sm' },
        h('div', { className: 'text-xs font-medium text-slate-400 uppercase tracking-wider' }, 'Aktif Ücret Planları'),
        h('div', { className: 'text-2xl font-bold text-white mt-2' }, plans.length),
        h(
          'div',
          { className: 'text-xs text-slate-500 mt-3 pt-3 border-t border-slate-800/80' },
          'K20 spor bahisleri ve operatör lisans modelleri'
        )
      )
    ),

    // Quick Navigation Cards
    h(
      'div',
      { className: 'grid grid-cols-1 md:grid-cols-3 gap-4' },
      h(
        'a',
        {
          href: '/console/billing/plans',
          className: 'p-5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-all group',
        },
        h('div', { className: 'text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors' }, 'Operatör Ücret Planları →'),
        h('div', { className: 'text-xs text-slate-400 mt-1' }, 'K20 spor bahisleri odds feed ücretleri (sabit ve turnover) ile operatör platform ücretlerini yapılandırın.')
      ),
      h(
        'a',
        {
          href: '/console/billing/statements',
          className: 'p-5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-all group',
        },
        h('div', { className: 'text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors' }, 'Partner Hesap Ekstreleri →'),
        h('div', { className: 'text-xs text-slate-400 mt-1' }, 'Dönemsel ekstre oluşturma, onaylama/kesinleştirme, düzeltme ekleme ve CSV çıktısı alma.')
      ),
      h(
        'a',
        {
          href: '/console/reports',
          className: 'p-5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-all group',
        },
        h('div', { className: 'text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors' }, 'Platform Çapraz Raporları →'),
        h('div', { className: 'text-xs text-slate-400 mt-1' }, 'Çapraz operatör turnover, casino ve spor GGR metrikleri ile K20 bahis feed maliyet analizleri.')
      )
    ),

    // Recent Statements Section
    h(
      'div',
      { className: 'space-y-4' },
      h(
        'div',
        { className: 'flex items-center justify-between' },
        h('h2', { className: 'text-lg font-semibold text-white' }, 'Son Hesap Ekstreleri'),
        h(
          'a',
          { href: '/console/billing/statements', className: 'text-xs font-medium text-indigo-400 hover:text-indigo-300' },
          'Tümünü Gör (' + statements.length + ') →'
        )
      ),

      loading
        ? h('div', { className: 'p-8 text-center text-sm text-slate-500' }, 'Ekstreler yükleniyor...')
        : statements.length === 0
        ? h(
            'div',
            { className: 'p-8 rounded-lg bg-slate-900 border border-slate-800 text-center text-sm text-slate-400' },
            'Henüz oluşturulmuş bir hesap ekstresi bulunmuyor.'
          )
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
                  h('th', { className: 'py-3 px-4' }, 'Ekstre No'),
                  h('th', { className: 'py-3 px-4' }, 'Partner'),
                  h('th', { className: 'py-3 px-4' }, 'Dönem'),
                  h('th', { className: 'py-3 px-4' }, 'Para Birimi'),
                  h('th', { className: 'py-3 px-4' }, 'Model'),
                  h('th', { className: 'py-3 px-4 text-right' }, 'Nihai Tutar'),
                  h('th', { className: 'py-3 px-4' }, 'Durum'),
                  h('th', { className: 'py-3 px-4 text-right' }, 'İşlem')
                )
              ),
              h(
                'tbody',
                { className: 'divide-y divide-slate-800/60' },
                statements.slice(0, 5).map((s) => {
                  const statusInfo = STATEMENT_STATUS_MAP[s.status] || { label: s.status, badge: 'bg-slate-800 text-slate-300' };
                  return h(
                    'tr',
                    { key: s._id, className: 'hover:bg-slate-800/40 transition-colors' },
                    h(
                      'td',
                      { className: 'py-3 px-4 font-mono font-medium text-white' },
                      h(
                        'a',
                        {
                          href: `/console/billing/statements/${s._id}`,
                          className: 'hover:text-indigo-400 transition-colors',
                        },
                        s.statementNumber
                      )
                    ),
                    h('td', { className: 'py-3 px-4 text-slate-200' }, s.partnerId?.name || s.partnerId?.key || s.partnerId || '-'),
                    h('td', { className: 'py-3 px-4 text-slate-400' }, `${s.periodStart} ~ ${s.periodEnd}`),
                    h('td', { className: 'py-3 px-4 font-medium text-slate-300' }, s.currency),
                    h('td', { className: 'py-3 px-4 text-slate-400' }, DIRECTION_MAP[s.direction] || s.direction),
                    h('td', { className: 'py-3 px-4 text-right font-semibold text-white' }, formatMoney(s.finalAmount, s.currency)),
                    h(
                      'td',
                      { className: 'py-3 px-4' },
                      h(
                        'span',
                        { className: `inline-flex px-2 py-0.5 rounded text-xs font-medium border ${statusInfo.badge}` },
                        statusInfo.label
                      )
                    ),
                    h(
                      'td',
                      { className: 'py-3 px-4 text-right' },
                      h(
                        'a',
                        {
                          href: `/console/billing/statements/${s._id}`,
                          className: 'text-indigo-400 hover:text-indigo-300 font-medium',
                        },
                        'Detay →'
                      )
                    )
                  );
                })
              )
            )
          )
    )
  );
}
