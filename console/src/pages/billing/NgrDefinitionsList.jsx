import React, { useState, useEffect } from 'react';
import { billingApi } from '../../api/client.js';

const h = React.createElement;

export const NGR_STATUS_LABELS = {
  active: { label: 'Aktif', badge: 'bg-emerald-950 text-emerald-400 border-emerald-500/40' },
  draft: { label: 'Taslak', badge: 'bg-amber-950 text-amber-400 border-amber-500/40' },
  archived: { label: 'Arşiv', badge: 'bg-slate-800 text-slate-400 border-slate-600/40' },
};

export const GGR_COMPONENT_LABELS = {
  casino: 'Casino GGR',
  sports: 'Spor Bahisleri GGR',
};

export const CATEGORY_LABELS = {
  bonus: 'Bonus',
  provider_fee: 'Sağlayıcı Ücreti',
  tax: 'Vergi',
  chargeback: 'Ters İbraz',
  other: 'Diğer',
};

export const SOURCE_LABELS = {
  stat_field: 'İstatistik Alanı (Stat Field)',
  fee_plan: 'Ücret Planı (Fee Plan)',
  rate: 'Yüzdelik Oran (Rate)',
  fixed: 'Sabit Tutar (Fixed)',
};

export default function NgrDefinitionsList() {
  const [definitions, setDefinitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionSuccess, setActionSuccess] = useState(null);

  useEffect(() => {
    loadDefinitions();
  }, []);

  const loadDefinitions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await billingApi.listNgrDefinitions();
      setDefinitions(res?.definitions || []);
    } catch (err) {
      const code = err.response?.data?.error?.code || err.response?.data?.code || 'FETCH_ERROR';
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'NGR tanımları yüklenemedi.';
      setError(`[${code}] ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const filtered = definitions.filter((def) => {
    const matchesSearch =
      !searchTerm ||
      def.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (def.description && def.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || def.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return h(
    'div',
    { className: 'space-y-6' },

    // Header
    h(
      'div',
      { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5' },
      h(
        'div',
        null,
        h(
          'div',
          { className: 'flex items-center gap-3' },
          h('h1', { className: 'text-2xl font-bold tracking-tight text-white' }, 'NGR Tanımları'),
          h('span', { className: 'px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-400 border border-indigo-700/50' }, 'K28')
        ),
        h(
          'p',
          { className: 'text-sm text-slate-400 mt-1' },
          'Net Gaming Revenue (NGR) hesaplama formülleri, kesinti kuralları ve sürüm yönetimi.'
        )
      ),
      h(
        'div',
        { className: 'flex items-center gap-3' },
        h(
          'a',
          {
            href: '/console/billing/ngr-definitions/new',
            className: 'px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors',
          },
          '+ Yeni Tanım'
        )
      )
    ),

    // Notifications
    actionSuccess &&
      h(
        'div',
        { className: 'p-4 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs' },
        actionSuccess
      ),

    error &&
      h(
        'div',
        { className: 'p-4 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs' },
        error
      ),

    // Filter toolbar
    h(
      'div',
      { className: 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4' },
      h(
        'div',
        { className: 'flex-1 max-w-md' },
        h('input', {
          type: 'text',
          placeholder: 'Tanım adı veya açıklama ile ara...',
          value: searchTerm,
          onChange: (e) => setSearchTerm(e.target.value),
          className: 'w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500',
        })
      ),
      h(
        'div',
        { className: 'flex items-center gap-2 text-xs text-slate-400' },
        h('span', null, 'Durum:'),
        h(
          'select',
          {
            value: statusFilter,
            onChange: (e) => setStatusFilter(e.target.value),
            className: 'px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 text-xs focus:outline-none focus:border-indigo-500',
          },
          h('option', { value: 'all' }, 'Tümü'),
          h('option', { value: 'active' }, 'Aktif'),
          h('option', { value: 'draft' }, 'Taslak'),
          h('option', { value: 'archived' }, 'Arşiv')
        )
      )
    ),

    // Table
    loading
      ? h('div', { className: 'p-12 text-center text-slate-500 text-sm' }, 'NGR tanımları yükleniyor...')
      : filtered.length === 0
      ? h(
          'div',
          { className: 'p-12 rounded-lg bg-slate-900 border border-slate-800 text-center space-y-3' },
          h('p', { className: 'text-sm text-slate-400' }, 'Henüz kayıtlı NGR tanımı bulunamadı.'),
          h(
            'a',
            {
              href: '/console/billing/ngr-definitions/new',
              className: 'inline-block px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm',
            },
            'İlk NGR Tanımını Oluştur'
          )
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
                h('th', { className: 'py-3 px-4' }, 'Tanım Adı / Açıklama'),
                h('th', { className: 'py-3 px-4 text-center' }, 'Sürüm'),
                h('th', { className: 'py-3 px-4' }, 'GGR Bileşenleri'),
                h('th', { className: 'py-3 px-4' }, 'Aktif Kesintiler'),
                h('th', { className: 'py-3 px-4 text-center' }, 'Durum'),
                h('th', { className: 'py-3 px-4 text-right' }, 'İşlemler')
              )
            ),
            h(
              'tbody',
              { className: 'divide-y divide-slate-800/60' },
              filtered.map((def) => {
                const statusMeta = NGR_STATUS_LABELS[def.status] || {
                  label: def.status,
                  badge: 'bg-slate-800 text-slate-300',
                };
                const enabledItems = (def.items || []).filter((i) => i.enabled);
                const ggrCompLabels = (def.ggrComponents || []).map((c) => GGR_COMPONENT_LABELS[c] || c);

                return h(
                  'tr',
                  { key: def._id, className: 'hover:bg-slate-800/40 transition-colors' },
                  h(
                    'td',
                    { className: 'py-3 px-4' },
                    h('div', { className: 'font-semibold text-white text-sm' }, def.name),
                    def.description && h('div', { className: 'text-slate-400 text-xs mt-0.5 line-clamp-1' }, def.description),
                    h('div', { className: 'text-slate-500 font-mono text-2xs mt-1' }, `ID: ${def._id}`)
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4 text-center font-mono' },
                    h(
                      'span',
                      { className: 'px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-indigo-300 border border-slate-700' },
                      `v${def.version}`
                    )
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4' },
                    h(
                      'div',
                      { className: 'flex flex-wrap gap-1' },
                      ggrCompLabels.map((lbl, idx) =>
                        h(
                          'span',
                          { key: idx, className: 'px-2 py-0.5 rounded text-2xs bg-slate-800 text-slate-300 border border-slate-700' },
                          lbl
                        )
                      )
                    ),
                    def.ggrAlreadyNetOf && def.ggrAlreadyNetOf.length > 0 &&
                      h(
                        'div',
                        { className: 'text-2xs text-amber-400 mt-1' },
                        `Net Olan: ${def.ggrAlreadyNetOf.map((c) => CATEGORY_LABELS[c] || c).join(', ')}`
                      )
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4' },
                    enabledItems.length === 0
                      ? h('span', { className: 'text-slate-500 italic' }, 'Kesinti yok')
                      : h(
                          'div',
                          { className: 'space-y-1' },
                          h(
                            'div',
                            { className: 'text-xs text-slate-300' },
                            `${enabledItems.length} aktif kesinti:`
                          ),
                          h(
                            'div',
                            { className: 'flex flex-wrap gap-1' },
                            enabledItems.map((item, idx) =>
                              h(
                                'span',
                                {
                                  key: idx,
                                  className: 'px-1.5 py-0.5 rounded text-2xs bg-slate-800/80 text-rose-300 border border-rose-900/40',
                                  title: `${item.label} (${CATEGORY_LABELS[item.category] || item.category} - ${SOURCE_LABELS[item.source] || item.source})`,
                                },
                                item.label
                              )
                            )
                          )
                        )
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4 text-center' },
                    h(
                      'span',
                      { className: `inline-flex px-2 py-0.5 rounded text-xs font-medium border ${statusMeta.badge}` },
                      statusMeta.label
                    )
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4 text-right space-x-2' },
                    h(
                      'a',
                      {
                        href: `/console/billing/ngr-definitions/${def._id}`,
                        className: 'px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors',
                      },
                      'Düzenle'
                    ),
                    h(
                      'a',
                      {
                        href: `/console/billing/ngr-definitions/new?cloneFrom=${def._id}`,
                        className: 'px-2.5 py-1 text-xs font-medium text-indigo-300 hover:text-indigo-100 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-800 rounded transition-colors',
                      },
                      'Yeni Sürüm'
                    )
                  )
                );
              })
            )
          )
        )
  );
}
