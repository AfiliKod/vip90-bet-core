import React, { useState, useEffect } from 'react';
import apiClient, { billingApi } from '../../api/client.js';
import { formatMoney, STATEMENT_STATUS_MAP, DIRECTION_MAP } from './BillingDashboard.jsx';

const h = React.createElement;

export default function StatementsList() {
  const [statements, setStatements] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('');

  // Generate Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState(null);
  const [genSuccess, setGenSuccess] = useState(null);
  const [genPartnerId, setGenPartnerId] = useState('');
  const [genPeriodStart, setGenPeriodStart] = useState('2026-11-01');
  const [genPeriodEnd, setGenPeriodEnd] = useState('2026-11-30');

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [stmtsRes, partnersRes] = await Promise.allSettled([
        billingApi.listStatements({}),
        apiClient.get('/partners'),
      ]);

      if (stmtsRes.status === 'fulfilled') {
        setStatements(stmtsRes.value?.statements || []);
      } else {
        setError(stmtsRes.reason?.response?.data?.error?.message || 'Ekstreler yüklenirken hata oluştu.');
      }

      if (partnersRes.status === 'fulfilled') {
        const pList = partnersRes.value?.data?.partners || [];
        setPartners(pList);
        if (pList.length > 0) {
          setGenPartnerId(pList[0]._id);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Veriler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const reloadStatements = async () => {
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (partnerFilter !== 'all') params.partnerId = partnerFilter;
      if (periodFilter) params.period = periodFilter;

      const res = await billingApi.listStatements(params);
      setStatements(res?.statements || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Filtrelenmiş ekstreler yüklenemedi.');
    }
  };

  useEffect(() => {
    reloadStatements();
  }, [statusFilter, partnerFilter, periodFilter]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenError(null);
    setGenSuccess(null);

    if (!genPartnerId || !genPeriodStart || !genPeriodEnd) {
      setGenError('Lütfen tüm zorunlu alanları doldurun.');
      return;
    }

    setGenLoading(true);
    try {
      const res = await billingApi.generateStatements({
        partnerId: genPartnerId,
        periodStart: genPeriodStart,
        periodEnd: genPeriodEnd,
      });

      const count = res?.statements?.length || 0;
      setGenSuccess(`${count} adet ekstre başarıyla oluşturuldu/güncellendi.`);
      setTimeout(() => {
        setModalOpen(false);
        setGenSuccess(null);
        reloadStatements();
      }, 1500);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Ekstre oluşturulurken hata meydana geldi.';
      setGenError(msg);
    } finally {
      setGenLoading(false);
    }
  };

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
        h('h1', { className: 'text-2xl font-bold text-white' }, 'Partner Hesap Ekstreleri'),
        h('p', { className: 'text-sm text-slate-400 mt-1' }, 'Dönemsel komisyon ve toptan lisans mutabakat ekstreleri.')
      ),
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              setGenError(null);
              setGenSuccess(null);
              setModalOpen(true);
            },
            className: 'px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors',
          },
          '+ Dönemsel Ekstre Oluştur'
        ),
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

    // Error Alert
    error &&
      h(
        'div',
        { className: 'p-4 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-200 text-sm' },
        error
      ),

    // Filter Bar
    h(
      'div',
      { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800 flex flex-wrap items-center gap-4' },

      // Status Filter
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h('label', { className: 'text-xs font-medium text-slate-400' }, 'Durum:'),
        h(
          'select',
          {
            value: statusFilter,
            onChange: (e) => setStatusFilter(e.target.value),
            className: 'px-3 py-1.5 text-xs bg-slate-800 text-white rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500',
          },
          h('option', { value: 'all' }, 'Tümü'),
          h('option', { value: 'draft' }, 'Taslak'),
          h('option', { value: 'issued' }, 'Kesildi'),
          h('option', { value: 'settled' }, 'Ödendi'),
          h('option', { value: 'voided' }, 'İptal Edildi')
        )
      ),

      // Partner Filter
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h('label', { className: 'text-xs font-medium text-slate-400' }, 'Partner:'),
        h(
          'select',
          {
            value: partnerFilter,
            onChange: (e) => setPartnerFilter(e.target.value),
            className: 'px-3 py-1.5 text-xs bg-slate-800 text-white rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500',
          },
          h('option', { value: 'all' }, 'Tüm Partnerler'),
          partners.map((p) =>
            h('option', { key: p._id, value: p._id }, `${p.name} (${p.key})`)
          )
        )
      ),

      // Period Filter
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h('label', { className: 'text-xs font-medium text-slate-400' }, 'Dönem (Ay):'),
        h('input', {
          type: 'text',
          placeholder: 'YYYY-MM',
          value: periodFilter,
          onChange: (e) => setPeriodFilter(e.target.value),
          className: 'px-3 py-1.5 text-xs bg-slate-800 text-white rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500 w-28',
        })
      ),

      h(
        'div',
        { className: 'ml-auto text-xs text-slate-400' },
        `Toplam ${statements.length} ekstre listeleniyor`
      )
    ),

    // Statements Table
    loading
      ? h('div', { className: 'p-12 text-center text-sm text-slate-500' }, 'Ekstreler yükleniyor...')
      : statements.length === 0
      ? h(
          'div',
          { className: 'p-12 rounded-lg bg-slate-900 border border-slate-800 text-center text-sm text-slate-400' },
          'Filtre kriterlerine uygun ekstre bulunamadı.'
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
                h('th', { className: 'py-3 px-4 text-right' }, 'Brüt Tutar'),
                h('th', { className: 'py-3 px-4 text-right' }, 'Düzeltmeler'),
                h('th', { className: 'py-3 px-4 text-right' }, 'Nihai Tutar'),
                h('th', { className: 'py-3 px-4 text-center' }, 'Satır'),
                h('th', { className: 'py-3 px-4' }, 'Durum'),
                h('th', { className: 'py-3 px-4 text-right' }, 'İşlemler')
              )
            ),
            h(
              'tbody',
              { className: 'divide-y divide-slate-800/60' },
              statements.map((s) => {
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
                  h('td', { className: 'py-3 px-4 text-right text-slate-300' }, formatMoney(s.grossAmount, s.currency)),
                  h(
                    'td',
                    { className: 'py-3 px-4 text-right ' + (s.adjustmentsAmount !== 0 ? 'text-amber-400' : 'text-slate-500') },
                    formatMoney(s.adjustmentsAmount, s.currency)
                  ),
                  h('td', { className: 'py-3 px-4 text-right font-semibold text-white' }, formatMoney(s.finalAmount, s.currency)),
                  h('td', { className: 'py-3 px-4 text-center text-slate-400' }, s.linesCount || 0),
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
                    { className: 'py-3 px-4 text-right whitespace-nowrap' },
                    h(
                      'div',
                      { className: 'flex items-center justify-end gap-2' },
                      h(
                        'a',
                        {
                          href: `/console/billing/statements/${s._id}`,
                          className: 'px-2 py-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-colors',
                        },
                        'Görüntüle'
                      ),
                      h(
                        'a',
                        {
                          href: `/api/platform/billing/statements/${s._id}/export`,
                          download: `${s.statementNumber}.csv`,
                          className: 'px-2 py-1 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors',
                        },
                        'CSV'
                      )
                    )
                  )
                );
              })
            )
          )
        ),

    // Generate Modal
    modalOpen &&
      h(
        'div',
        { className: 'fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm' },
        h(
          'div',
          { className: 'bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl' },
          h(
            'div',
            { className: 'flex items-center justify-between border-b border-slate-800 pb-3' },
            h('h3', { className: 'text-lg font-bold text-white' }, 'Dönemsel Partner Ekstresi Oluştur'),
            h(
              'button',
              {
                type: 'button',
                onClick: () => setModalOpen(false),
                className: 'text-slate-400 hover:text-white text-sm',
              },
              '✕'
            )
          ),

          genError &&
            h('div', { className: 'p-3 rounded bg-rose-950/60 border border-rose-800 text-rose-200 text-xs' }, genError),

          genSuccess &&
            h('div', { className: 'p-3 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs' }, genSuccess),

          h(
            'form',
            { onSubmit: handleGenerate, className: 'space-y-4 text-xs' },
            h(
              'div',
              { className: 'space-y-1' },
              h('label', { className: 'font-medium text-slate-300' }, 'Partner Seçin *'),
              h(
                'select',
                {
                  value: genPartnerId,
                  onChange: (e) => setGenPartnerId(e.target.value),
                  className: 'w-full px-3 py-2 bg-slate-800 text-white rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500',
                  required: true,
                },
                partners.map((p) =>
                  h('option', { key: p._id, value: p._id }, `${p.name} (${p.key})`)
                )
              )
            ),

            h(
              'div',
              { className: 'grid grid-cols-2 gap-4' },
              h(
                'div',
                { className: 'space-y-1' },
                h('label', { className: 'font-medium text-slate-300' }, 'Dönem Başlangıcı *'),
                h('input', {
                  type: 'date',
                  value: genPeriodStart,
                  onChange: (e) => setGenPeriodStart(e.target.value),
                  className: 'w-full px-3 py-2 bg-slate-800 text-white rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500',
                  required: true,
                })
              ),
              h(
                'div',
                { className: 'space-y-1' },
                h('label', { className: 'font-medium text-slate-300' }, 'Dönem Bitişi *'),
                h('input', {
                  type: 'date',
                  value: genPeriodEnd,
                  onChange: (e) => setGenPeriodEnd(e.target.value),
                  className: 'w-full px-3 py-2 bg-slate-800 text-white rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500',
                  required: true,
                })
              )
            ),

            h(
              'div',
              { className: 'p-3 rounded bg-slate-800/60 border border-slate-700/60 text-slate-400 text-xs space-y-1' },
              h('div', { className: 'font-medium text-slate-300' }, 'Bilgilendirme:'),
              h('div', null, '• Seçilen döneme ait günlük TenantDailyStat verileri üzerinden komisyon hesaplanır.'),
              h('div', null, '• Dönem içindeki link oran değişiklikleri gün bazında uygulanır.'),
              h('div', null, '• Birden fazla para birimi varsa her biri için ayrı ekstre türetilir.'),
              h('div', null, '• Taslak ekstreler daha sonra onaylanarak kesinleştirilebilir (issued).')
            ),

            h(
              'div',
              { className: 'flex justify-end gap-3 pt-3 border-t border-slate-800' },
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => setModalOpen(false),
                  className: 'px-4 py-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors',
                },
                'İptal'
              ),
              h(
                'button',
                {
                  type: 'submit',
                  disabled: genLoading,
                  className: 'px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md shadow-sm transition-colors',
                },
                genLoading ? 'Oluşturuluyor...' : 'Ekstreleri Hesapla ve Oluştur'
              )
            )
          )
        )
      )
  );
}
