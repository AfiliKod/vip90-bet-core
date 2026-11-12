import React, { useState, useEffect } from 'react';
import { partnerClient } from '../../api/client.js';

const h = React.createElement;

export const STATEMENT_STATUS_LABELS = {
  issued: { text: 'Yayınlandı', className: 'bg-emerald-950 text-emerald-400 border-emerald-500/40' },
  settled: { text: 'Ödendi', className: 'bg-blue-950 text-blue-400 border-blue-500/40' },
  draft: { text: 'Taslak', className: 'bg-amber-950 text-amber-400 border-amber-500/40' },
  voided: { text: 'İptal Edildi', className: 'bg-rose-950 text-rose-400 border-rose-500/40' },
};

export const STATEMENT_DIRECTION_LABELS = {
  revenue_share: 'Gelir Paylaşımı',
  wholesale: 'Toptan (Wholesale)',
  both: 'Karma (Wholesale + Revshare)',
};

export function formatMoney(amount, currency) {
  if (amount == null || isNaN(amount)) return `0,00 ${currency || ''}`.trim();
  const formatted = Number(amount).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency || ''}`.trim();
}

export default function PartnerStatementsList() {
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    fetchStatements();
  }, []);

  const fetchStatements = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await partnerClient.get('/statements');
      setStatements(res?.data?.statements || []);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Komisyon ekstreleri yüklenirken bir hata oluştu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async (statementId, statementNumber) => {
    setDownloadingId(statementId);
    try {
      const res = await partnerClient.get(`/statements/${statementId}/export`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${statementNumber || statementId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'CSV dışa aktarımı başarısız oldu.';
      setError(msg);
    } finally {
      setDownloadingId(null);
    }
  };

  // Distinct currencies for filter dropdown
  const uniqueCurrencies = Array.from(
    new Set(statements.map((s) => s.currency).filter(Boolean))
  );

  // Group totals strictly by currency — never sum across different currencies
  const totalsByCurrency = statements.reduce((acc, stmt) => {
    const curr = stmt.currency || 'TRY';
    if (!acc[curr]) {
      acc[curr] = { gross: 0, adjustments: 0, net: 0, count: 0 };
    }
    acc[curr].gross += stmt.grossAmount || 0;
    acc[curr].adjustments += stmt.adjustmentsAmount || 0;
    acc[curr].net += stmt.netAmount != null ? stmt.netAmount : stmt.finalAmount || 0;
    acc[curr].count += 1;
    return acc;
  }, {});

  const filteredStatements = statements.filter((stmt) => {
    const matchesSearch =
      !searchTerm ||
      (stmt.statementNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (stmt.periodStart || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (stmt.periodEnd || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCurrency = currencyFilter === 'all' || stmt.currency === currencyFilter;
    const matchesStatus = statusFilter === 'all' || stmt.status === statusFilter;
    return matchesSearch && matchesCurrency && matchesStatus;
  });

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
        h('h1', { className: 'text-2xl font-bold text-white' }, 'Komisyon & Faturalar'),
        h(
          'p',
          { className: 'text-sm text-slate-400 mt-1' },
          'Portföyünüze ait onaylanmış komisyon ekstreleri, hakediş detayları ve mutabakat raporları.'
        )
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: fetchStatements,
          disabled: loading,
          className:
            'inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors disabled:opacity-50',
        },
        loading ? 'Yenileniyor...' : 'Yenile'
      )
    ),

    // Error Alert
    error &&
      h(
        'div',
        { className: 'p-4 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-200 text-sm flex items-center justify-between' },
        h('span', null, error),
        h(
          'button',
          {
            type: 'button',
            onClick: () => setError(null),
            className: 'text-rose-400 hover:text-rose-200 text-xs ml-4',
          },
          'Kapat'
        )
      ),

    // Currency Summary Cards (Each currency isolated strictly)
    Object.keys(totalsByCurrency).length > 0 &&
      h(
        'div',
        { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' },
        Object.entries(totalsByCurrency).map(([curr, totals]) =>
          h(
            'div',
            {
              key: curr,
              className: 'bg-slate-800/80 border border-slate-700 rounded-lg p-4 space-y-2',
            },
            h(
              'div',
              { className: 'flex items-center justify-between text-xs text-slate-400 uppercase font-semibold tracking-wider' },
              h('span', null, `${curr} Toplam Hakediş`),
              h('span', { className: 'bg-slate-700 px-2 py-0.5 rounded text-slate-300' }, `${totals.count} Ekstre`)
            ),
            h(
              'div',
              { className: 'text-2xl font-bold text-white tracking-tight' },
              formatMoney(totals.net, curr)
            ),
            h(
              'div',
              { className: 'flex justify-between text-xs text-slate-400 pt-1 border-t border-slate-700/60' },
              h('span', null, `Brüt: ${formatMoney(totals.gross, curr)}`),
              h(
                'span',
                { className: totals.adjustments !== 0 ? 'text-amber-400' : '' },
                `Düzeltmeler: ${formatMoney(totals.adjustments, curr)}`
              )
            )
          )
        )
      ),

    // Filters Bar
    h(
      'div',
      { className: 'flex flex-col sm:flex-row items-center gap-3 bg-slate-800 p-4 rounded-lg border border-slate-700' },
      h('input', {
        type: 'text',
        placeholder: 'Ekstre no veya döneme göre ara...',
        value: searchTerm,
        onChange: (e) => setSearchTerm(e.target.value),
        className:
          'flex-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
      }),
      uniqueCurrencies.length > 1 &&
        h(
          'select',
          {
            value: currencyFilter,
            onChange: (e) => setCurrencyFilter(e.target.value),
            className:
              'w-full sm:w-40 px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500',
          },
          h('option', { value: 'all' }, 'Tüm Para Birimleri'),
          uniqueCurrencies.map((c) => h('option', { key: c, value: c }, c))
        ),
      h(
        'select',
        {
          value: statusFilter,
          onChange: (e) => setStatusFilter(e.target.value),
          className:
            'w-full sm:w-44 px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500',
        },
        h('option', { value: 'all' }, 'Tüm Durumlar'),
        h('option', { value: 'issued' }, 'Yayınlandı'),
        h('option', { value: 'settled' }, 'Ödendi')
      )
    ),

    // Statements Table / Loading / Empty State
    loading
      ? h(
          'div',
          { className: 'p-12 text-center text-slate-400 bg-slate-800/40 border border-slate-800 rounded-lg' },
          'Komisyon ekstreleri yükleniyor...'
        )
      : filteredStatements.length === 0
      ? h(
          'div',
          { className: 'p-12 text-center text-slate-400 bg-slate-800/40 border border-slate-800 rounded-lg space-y-2' },
          h('p', { className: 'text-base text-slate-300 font-medium' }, 'Kayıtlı komisyon ekstresi bulunamadı.'),
          h(
            'p',
            { className: 'text-xs text-slate-500' },
            'Faturalama dönemi kapandığında platform yöneticisi tarafından onaylanan ekstreler burada listelenecektir.'
          )
        )
      : h(
          'div',
          { className: 'bg-slate-800 border border-slate-700 rounded-lg overflow-hidden shadow-sm' },
          h(
            'div',
            { className: 'overflow-x-auto' },
            h(
              'table',
              { className: 'min-w-full divide-y divide-slate-700 text-sm' },
              h(
                'thead',
                { className: 'bg-slate-900/60 text-slate-400 uppercase text-xs' },
                h(
                  'tr',
                  null,
                  h('th', { className: 'px-4 py-3 text-left font-semibold' }, 'Ekstre No'),
                  h('th', { className: 'px-4 py-3 text-left font-semibold' }, 'Dönem'),
                  h('th', { className: 'px-4 py-3 text-left font-semibold' }, 'Model'),
                  h('th', { className: 'px-4 py-3 text-right font-semibold' }, 'Brüt Tutar'),
                  h('th', { className: 'px-4 py-3 text-right font-semibold' }, 'Düzeltmeler'),
                  h('th', { className: 'px-4 py-3 text-right font-semibold' }, 'Net Hakediş'),
                  h('th', { className: 'px-4 py-3 text-center font-semibold' }, 'Durum'),
                  h('th', { className: 'px-4 py-3 text-right font-semibold' }, 'İşlemler')
                )
              ),
              h(
                'tbody',
                { className: 'divide-y divide-slate-700/60 text-slate-200' },
                filteredStatements.map((stmt) => {
                  const statusInfo =
                    STATEMENT_STATUS_LABELS[stmt.status] || {
                      text: stmt.status,
                      className: 'bg-slate-700 text-slate-300 border-slate-600',
                    };
                  const net = stmt.netAmount != null ? stmt.netAmount : stmt.finalAmount || 0;

                  return h(
                    'tr',
                    { key: stmt._id, className: 'hover:bg-slate-700/30 transition-colors' },
                    h(
                      'td',
                      { className: 'px-4 py-3 font-medium whitespace-nowrap' },
                      h(
                        'a',
                        {
                          href: `/console/partner/statements/${stmt._id}`,
                          className: 'text-indigo-400 hover:text-indigo-300 hover:underline font-mono text-xs',
                        },
                        stmt.statementNumber
                      )
                    ),
                    h(
                      'td',
                      { className: 'px-4 py-3 whitespace-nowrap text-xs text-slate-300' },
                      `${stmt.periodStart} → ${stmt.periodEnd}`
                    ),
                    h(
                      'td',
                      { className: 'px-4 py-3 whitespace-nowrap text-xs text-slate-400' },
                      STATEMENT_DIRECTION_LABELS[stmt.direction] || stmt.direction || '-'
                    ),
                    h(
                      'td',
                      { className: 'px-4 py-3 text-right whitespace-nowrap text-xs font-mono text-slate-300' },
                      formatMoney(stmt.grossAmount, stmt.currency)
                    ),
                    h(
                      'td',
                      {
                        className: `px-4 py-3 text-right whitespace-nowrap text-xs font-mono ${
                          (stmt.adjustmentsAmount || 0) !== 0 ? 'text-amber-400 font-semibold' : 'text-slate-400'
                        }`,
                      },
                      formatMoney(stmt.adjustmentsAmount || 0, stmt.currency)
                    ),
                    h(
                      'td',
                      { className: 'px-4 py-3 text-right whitespace-nowrap text-sm font-mono font-bold text-white' },
                      formatMoney(net, stmt.currency)
                    ),
                    h(
                      'td',
                      { className: 'px-4 py-3 text-center whitespace-nowrap' },
                      h(
                        'span',
                        {
                          className: `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusInfo.className}`,
                        },
                        statusInfo.text
                      )
                    ),
                    h(
                      'td',
                      { className: 'px-4 py-3 text-right whitespace-nowrap space-x-2' },
                      h(
                        'a',
                        {
                          href: `/console/partner/statements/${stmt._id}`,
                          className:
                            'inline-flex items-center px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-700 hover:bg-slate-600 rounded transition-colors',
                        },
                        'Detay'
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          onClick: () => handleExportCsv(stmt._id, stmt.statementNumber),
                          disabled: downloadingId === stmt._id,
                          className:
                            'inline-flex items-center px-2.5 py-1 text-xs font-medium text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-700/50 rounded transition-colors disabled:opacity-50',
                        },
                        downloadingId === stmt._id ? 'İndiriliyor...' : 'CSV'
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
