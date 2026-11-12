import React, { useState, useEffect } from 'react';
import apiClient from '../api/client.js';

const h = React.createElement;

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actorFilter, setActorFilter] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      // Platform audit log query endpoint (or fallback)
      const res = await apiClient.get('/audit-logs').catch(() => ({ data: { logs: [] } }));
      setLogs(res.data?.logs || []);
    } catch (err) {
      setError('Denetim günlükleri yüklenirken bir sorun oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesActor =
      !actorFilter ||
      (log.actorUsername || '').toLowerCase().includes(actorFilter.toLowerCase()) ||
      (log.actorStaffId || '').toLowerCase().includes(actorFilter.toLowerCase());

    const matchesTenant =
      !tenantFilter ||
      (log.onBehalfOfTenantId || '').toLowerCase().includes(tenantFilter.toLowerCase()) ||
      (log.tenantId || '').toLowerCase().includes(tenantFilter.toLowerCase());

    const matchesAction =
      !actionFilter ||
      (log.action || '').toLowerCase().includes(actionFilter.toLowerCase());

    return matchesActor && matchesTenant && matchesAction;
  });

  return h(
    'div',
    { className: 'space-y-6' },
    h(
      'div',
      { className: 'border-b border-slate-800 pb-4' },
      h('h1', { className: 'text-2xl font-bold text-white' }, 'Platform Denetim Günlüğü (Audit Logs)'),
      h(
        'p',
        { className: 'text-sm text-slate-400 mt-1' },
        'Platform personeli tarafından gerçekleştirilen tüm işlemler, yazma izinleri ve durum değişiklikleri (K24: Asgari 5 yıl saklama).'
      )
    ),
    h(
      'div',
      { className: 'grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-800 p-4 rounded-lg border border-slate-700' },
      h('input', {
        type: 'text',
        placeholder: 'İşlemi yapan (Kullanıcı / Personel ID)...',
        value: actorFilter,
        onChange: (e) => setActorFilter(e.target.value),
        className: 'px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-xs text-white focus:outline-none focus:ring-indigo-500',
      }),
      h('input', {
        type: 'text',
        placeholder: 'Operatör ID...',
        value: tenantFilter,
        onChange: (e) => setTenantFilter(e.target.value),
        className: 'px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-xs text-white focus:outline-none focus:ring-indigo-500',
      }),
      h('input', {
        type: 'text',
        placeholder: 'Eylem / Action (örn. WRITE_GRANT)...',
        value: actionFilter,
        onChange: (e) => setActionFilter(e.target.value),
        className: 'px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-xs text-white focus:outline-none focus:ring-indigo-500',
      })
    ),
    error &&
      h(
        'div',
        { className: 'p-4 bg-rose-950/60 border border-rose-500/40 rounded-lg text-xs text-rose-300' },
        error
      ),
    loading
      ? h('div', { className: 'p-8 text-center text-slate-400 text-sm' }, 'Denetim kayıtları yükleniyor...')
      : filteredLogs.length === 0
      ? h(
          'div',
          { className: 'p-12 text-center bg-slate-800/40 rounded-lg border border-slate-800 space-y-2' },
          h('p', { className: 'text-slate-400 text-sm' }, 'Henüz listelenecek denetim kaydı bulunmuyor.'),
          h(
            'p',
            { className: 'text-xs text-slate-500' },
            'Yapılan tüm durum değişiklikleri, yazma istisnaları ve DNS işlemleri otomatik olarak denetim kütüğüne işlenir.'
          )
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
                h('th', { className: 'px-6 py-3' }, 'Tarih / Saat'),
                h('th', { className: 'px-6 py-3' }, 'İşlem (Action)'),
                h('th', { className: 'px-6 py-3' }, 'Personel (Actor)'),
                h('th', { className: 'px-6 py-3' }, 'Operatör (Tenant)'),
                h('th', { className: 'px-6 py-3' }, 'IP Adresi'),
                h('th', { className: 'px-6 py-3' }, 'Neden / Açıklama')
              )
            ),
            h(
              'tbody',
              { className: 'divide-y divide-slate-700 text-xs' },
              filteredLogs.map((log, idx) =>
                h(
                  'tr',
                  { key: log._id || idx, className: 'hover:bg-slate-700/30' },
                  h(
                    'td',
                    { className: 'px-6 py-3 whitespace-nowrap text-slate-300' },
                    log.createdAt ? new Date(log.createdAt).toLocaleString('tr-TR') : '-'
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-3 whitespace-nowrap font-mono font-semibold text-indigo-300' },
                    log.action || '-'
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-3 whitespace-nowrap text-white' },
                    log.actorUsername || log.actorStaffId || '-'
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-3 whitespace-nowrap font-mono text-slate-400' },
                    log.onBehalfOfTenantId || log.tenantId || '-'
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-3 whitespace-nowrap text-slate-400 font-mono' },
                    log.ipAddress || '-'
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-3 text-slate-300 max-w-xs truncate' },
                    log.reason || '-'
                  )
                )
              )
            )
          )
        )
  );
}
