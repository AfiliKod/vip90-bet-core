import React, { useState, useEffect } from 'react';
import { partnerClient } from '../../api/client.js';
import {
  STATEMENT_STATUS_LABELS,
  STATEMENT_DIRECTION_LABELS,
  formatMoney,
} from './PartnerStatementsList.jsx';

const h = React.createElement;

export const STATEMENT_LINE_TYPES = {
  commission: { label: 'Komisyon (GGR)', color: 'text-emerald-400' },
  commission_ngr: { label: 'Komisyon (NGR)', color: 'text-emerald-400' },
  sportsbook_fee: { label: 'Spor Bahsi Oran Beslemesi', color: 'text-cyan-400' },
  fixed_fee: { label: 'Sabit Ücret', color: 'text-indigo-400' },
  adjustment: { label: 'Düzeltme', color: 'text-amber-400' },
  minimum_fee_topup: { label: 'Asgari Ücret Tamamlama', color: 'text-purple-400' },
};

export const DEDUCTION_CATEGORY_LABELS = {
  bonus: 'Bonus Maliyeti',
  provider_fee: 'Sağlayıcı / Altyapı Ücreti',
  tax: 'Vergi',
  chargeback: 'Ters İbraz / İade',
  other: 'Diğer Kesinti',
};

export function renderNgrDeductionBreakdown(line, currency, isExpanded = true, onToggle = null) {
  if (!line || !isExpanded) return null;
  const metadata = line.metadata || {};
  const deductions = Array.isArray(metadata.deductions) ? metadata.deductions : [];
  const ggrAmount = metadata.ggr != null
    ? metadata.ggr
    : ((line.baseAmount || 0) + (metadata.totalDeductions || 0));
  const rateDisplay = line.rate != null && line.rate !== 0
    ? `${(line.rate * 100).toFixed(1)}%`
    : '-';

  return h(
    'tr',
    {
      key: `${line._id || line.date || 'ngr'}-deductions`,
      className: 'bg-slate-900/90 border-b border-indigo-950/60',
      'data-testid': 'ngr-deduction-breakdown-row',
    },
    h(
      'td',
      { colSpan: 7, className: 'px-6 py-4' },
      h(
        'div',
        {
          className: 'rounded-lg bg-slate-950/80 border border-slate-700/80 p-4 space-y-3',
          'data-testid': 'ngr-deduction-breakdown',
        },
        // Header
        h(
          'div',
          { className: 'flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2' },
          h(
            'div',
            { className: 'flex items-center gap-2' },
            h('span', { className: 'text-xs font-semibold text-indigo-300 uppercase tracking-wider' }, 'NGR Kesinti Dökümü (Net Gaming Revenue)'),
            metadata.ngrDefinitionVersion != null &&
              h('span', { className: 'text-[11px] px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300 font-mono' }, `v${metadata.ngrDefinitionVersion}`)
          ),
          h(
            'div',
            { className: 'flex items-center gap-3' },
            metadata.negativeBaseHandling &&
              h(
                'span',
                { className: 'text-xs text-slate-400' },
                `Negatif Taban: ${metadata.negativeBaseHandling === 'deduct' ? 'Mahsup Et (Deduct)' : 'Sıfır Taban (Zero Floor)'}`
              ),
            onToggle &&
              h(
                'button',
                {
                  type: 'button',
                  onClick: onToggle,
                  className: 'text-xs text-slate-400 hover:text-white',
                },
                'Kapat ✕'
              )
          )
        ),

        // Summary Metric Cards
        h(
          'div',
          { className: 'grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1 text-xs' },
          h(
            'div',
            { className: 'bg-slate-900/80 p-2.5 rounded border border-slate-800' },
            h('div', { className: 'text-slate-400 text-[11px]' }, 'Brüt GGR'),
            h('div', { className: 'font-mono font-semibold text-white mt-0.5' }, formatMoney(ggrAmount, line.currency || currency))
          ),
          h(
            'div',
            { className: 'bg-slate-900/80 p-2.5 rounded border border-slate-800' },
            h('div', { className: 'text-slate-400 text-[11px]' }, 'Toplam Kesinti'),
            h(
              'div',
              { className: 'font-mono font-semibold text-rose-400 mt-0.5' },
              `- ${formatMoney(metadata.totalDeductions || 0, line.currency || currency)}`
            )
          ),
          h(
            'div',
            { className: 'bg-slate-900/80 p-2.5 rounded border border-indigo-900/60' },
            h('div', { className: 'text-indigo-300 text-[11px]' }, 'Net NGR Matrahı'),
            h('div', { className: 'font-mono font-bold text-white mt-0.5' }, formatMoney(line.baseAmount, line.currency || currency))
          ),
          h(
            'div',
            { className: 'bg-slate-900/80 p-2.5 rounded border border-slate-800' },
            h('div', { className: 'text-slate-400 text-[11px]' }, 'Komisyon Oranı'),
            h('div', { className: 'font-mono font-semibold text-white mt-0.5' }, rateDisplay)
          ),
          h(
            'div',
            { className: 'bg-slate-900/80 p-2.5 rounded border border-emerald-900/60' },
            h('div', { className: 'text-emerald-400 text-[11px]' }, 'Hesaplanan Hakediş'),
            h('div', { className: 'font-mono font-bold text-emerald-300 mt-0.5' }, formatMoney(line.amount, line.currency || currency))
          )
        ),

        // Itemized Deductions Table
        deductions.length > 0 &&
          h(
            'div',
            { className: 'pt-2' },
            h('div', { className: 'text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5' }, 'Uygulanan Kesinti Kalemleri'),
            h(
              'div',
              { className: 'overflow-hidden rounded border border-slate-800 bg-slate-900/60' },
              h(
                'table',
                { className: 'min-w-full divide-y divide-slate-800 text-xs' },
                h(
                  'thead',
                  { className: 'bg-slate-950/80 text-slate-400 uppercase text-[10px]' },
                  h(
                    'tr',
                    null,
                    h('th', { className: 'px-3 py-2 text-left font-semibold' }, 'Kesinti Kategorisi'),
                    h('th', { className: 'px-3 py-2 text-left font-semibold' }, 'Kalem Etiketi'),
                    h('th', { className: 'px-3 py-2 text-left font-semibold' }, 'Veri Kaynağı'),
                    h('th', { className: 'px-3 py-2 text-right font-semibold' }, 'Kesinti Tutarı')
                  )
                ),
                h(
                  'tbody',
                  { className: 'divide-y divide-slate-800/60 text-slate-300' },
                  deductions.map((d, dIdx) =>
                    h(
                      'tr',
                      { key: dIdx, className: 'hover:bg-slate-800/30 transition-colors', 'data-deduction-category': d.category },
                      h(
                        'td',
                        { className: 'px-3 py-1.5 font-medium text-slate-200' },
                        h(
                          'span',
                          { className: 'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-slate-800 border border-slate-700 text-slate-300' },
                          DEDUCTION_CATEGORY_LABELS[d.category] || d.category
                        )
                      ),
                      h('td', { className: 'px-3 py-1.5 text-white' }, d.label || '-'),
                      h('td', { className: 'px-3 py-1.5 font-mono text-[11px] text-slate-400' }, d.source || '-'),
                      h(
                        'td',
                        { className: 'px-3 py-1.5 text-right font-mono font-semibold text-rose-400' },
                        `- ${formatMoney(d.amount, line.currency || currency)}`
                      )
                    )
                  )
                )
              )
            )
          )
      )
    )
  );
}

export default function PartnerStatementDetail({ statementId: propStatementId }) {
  const [statementId, setStatementId] = useState(propStatementId || '');
  const [statement, setStatement] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [expandedLines, setExpandedLines] = useState({});

  const toggleLineExpand = (id) => {
    setExpandedLines((prev) => ({
      ...prev,
      [id]: prev[id] === false ? true : false,
    }));
  };

  useEffect(() => {
    let id = propStatementId;
    if (!id && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/');
      id = parts[parts.length - 1];
    }
    if (id) {
      setStatementId(id);
      loadStatement(id);
    }
  }, [propStatementId]);

  const loadStatement = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await partnerClient.get(`/statements/${id}`);
      setStatement(res?.data?.statement || null);
      setLines(res?.data?.lines || []);
    } catch (err) {
      const is404 = err.response?.status === 404;
      const msg = is404
        ? 'Komisyon ekstresi bulunamadı veya bu ekstreye erişim yetkiniz yok.'
        : err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Ekstre detayları yüklenirken bir hata oluştu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    if (!statement) return;
    setDownloading(true);
    try {
      const res = await partnerClient.get(`/statements/${statement._id}/export`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${statement.statementNumber || statement._id}.csv`);
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
      setDownloading(false);
    }
  };

  if (loading) {
    return h(
      'div',
      { className: 'p-12 text-center text-slate-400 bg-slate-800/40 border border-slate-800 rounded-lg' },
      'Ekstre detayları yükleniyor...'
    );
  }

  if (error || !statement) {
    return h(
      'div',
      { className: 'space-y-4' },
      h(
        'div',
        { className: 'p-6 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-200 text-sm' },
        h('h3', { className: 'text-base font-semibold text-rose-100 mb-1' }, 'Hata'),
        h('p', null, error || 'Ekstre bulunamadı.')
      ),
      h(
        'a',
        {
          href: '/console/partner/statements',
          className:
            'inline-flex items-center px-4 py-2 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors',
        },
        '← Ekstre Listesine Dön'
      )
    );
  }

  const currency = statement.currency || 'TRY';
  const statusInfo = STATEMENT_STATUS_LABELS[statement.status] || {
    text: statement.status,
    className: 'bg-slate-700 text-slate-300 border-slate-600',
  };
  const net = statement.netAmount != null ? statement.netAmount : statement.finalAmount || 0;

  // Split lines into operational lines and adjustments
  const operationalLines = lines.filter((l) => l.type !== 'adjustment');
  const adjustmentLines = lines.filter((l) => l.type === 'adjustment');

  // Breakdown by Operator
  const operatorBreakdown = operationalLines.reduce((acc, line) => {
    const opKey = line.tenantId?._id || 'unknown';
    if (!acc[opKey]) {
      acc[opKey] = {
        tenantId: line.tenantId,
        name: line.tenantId?.name || 'Genel / Belirtilmemiş',
        key: line.tenantId?.key || '-',
        total: 0,
        count: 0,
        matrah: 0,
      };
    }
    acc[opKey].total += line.amount || 0;
    acc[opKey].count += 1;
    acc[opKey].matrah += line.baseAmount || 0;
    return acc;
  }, {});

  return h(
    'div',
    { className: 'space-y-6' },
    // Top Navigation & Action Bar
    h(
      'div',
      { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4' },
      h(
        'div',
        null,
        h(
          'a',
          {
            href: '/console/partner/statements',
            className: 'text-xs text-indigo-400 hover:text-indigo-300 transition-colors mb-1 inline-block',
          },
          '← Komisyon & Faturalara Dön'
        ),
        h(
          'div',
          { className: 'flex items-center gap-3 mt-1' },
          h('h1', { className: 'text-2xl font-bold font-mono text-white tracking-tight' }, statement.statementNumber),
          h(
            'span',
            {
              className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusInfo.className}`,
            },
            statusInfo.text
          )
        ),
        h(
          'p',
          { className: 'text-xs text-slate-400 mt-1' },
          `Dönem: ${statement.periodStart} → ${statement.periodEnd} | Model: ${
            STATEMENT_DIRECTION_LABELS[statement.direction] || statement.direction || '-'
          } | Para Birimi: ${currency}`
        )
      ),
      h(
        'div',
        { className: 'flex items-center gap-3' },
        h(
          'button',
          {
            type: 'button',
            onClick: handleExportCsv,
            disabled: downloading,
            className:
              'inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors disabled:opacity-50',
          },
          downloading ? 'İndiriliyor...' : '📥 CSV İndir'
        )
      )
    ),

    // Read-only notification
    h(
      'div',
      { className: 'p-3 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-slate-400 flex items-center justify-between' },
      h(
        'span',
        null,
        '🔒 Bu komisyon ekstresi onaylanmış olup salt okunurdur. Hesaplamalar ve mutabakat kayıtları kalıcı olarak kilitlenmiştir.'
      ),
      statement.issuedAt &&
        h(
          'span',
          { className: 'text-slate-500' },
          `Onay Tarihi: ${new Date(statement.issuedAt).toLocaleDateString('tr-TR')}`
        )
    ),

    // Financial Summary Cards (Strict Monocurrency Display)
    h(
      'div',
      { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' },
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-lg p-4' },
        h('div', { className: 'text-xs text-slate-400 font-medium uppercase' }, 'Brüt Komisyon'),
        h('div', { className: 'text-xl font-bold font-mono text-white mt-1' }, formatMoney(statement.grossAmount, currency)),
        h('div', { className: 'text-xs text-slate-500 mt-1' }, 'Operatör bazlı toplam hakediş')
      ),
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-lg p-4' },
        h('div', { className: 'text-xs text-slate-400 font-medium uppercase' }, 'Düzeltmeler'),
        h(
          'div',
          {
            className: `text-xl font-bold font-mono mt-1 ${
              (statement.adjustmentsAmount || 0) !== 0 ? 'text-amber-400' : 'text-slate-300'
            }`,
          },
          formatMoney(statement.adjustmentsAmount || 0, currency)
        ),
        h('div', { className: 'text-xs text-slate-500 mt-1' }, `${adjustmentLines.length} adet düzeltme kaydı`)
      ),
      h(
        'div',
        { className: 'bg-slate-800 border border-indigo-700/60 rounded-lg p-4 bg-gradient-to-br from-slate-800 to-indigo-950/20' },
        h('div', { className: 'text-xs text-indigo-300 font-semibold uppercase' }, 'Net Hakediş / Tutar'),
        h('div', { className: 'text-2xl font-bold font-mono text-white mt-1' }, formatMoney(net, currency)),
        h('div', { className: 'text-xs text-indigo-400/80 mt-1' }, 'Mutabakat net ödenecek/alınacak')
      ),
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-lg p-4' },
        h('div', { className: 'text-xs text-slate-400 font-medium uppercase' }, 'Durum & İşlem'),
        h('div', { className: 'text-sm font-semibold text-white mt-1' }, statusInfo.text),
        h(
          'div',
          { className: 'text-xs text-slate-500 mt-1' },
          statement.settledAt
            ? `Ödeme: ${new Date(statement.settledAt).toLocaleDateString('tr-TR')}`
            : 'Ödeme bekleniyor'
        )
      )
    ),

    // Operator Breakdown Table
    h(
      'div',
      { className: 'space-y-3' },
      h(
        'div',
        { className: 'flex items-center justify-between' },
        h('h2', { className: 'text-lg font-bold text-white' }, 'Operatör Bazında Hakediş Özeti'),
        h('span', { className: 'text-xs text-slate-400' }, `${Object.keys(operatorBreakdown).length} Operatör`)
      ),
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-lg overflow-hidden' },
        h(
          'table',
          { className: 'min-w-full divide-y divide-slate-700 text-sm' },
          h(
            'thead',
            { className: 'bg-slate-900/60 text-slate-400 uppercase text-xs' },
            h(
              'tr',
              null,
              h('th', { className: 'px-4 py-3 text-left font-semibold' }, 'Operatör Adı'),
              h('th', { className: 'px-4 py-3 text-left font-semibold' }, 'Operatör Kodu'),
              h('th', { className: 'px-4 py-3 text-right font-semibold' }, 'Satır Sayısı'),
              h('th', { className: 'px-4 py-3 text-right font-semibold' }, 'Matrah'),
              h('th', { className: 'px-4 py-3 text-right font-semibold' }, 'Toplam Tutar')
            )
          ),
          h(
            'tbody',
            { className: 'divide-y divide-slate-700/60 text-slate-200' },
            Object.values(operatorBreakdown).map((op) =>
              h(
                'tr',
                { key: op.key, className: 'hover:bg-slate-700/30 transition-colors' },
                h('td', { className: 'px-4 py-3 font-medium text-white' }, op.name),
                h('td', { className: 'px-4 py-3 font-mono text-xs text-slate-400' }, op.key),
                h('td', { className: 'px-4 py-3 text-right text-xs text-slate-300' }, op.count),
                h('td', { className: 'px-4 py-3 text-right font-mono text-xs text-slate-300' }, formatMoney(op.matrah, currency)),
                h('td', { className: 'px-4 py-3 text-right font-mono text-sm font-semibold text-emerald-400' }, formatMoney(op.total, currency))
              )
            )
          )
        )
      )
    ),

    // Itemized Operational Lines Table
    h(
      'div',
      { className: 'space-y-3' },
      h(
        'div',
        { className: 'flex items-center justify-between' },
        h('h2', { className: 'text-lg font-bold text-white' }, 'Günlük Detaylı Komisyon Kalemleri'),
        h('span', { className: 'text-xs text-slate-400' }, `${operationalLines.length} Kalem`)
      ),
      operationalLines.length === 0
        ? h(
            'div',
            { className: 'p-6 text-center text-slate-400 bg-slate-800/40 border border-slate-800 rounded-lg text-sm' },
            'Bu ekstrede günlük komisyon kalemi bulunamadı.'
          )
        : h(
            'div',
            { className: 'bg-slate-800 border border-slate-700 rounded-lg overflow-hidden' },
            h(
              'div',
              { className: 'overflow-x-auto max-h-96 overflow-y-auto' },
              h(
                'table',
                { className: 'min-w-full divide-y divide-slate-700 text-sm' },
                h(
                  'thead',
                  { className: 'bg-slate-900/60 text-slate-400 uppercase text-xs sticky top-0 z-10' },
                  h(
                    'tr',
                    null,
                    h('th', { className: 'px-4 py-3 text-left font-semibold' }, 'Tarih'),
                    h('th', { className: 'px-4 py-3 text-left font-semibold' }, 'Operatör'),
                    h('th', { className: 'px-4 py-3 text-left font-semibold' }, 'Kalem Türü'),
                    h('th', { className: 'px-4 py-3 text-left font-semibold' }, 'Açıklama'),
                    h('th', { className: 'px-4 py-3 text-right font-semibold' }, 'Matrah'),
                    h('th', { className: 'px-4 py-3 text-right font-semibold' }, 'Oran'),
                    h('th', { className: 'px-4 py-3 text-right font-semibold' }, 'Tutar')
                  )
                ),
                h(
                  'tbody',
                  { className: 'divide-y divide-slate-700/60 text-slate-200' },
                  operationalLines.flatMap((line, idx) => {
                    const isNgr = line.baseMetric === 'ngr';
                    const lineKey = line._id || `line-${idx}`;
                    const typeInfo = isNgr
                      ? (STATEMENT_LINE_TYPES.commission_ngr || { label: 'Komisyon (NGR)', color: 'text-emerald-400' })
                      : (STATEMENT_LINE_TYPES[line.type] || { label: line.type, color: 'text-slate-300' });
                    const rateDisplay =
                      line.rate != null && line.rate !== 0
                        ? `${(line.rate * 100).toFixed(1)}%`
                        : '-';
                    const isExpanded = expandedLines[lineKey] !== false;

                    const row = h(
                      'tr',
                      { key: lineKey, className: 'hover:bg-slate-700/30 transition-colors' },
                      h('td', { className: 'px-4 py-2.5 whitespace-nowrap text-xs font-mono text-slate-300' }, line.date || '-'),
                      h(
                        'td',
                        { className: 'px-4 py-2.5 whitespace-nowrap text-xs text-white' },
                        line.tenantId?.name || line.tenantId?.key || '-'
                      ),
                      h(
                        'td',
                        { className: 'px-4 py-2.5 whitespace-nowrap text-xs' },
                        h(
                          'div',
                          { className: 'flex items-center gap-1.5' },
                          h('span', { className: `font-medium ${typeInfo.color}` }, typeInfo.label),
                          isNgr &&
                            h(
                              'button',
                              {
                                type: 'button',
                                onClick: () => toggleLineExpand(lineKey),
                                className: 'text-[11px] font-mono text-indigo-400 hover:text-indigo-300 underline focus:outline-none ml-1',
                              },
                              isExpanded ? '▲ Kesintileri Gizle' : '▼ Kesintileri Göster'
                            )
                        )
                      ),
                      h(
                        'td',
                        { className: 'px-4 py-2.5 text-xs text-slate-300 max-w-xs' },
                        h('div', { className: 'truncate' }, line.description || '-'),
                        isNgr &&
                          h(
                            'div',
                            { className: 'text-[10px] text-slate-400 font-mono mt-0.5' },
                            `GGR: ${formatMoney(line.metadata?.ggr, line.currency || currency)} | Kesinti: ${formatMoney(line.metadata?.totalDeductions || 0, line.currency || currency)}`
                          )
                      ),
                      h(
                        'td',
                        { className: 'px-4 py-2.5 text-right whitespace-nowrap text-xs font-mono text-slate-300' },
                        line.baseAmount ? formatMoney(line.baseAmount, line.currency || currency) : '-'
                      ),
                      h(
                        'td',
                        { className: 'px-4 py-2.5 text-right whitespace-nowrap text-xs font-mono text-slate-400' },
                        rateDisplay
                      ),
                      h(
                        'td',
                        { className: 'px-4 py-2.5 text-right whitespace-nowrap text-xs font-mono font-semibold text-white' },
                        formatMoney(line.amount, line.currency || currency)
                      )
                    );

                    if (isNgr && (Array.isArray(line.metadata?.deductions) || line.metadata?.totalDeductions != null)) {
                      const breakdown = renderNgrDeductionBreakdown(line, currency, isExpanded, () => toggleLineExpand(lineKey));
                      return breakdown ? [row, breakdown] : [row];
                    }

                    return [row];
                  })
                )
              )
            )
          )
    ),

    // Adjustments Section
    h(
      'div',
      { className: 'space-y-3' },
      h(
        'div',
        { className: 'flex items-center justify-between' },
        h('h2', { className: 'text-lg font-bold text-white' }, 'Düzeltme ve Mutabakat Kayıtları'),
        h('span', { className: 'text-xs text-slate-400' }, `${adjustmentLines.length} Düzeltme`)
      ),
      adjustmentLines.length === 0
        ? h(
            'div',
            { className: 'p-4 text-slate-400 bg-slate-800/40 border border-slate-800 rounded-lg text-xs' },
            'Bu ekstre için herhangi bir düzeltme kaydı bulunmamaktadır.'
          )
        : h(
            'div',
            { className: 'bg-slate-800 border border-slate-700 rounded-lg overflow-hidden' },
            h(
              'table',
              { className: 'min-w-full divide-y divide-slate-700 text-sm' },
              h(
                'thead',
                { className: 'bg-slate-900/60 text-slate-400 uppercase text-xs' },
                h(
                  'tr',
                  null,
                  h('th', { className: 'px-4 py-3 text-left font-semibold' }, 'Açıklama'),
                  h('th', { className: 'px-4 py-3 text-left font-semibold' }, 'Gerekçe'),
                  h('th', { className: 'px-4 py-3 text-right font-semibold' }, 'Tutar'),
                  h('th', { className: 'px-4 py-3 text-right font-semibold' }, 'Tarih')
                )
              ),
              h(
                'tbody',
                { className: 'divide-y divide-slate-700/60 text-slate-200' },
                adjustmentLines.map((adj) =>
                  h(
                    'tr',
                    { key: adj._id, className: 'hover:bg-slate-700/30 transition-colors' },
                    h('td', { className: 'px-4 py-3 text-xs text-white font-medium' }, adj.description),
                    h('td', { className: 'px-4 py-3 text-xs text-slate-400' }, adj.reason || '-'),
                    h(
                      'td',
                      {
                        className: `px-4 py-3 text-right font-mono text-xs font-semibold ${
                          (adj.amount || 0) < 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`,
                      },
                      formatMoney(adj.amount, adj.currency || currency)
                    ),
                    h(
                      'td',
                      { className: 'px-4 py-3 text-right text-xs text-slate-500' },
                      adj.createdAt ? new Date(adj.createdAt).toLocaleDateString('tr-TR') : '-'
                    )
                  )
                )
              )
            )
          )
    )
  );
}
