import React, { useState, useEffect } from 'react';
import { partnerApi } from '../../api/client.js';

const h = React.createElement;

export const TENANT_STATUS_LABELS = {
  provisioning: { text: 'Hazırlanıyor', className: 'bg-blue-950 text-blue-400 border-blue-500/40' },
  active: { text: 'Aktif (Canlı)', className: 'bg-emerald-950 text-emerald-400 border-emerald-500/40' },
  suspended: { text: 'Askıya Alındı', className: 'bg-amber-950 text-amber-400 border-amber-500/40' },
};

export default function PartnerTenantsList() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await partnerApi.listTenants();
      setTenants(res?.tenants || []);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Operatörler yüklenirken bir hata oluştu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const filteredTenants = tenants.filter((tenant) => {
    const matchesSearch =
      !searchTerm ||
      (tenant.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tenant.key || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tenant.primaryDomain || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;
    return matchesSearch && matchesStatus;
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
        h('h1', { className: 'text-2xl font-bold text-white' }, 'Operatörlerim'),
        h('p', { className: 'text-sm text-slate-400 mt-1' }, 'Portföyünüz altında başlatılmış ve yönetilen bahis ve oyun operatörleri.')
      ),
      h(
        'a',
        {
          href: '/console/partner/operators/new',
          className: 'inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors',
        },
        '+ Yeni Operatör Başlat'
      )
    ),

    // Search and Filters
    h(
      'div',
      { className: 'flex flex-col sm:flex-row items-center gap-3 bg-slate-800 p-4 rounded-lg border border-slate-700' },
      h('input', {
        type: 'text',
        placeholder: 'Operatör adı, kod veya alan adına göre ara...',
        value: searchTerm,
        onChange: (e) => setSearchTerm(e.target.value),
        className: 'flex-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-indigo-500',
      }),
      h(
        'select',
        {
          value: statusFilter,
          onChange: (e) => setStatusFilter(e.target.value),
          className: 'w-full sm:w-48 px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500',
        },
        h('option', { value: 'all' }, 'Tüm Durumlar'),
        h('option', { value: 'provisioning' }, 'Hazırlanıyor (Provisioning)'),
        h('option', { value: 'active' }, 'Aktif (Canlı)'),
        h('option', { value: 'suspended' }, 'Askıya Alındı')
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: fetchTenants,
          className: 'px-3 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-md transition-colors',
        },
        'Yenile'
      )
    ),

    error && h('div', { className: 'p-4 bg-rose-950/60 border border-rose-500/40 rounded-lg text-sm text-rose-300' }, error),

    loading
      ? h('div', { className: 'p-8 text-center text-slate-400 text-sm' }, 'Operatörler yükleniyor...')
      : filteredTenants.length === 0
      ? h(
          'div',
          { className: 'p-12 text-center bg-slate-800/40 border border-slate-800 rounded-lg' },
          h('p', { className: 'text-slate-400 text-sm' }, 'Bağlı operatör bulunamadı.')
        )
      : h(
          'div',
          { className: 'bg-slate-800 border border-slate-700 rounded-lg overflow-hidden' },
          h(
            'table',
            { className: 'min-w-full divide-y divide-slate-700 text-left' },
            h(
              'thead',
              { className: 'bg-slate-900/60 text-xs font-semibold text-slate-400 uppercase tracking-wider' },
              h(
                'tr',
                null,
                h('th', { className: 'px-6 py-3' }, 'Operatör Adı'),
                h('th', { className: 'px-6 py-3' }, 'Kod (Key)'),
                h('th', { className: 'px-6 py-3' }, 'Durum'),
                h('th', { className: 'px-6 py-3' }, 'Birincil Alan Adı'),
                h('th', { className: 'px-6 py-3' }, 'Kayıt Tarihi'),
                h('th', { className: 'px-6 py-3 text-right' }, 'İşlemler')
              )
            ),
            h(
              'tbody',
              { className: 'divide-y divide-slate-700 text-sm' },
              filteredTenants.map((t) => {
                const statusMeta = TENANT_STATUS_LABELS[t.status] || {
                  text: t.status || 'Bilinmiyor',
                  className: 'bg-slate-700 text-slate-300',
                };
                return h(
                  'tr',
                  { key: t._id, className: 'hover:bg-slate-700/30 transition-colors' },
                  h('td', { className: 'px-6 py-4 whitespace-nowrap font-medium text-white' }, t.name || '-'),
                  h('td', { className: 'px-6 py-4 whitespace-nowrap font-mono text-xs text-indigo-300' }, t.key || '-'),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap' },
                    h(
                      'span',
                      { className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusMeta.className}` },
                      statusMeta.text
                    )
                  ),
                  h('td', { className: 'px-6 py-4 whitespace-nowrap text-slate-300 text-xs' }, t.primaryDomain || '-'),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-slate-400 text-xs' },
                    t.createdAt ? new Date(t.createdAt).toLocaleDateString('tr-TR') : '-'
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-right text-xs font-medium' },
                    h(
                      'a',
                      {
                        href: `/console/partner/operators/${t._id}`,
                        className: 'text-indigo-400 hover:text-indigo-300 bg-slate-900 px-3 py-1.5 rounded border border-slate-700 hover:border-indigo-500 transition-colors',
                      },
                      'Yönet / Detay →'
                    )
                  )
                );
              })
            )
          )
        )
  );
}
