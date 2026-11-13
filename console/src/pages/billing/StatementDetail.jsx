import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { billingApi } from '../../api/client.js';
import { formatMoney, STATEMENT_STATUS_MAP, DIRECTION_MAP } from './BillingDashboard.jsx';

const h = React.createElement;

export const LINE_TYPE_MAP = {
  commission: { label: 'Komisyon', badge: 'bg-emerald-950 text-emerald-400 border-emerald-500/40' },
  sportsbook_fee: { label: 'Bahis Altyapı Ücreti', badge: 'bg-blue-950 text-blue-400 border-blue-500/40' },
  fixed_fee: { label: 'Sabit Ücret', badge: 'bg-purple-950 text-purple-400 border-purple-500/40' },
  adjustment: { label: 'Düzeltme Kalemi', badge: 'bg-amber-950 text-amber-400 border-amber-500/40' },
  minimum_fee_topup: { label: 'Minimum Ücret Tamamlama', badge: 'bg-indigo-950 text-indigo-400 border-indigo-500/40' },
};

export default function StatementDetail({ statementId: propStatementId }) {
  let routeParams = {};
  try {
    routeParams = useParams() || {};
  } catch {
    // useParams might throw outside router context in unit tests
  }

  const [statementId, setStatementId] = useState(propStatementId || routeParams.id || '');
  const [statement, setStatement] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Adjustment Modal
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjDescription, setAdjDescription] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjError, setAdjError] = useState(null);

  // Void Modal
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState(null);

  // NGR line expansion
  const [expandedNgrLines, setExpandedNgrLines] = useState({});

  const toggleNgrLine = (lineKey) => {
    setExpandedNgrLines((prev) => ({
      ...prev,
      [lineKey]: !prev[lineKey],
    }));
  };

  useEffect(() => {
    let id = propStatementId || routeParams.id;
    if (!id && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/');
      id = parts[parts.length - 1];
    }
    if (id) {
      setStatementId(id);
      loadStatement(id);
    }
  }, [propStatementId, routeParams.id]);

  const loadStatement = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await billingApi.getStatement(id);
      setStatement(res?.statement || null);
      setLines(res?.lines || []);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Ekstre detayları yüklenemedi.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleIssue = async () => {
    if (!window.confirm('Bu ekstreyi kesinleştirmek istediğinize emin misiniz? Kesinleştirilen ekstreler doğrudan düzenlenemez, yalnızca düzeltme kalemi eklenebilir veya iptal edilebilir.')) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await billingApi.issueStatement(statementId);
      setActionSuccess('Ekstre başarıyla kesinleştirildi (issued).');
      setStatement(res?.statement || statement);
      loadStatement(statementId);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Ekstre kesinleştirilirken hata oluştu.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddAdjustment = async (e) => {
    e.preventDefault();
    setAdjError(null);

    const amountNum = parseFloat(adjAmount);
    if (isNaN(amountNum) || !adjDescription) {
      setAdjError('Lütfen geçerli bir tutar ve açıklama girin.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await billingApi.addAdjustment(statementId, {
        amount: amountNum,
        description: adjDescription,
        reason: adjReason,
      });

      setAdjModalOpen(false);
      setAdjAmount('');
      setAdjDescription('');
      setAdjReason('');
      setActionSuccess('Düzeltme kalemi başarıyla eklendi ve ekstre güncellendi.');
      setStatement(res?.statement || statement);
      loadStatement(statementId);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Düzeltme eklenirken hata oluştu.';
      setAdjError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVoid = async (e) => {
    e.preventDefault();
    setVoidError(null);

    if (!voidReason) {
      setVoidError('Lütfen iptal gerekçesini belirtin.');
      return;
    }

    setActionLoading(true);
    try {
      const res = await billingApi.voidStatement(statementId, { reason: voidReason });
      setVoidModalOpen(false);
      setVoidReason('');
      setActionSuccess('Ekstre başarıyla iptal edildi (voided).');
      setStatement(res?.statement || statement);
      loadStatement(statementId);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Ekstre iptal edilirken hata oluştu.';
      setVoidError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return h('div', { className: 'p-12 text-center text-sm text-slate-500' }, 'Ekstre yükleniyor...');
  }

  if (error && !statement) {
    return h(
      'div',
      { className: 'space-y-4' },
      h(
        'div',
        { className: 'p-4 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-200 text-sm' },
        error
      ),
      h(
        'a',
        { href: '/console/billing/statements', className: 'text-indigo-400 hover:text-indigo-300 text-sm' },
        '← Ekstrelere Dön'
      )
    );
  }

  const statusInfo = STATEMENT_STATUS_MAP[statement?.status] || { label: statement?.status, badge: 'bg-slate-800 text-slate-300' };
  const isDraft = statement?.status === 'draft';
  const isIssued = statement?.status === 'issued';
  const isVoided = statement?.status === 'voided';
  const isSettled = statement?.status === 'settled';

  return h(
    'div',
    { className: 'space-y-6' },

    // Top Navigation & Actions Bar
    h(
      'div',
      { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4' },
      h(
        'div',
        { className: 'space-y-1' },
        h(
          'a',
          { href: '/console/billing/statements', className: 'text-xs text-indigo-400 hover:text-indigo-300 font-medium' },
          '← Ekstre Listesine Dön'
        ),
        h(
          'div',
          { className: 'flex items-center gap-3' },
          h('h1', { className: 'text-2xl font-bold font-mono text-white' }, statement?.statementNumber),
          h(
            'span',
            { className: `inline-flex px-2.5 py-1 rounded text-xs font-medium border ${statusInfo.badge}` },
            statusInfo.label
          )
        )
      ),

      h(
        'div',
        { className: 'flex flex-wrap items-center gap-2' },

        // Draft action: Issue
        isDraft &&
          h(
            'button',
            {
              type: 'button',
              disabled: actionLoading,
              onClick: handleIssue,
              className: 'px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md shadow-sm transition-colors',
            },
            actionLoading ? 'İşleniyor...' : 'Ekstreyi Kesinleştir (Issue)'
          ),

        // Issued actions: Add adjustment, Void
        isIssued &&
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                setAdjError(null);
                setAdjModalOpen(true);
              },
              className: 'px-3 py-2 text-xs font-medium text-amber-300 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-700 rounded-md transition-colors',
            },
            '+ Düzeltme Ekle'
          ),

        isIssued &&
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                setVoidError(null);
                setVoidModalOpen(true);
              },
              className: 'px-3 py-2 text-xs font-medium text-rose-300 bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800 rounded-md transition-colors',
            },
            'Ekstreyi İptal Et'
          ),

        // CSV Export
        h(
          'a',
          {
            href: `/api/platform/billing/statements/${statement?._id}/export`,
            download: `${statement?.statementNumber}.csv`,
            className: 'px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors',
          },
          'CSV İndir'
        )
      )
    ),

    // Notifications
    actionSuccess &&
      h(
        'div',
        { className: 'p-4 rounded-lg bg-emerald-950/50 border border-emerald-800 text-emerald-200 text-sm' },
        actionSuccess
      ),

    error &&
      h(
        'div',
        { className: 'p-4 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-200 text-sm' },
        error
      ),

    // Read-only info banner for issued statements
    isIssued &&
      h(
        'div',
        { className: 'p-3.5 rounded-lg bg-slate-900/90 border border-indigo-900/40 text-xs text-indigo-300 flex items-center justify-between' },
        h('span', null, 'ℹ Bu ekstre kesinleştirilmiştir (issued). Orijinal satırlar değiştirilemez; yalnızca düzeltme kalemi eklenebilir veya ekstre iptal edilebilir.')
      ),

    // Void banner
    isVoided &&
      h(
        'div',
        { className: 'p-4 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-200 text-xs space-y-1' },
        h('div', { className: 'font-semibold text-rose-300' }, 'Bu ekstre iptal edilmiştir (voided).'),
        h('div', null, `İptal Gerekçesi: ${statement?.voidReason || 'Belirtilmedi'}`),
        statement?.voidedAt && h('div', { className: 'text-rose-400' }, `İptal Tarihi: ${new Date(statement.voidedAt).toLocaleString('tr-TR')}`)
      ),

    // Statement Metadata Grid
    h(
      'div',
      { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4' },

      // Partner & Period
      h(
        'div',
        { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2' },
        h('div', { className: 'text-xs text-slate-400' }, 'Partner / İş Ortağı'),
        h('div', { className: 'text-sm font-semibold text-white' }, statement?.partnerId?.name || statement?.partnerId?.key || '-'),
        h('div', { className: 'text-xs text-slate-500 font-mono' }, `Key: ${statement?.partnerId?.key || '-'}`),
        h('div', { className: 'text-xs text-slate-400 pt-2 border-t border-slate-800/80' }, 'Dönem Aralığı'),
        h('div', { className: 'text-xs font-medium text-slate-200' }, `${statement?.periodStart} ~ ${statement?.periodEnd}`)
      ),

      // Currency & Model
      h(
        'div',
        { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2' },
        h('div', { className: 'text-xs text-slate-400' }, 'Para Birimi'),
        h('div', { className: 'text-lg font-bold text-white' }, statement?.currency),
        h('div', { className: 'text-xs text-slate-400 pt-2 border-t border-slate-800/80' }, 'Ticari Model (Yön)'),
        h('div', { className: 'text-xs font-medium text-slate-200' }, DIRECTION_MAP[statement?.direction] || statement?.direction),
        h('div', { className: 'text-xs text-slate-500' }, `Kalem Sayısı: ${statement?.linesCount || lines.length}`)
      ),

      // Amount Breakdown
      h(
        'div',
        { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5' },
        h('div', { className: 'text-xs text-slate-400 font-medium' }, 'Hesap Dökümü'),
        h(
          'div',
          { className: 'flex justify-between text-xs' },
          h('span', { className: 'text-slate-400' }, 'Brüt Tutar:'),
          h('span', { className: 'text-slate-200' }, formatMoney(statement?.grossAmount, statement?.currency))
        ),
        h(
          'div',
          { className: 'flex justify-between text-xs' },
          h('span', { className: 'text-slate-400' }, 'Düzeltmeler:'),
          h('span', { className: statement?.adjustmentsAmount !== 0 ? 'text-amber-400 font-medium' : 'text-slate-400' }, formatMoney(statement?.adjustmentsAmount, statement?.currency))
        ),
        h(
          'div',
          { className: 'flex justify-between text-xs' },
          h('span', { className: 'text-slate-400' }, 'Net Komisyon:'),
          h('span', { className: 'text-slate-200 font-medium' }, formatMoney(statement?.netAmount, statement?.currency))
        ),
        h(
          'div',
          { className: 'flex justify-between text-xs pt-1 border-t border-slate-800' },
          h('span', { className: 'text-slate-400' }, 'Minimum Ücret:'),
          h('span', { className: 'text-slate-300' }, formatMoney(statement?.minimumFee, statement?.currency))
        )
      ),

      // Final Amount & Retention
      h(
        'div',
        { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2' },
        h('div', { className: 'text-xs text-slate-400 uppercase tracking-wider' }, 'Nihai Tutar (Final)'),
        h('div', { className: 'text-2xl font-bold text-emerald-400' }, formatMoney(statement?.finalAmount, statement?.currency)),
        h('div', { className: 'text-xs text-slate-400 pt-2 border-t border-slate-800/80' }, 'K24 Yasal Saklama:'),
        h(
          'div',
          { className: 'text-xs text-slate-400' },
          statement?.legalRetentionUntil ? new Date(statement.legalRetentionUntil).toLocaleDateString('tr-TR') : '5 yıl kilitli'
        )
      )
    ),

    // Statement Lines Table
    h(
      'div',
      { className: 'space-y-3' },
      h(
        'div',
        { className: 'flex items-center justify-between' },
        h('h2', { className: 'text-base font-semibold text-white' }, `Ekstre Kalemleri (${lines.length})`),
        isIssued &&
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                setAdjError(null);
                setAdjModalOpen(true);
              },
              className: 'text-xs text-amber-400 hover:text-amber-300 font-medium',
            },
            '+ Düzeltme Satırı Ekle'
          )
      ),

      lines.length === 0
        ? h(
            'div',
            { className: 'p-8 rounded-lg bg-slate-900 border border-slate-800 text-center text-sm text-slate-400' },
            'Bu ekstrede henüz satır kalemi bulunmuyor.'
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
                  h('th', { className: 'py-3 px-4' }, 'Tarih'),
                  h('th', { className: 'py-3 px-4' }, 'Tip'),
                  h('th', { className: 'py-3 px-4' }, 'Operatör'),
                  h('th', { className: 'py-3 px-4' }, 'Açıklama / Gerekçe'),
                  h('th', { className: 'py-3 px-4 text-right' }, 'Taban Tutar'),
                  h('th', { className: 'py-3 px-4 text-center' }, 'Oran'),
                  h('th', { className: 'py-3 px-4 text-right' }, 'Tutar')
                )
              ),
              h(
                'tbody',
                { className: 'divide-y divide-slate-800/60' },
                lines.flatMap((line, idx) => {
                  const lineKey = line._id || `line-${idx}`;
                  const isNgr = line.baseMetric === 'ngr';
                  const isExpanded = Boolean(expandedNgrLines[lineKey]);
                  const typeInfo = LINE_TYPE_MAP[line.type] || { label: line.type, badge: 'bg-slate-800 text-slate-300' };

                  const mainRow = h(
                    'tr',
                    { key: lineKey, className: 'hover:bg-slate-800/40 transition-colors' },
                    h('td', { className: 'py-3 px-4 font-mono text-slate-400' }, line.date || '-'),
                    h(
                      'td',
                      { className: 'py-3 px-4' },
                      h(
                        'span',
                        { className: `inline-flex px-2 py-0.5 rounded text-xs font-medium border ${typeInfo.badge}` },
                        typeInfo.label
                      ),
                      isNgr &&
                        h(
                          'span',
                          { className: 'ml-1.5 inline-flex px-1.5 py-0.5 rounded text-2xs font-mono font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700/60' },
                          'NGR'
                        )
                    ),
                    h('td', { className: 'py-3 px-4 text-slate-300' }, line.tenantId?.name || line.tenantId?.key || '-'),
                    h(
                      'td',
                      { className: 'py-3 px-4' },
                      h('div', { className: 'text-slate-200' }, line.description),
                      line.reason && h('div', { className: 'text-xs text-slate-500 italic mt-0.5' }, `Gerekçe: ${line.reason}`)
                    ),
                    h(
                      'td',
                      { className: 'py-3 px-4 text-right text-slate-400' },
                      line.baseAmount ? formatMoney(line.baseAmount, line.currency) : '-',
                      isNgr &&
                        h(
                          'button',
                          {
                            type: 'button',
                            onClick: () => toggleNgrLine(lineKey),
                            className: 'block ml-auto mt-1 px-1.5 py-0.5 rounded text-2xs font-medium bg-indigo-950 text-indigo-300 border border-indigo-700/60 hover:bg-indigo-900 transition-colors',
                          },
                          isExpanded ? '▲ Kesintileri Gizle' : '▼ Kesinti Dökümü'
                        )
                    ),
                    h(
                      'td',
                      { className: 'py-3 px-4 text-center text-slate-400' },
                      line.rate ? `${(line.rate * 100).toFixed(2)}%` : '-'
                    ),
                    h(
                      'td',
                      { className: 'py-3 px-4 text-right font-medium text-white' },
                      formatMoney(line.amount, line.currency)
                    )
                  );

                  if (!isNgr || !isExpanded) {
                    return [mainRow];
                  }

                  const detailRow = h(
                    'tr',
                    { key: `${lineKey}-drawer`, className: 'bg-slate-950/80 border-t border-b border-indigo-900/40' },
                    h(
                      'td',
                      { colSpan: 7, className: 'p-4' },
                      h(
                        'div',
                        { className: 'space-y-3 bg-slate-900 p-4 rounded-lg border border-slate-800' },
                        h(
                          'div',
                          { className: 'flex items-center justify-between border-b border-slate-800 pb-2' },
                          h(
                            'div',
                            { className: 'flex items-center gap-2' },
                            h('span', { className: 'text-xs font-semibold text-white' }, 'NGR Hesaplama ve Kesinti Dökümü'),
                            h('span', { className: 'px-2 py-0.5 rounded text-2xs font-mono bg-indigo-950 text-indigo-300 border border-indigo-800' }, `${line.currency}`)
                          ),
                          line.metadata?.ngrDefinitionVersion &&
                            h('span', { className: 'text-2xs text-slate-400 font-mono' }, `Tanım Sürümü: v${line.metadata.ngrDefinitionVersion}`)
                        ),
                        // 4 Summary Metrics Cards
                        h(
                          'div',
                          { className: 'grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs' },
                          h(
                            'div',
                            { className: 'p-2.5 rounded bg-slate-800/60 border border-slate-700/50' },
                            h('div', { className: 'text-slate-400 text-2xs' }, 'Brüt GGR'),
                            h('div', { className: 'text-sm font-semibold text-white' }, formatMoney(line.metadata?.ggr ?? line.baseAmount, line.currency))
                          ),
                          h(
                            'div',
                            { className: 'p-2.5 rounded bg-slate-800/60 border border-slate-700/50' },
                            h('div', { className: 'text-slate-400 text-2xs' }, 'Toplam Kesintiler'),
                            h('div', { className: 'text-sm font-semibold text-rose-400' }, `-${formatMoney(line.metadata?.totalDeductions ?? 0, line.currency)}`)
                          ),
                          h(
                            'div',
                            { className: 'p-2.5 rounded bg-slate-800/60 border border-slate-700/50' },
                            h('div', { className: 'text-slate-400 text-2xs' }, 'Net NGR'),
                            h('div', { className: 'text-sm font-semibold text-indigo-300' }, formatMoney(line.metadata?.ngr ?? line.baseAmount, line.currency))
                          ),
                          h(
                            'div',
                            { className: 'p-2.5 rounded bg-slate-800/60 border border-slate-700/50' },
                            h('div', { className: 'text-slate-400 text-2xs' }, `Komisyon (${line.rate ? `${(line.rate * 100).toFixed(2)}%` : '-'})`),
                            h('div', { className: 'text-sm font-semibold text-emerald-400' }, formatMoney(line.amount, line.currency))
                          )
                        ),
                        // Itemized deductions list
                        Array.isArray(line.metadata?.deductions) && line.metadata.deductions.length > 0
                          ? h(
                              'div',
                              { className: 'space-y-1.5 pt-1' },
                              h('div', { className: 'text-2xs font-semibold text-slate-400 uppercase tracking-wider' }, 'Uygulanan Kesinti Kalemleri:'),
                              h(
                                'div',
                                { className: 'divide-y divide-slate-800/80 rounded border border-slate-800 bg-slate-950/40' },
                                line.metadata.deductions.map((ded, dIdx) =>
                                  h(
                                    'div',
                                    { key: dIdx, className: 'flex items-center justify-between px-3 py-2 text-xs' },
                                    h(
                                      'div',
                                      { className: 'flex items-center gap-2' },
                                      h(
                                        'span',
                                        { className: 'px-1.5 py-0.5 rounded text-2xs font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700' },
                                        ded.category
                                      ),
                                      h('span', { className: 'text-slate-200' }, ded.label),
                                      ded.source && h('span', { className: 'text-slate-500 text-2xs' }, `(${ded.source})`)
                                    ),
                                    h('span', { className: 'font-mono font-semibold text-rose-400' }, `-${formatMoney(ded.amount, line.currency)}`)
                                  )
                                )
                              )
                            )
                          : h('div', { className: 'text-xs text-slate-500 italic' }, 'Bu kalemde herhangi bir ek kesinti uygulanmadı.')
                      )
                    )
                  );

                  return [mainRow, detailRow];
                })
              )
            )
          )
    ),

    // Adjustment Modal
    adjModalOpen &&
      h(
        'div',
        { className: 'fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm' },
        h(
          'div',
          { className: 'bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl' },
          h(
            'div',
            { className: 'flex items-center justify-between border-b border-slate-800 pb-3' },
            h('h3', { className: 'text-base font-bold text-white' }, 'Düzeltme Kalemi Ekle (Adjustment)'),
            h(
              'button',
              {
                type: 'button',
                onClick: () => setAdjModalOpen(false),
                className: 'text-slate-400 hover:text-white text-sm',
              },
              '✕'
            )
          ),

          adjError &&
            h('div', { className: 'p-3 rounded bg-rose-950/60 border border-rose-800 text-rose-200 text-xs' }, adjError),

          h(
            'form',
            { onSubmit: handleAddAdjustment, className: 'space-y-4 text-xs' },
            h(
              'div',
              { className: 'space-y-1' },
              h('label', { className: 'font-medium text-slate-300' }, `Düzeltme Tutarı (${statement?.currency}) *`),
              h('input', {
                type: 'number',
                step: '0.01',
                placeholder: 'Örn: -500.00 veya 1250.50',
                value: adjAmount,
                onChange: (e) => setAdjAmount(e.target.value),
                className: 'w-full px-3 py-2 bg-slate-800 text-white rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500',
                required: true,
              }),
              h('div', { className: 'text-slate-500 text-xs' }, 'Pozitif tutar ödemeyi artırır, negatif tutar indirir.')
            ),

            h(
              'div',
              { className: 'space-y-1' },
              h('label', { className: 'font-medium text-slate-300' }, 'Açıklama *'),
              h('input', {
                type: 'text',
                placeholder: 'Örn: Manuel mutabakat düzeltmesi',
                value: adjDescription,
                onChange: (e) => setAdjDescription(e.target.value),
                className: 'w-full px-3 py-2 bg-slate-800 text-white rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500',
                required: true,
              })
            ),

            h(
              'div',
              { className: 'space-y-1' },
              h('label', { className: 'font-medium text-slate-300' }, 'Gerekçe (Zorunlu / Denetim kaydı)'),
              h('textarea', {
                rows: 2,
                placeholder: 'Düzeltmenin yasal veya ticari nedeni...',
                value: adjReason,
                onChange: (e) => setAdjReason(e.target.value),
                className: 'w-full px-3 py-2 bg-slate-800 text-white rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500',
              })
            ),

            h(
              'div',
              { className: 'flex justify-end gap-3 pt-3 border-t border-slate-800' },
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => setAdjModalOpen(false),
                  className: 'px-4 py-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors',
                },
                'İptal'
              ),
              h(
                'button',
                {
                  type: 'submit',
                  disabled: actionLoading,
                  className: 'px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md shadow-sm transition-colors',
                },
                actionLoading ? 'Ekleniyor...' : 'Düzeltmeyi Kaydet'
              )
            )
          )
        )
      ),

    // Void Modal
    voidModalOpen &&
      h(
        'div',
        { className: 'fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm' },
        h(
          'div',
          { className: 'bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl' },
          h(
            'div',
            { className: 'flex items-center justify-between border-b border-slate-800 pb-3' },
            h('h3', { className: 'text-base font-bold text-rose-400' }, 'Ekstreyi İptal Et (Void Statement)'),
            h(
              'button',
              {
                type: 'button',
                onClick: () => setVoidModalOpen(false),
                className: 'text-slate-400 hover:text-white text-sm',
              },
              '✕'
            )
          ),

          voidError &&
            h('div', { className: 'p-3 rounded bg-rose-950/60 border border-rose-800 text-rose-200 text-xs' }, voidError),

          h(
            'form',
            { onSubmit: handleVoid, className: 'space-y-4 text-xs' },
            h(
              'div',
              { className: 'text-slate-300' },
              `"${statement?.statementNumber}" numaralı ekstre tamamen iptal edilecek ve durumu "voided" olarak kilitlenecektir. Bu işlem geri alınamaz.`
            ),

            h(
              'div',
              { className: 'space-y-1' },
              h('label', { className: 'font-medium text-slate-300' }, 'İptal Nedeni / Gerekçesi *'),
              h('textarea', {
                rows: 3,
                placeholder: 'İptal nedenini detaylıca açıklayınız...',
                value: voidReason,
                onChange: (e) => setVoidReason(e.target.value),
                className: 'w-full px-3 py-2 bg-slate-800 text-white rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500',
                required: true,
              })
            ),

            h(
              'div',
              { className: 'flex justify-end gap-3 pt-3 border-t border-slate-800' },
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => setVoidModalOpen(false),
                  className: 'px-4 py-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors',
                },
                'Vazgeç'
              ),
              h(
                'button',
                {
                  type: 'submit',
                  disabled: actionLoading,
                  className: 'px-4 py-2 text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-md shadow-sm transition-colors',
                },
                actionLoading ? 'İptal Ediliyor...' : 'Ekstreyi İptal Et'
              )
            )
          )
        )
      )
  );
}
