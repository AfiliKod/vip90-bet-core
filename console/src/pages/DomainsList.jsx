import React, { useState, useEffect } from 'react';
import apiClient from '../api/client.js';

const h = React.createElement;

export default function DomainsList() {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/domains');
      setDomains(res.data?.domains || []);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Alan adları yüklenirken bir hata oluştu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyDns = async (domain) => {
    setError(null);
    setFeedback(null);
    try {
      const res = await apiClient.post(`/tenants/${domain.tenantId}/domains/${domain._id}/verify-dns`);
      if (res.data?.verified) {
        setFeedback(`✓ ${domain.host} alan adı DNS TXT doğrulaması başarılı!`);
      } else {
        setError(`DNS TXT doğrulaması başarısız: ${res.data?.message || 'Kayıt tespit edilemedi.'}`);
      }
      fetchDomains();
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'DNS doğrulanırken bir hata oluştu.';
      setError(msg);
    }
  };

  const handleSyncTls = async (domain) => {
    setError(null);
    setFeedback(null);
    try {
      const res = await apiClient.post(`/tenants/${domain.tenantId}/domains/${domain._id}/sync-tls`);
      setFeedback(`✓ ${domain.host} TLS durumu güncellendi: ${res.data?.status || 'active'}`);
      fetchDomains();
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'TLS güncellenirken bir hata oluştu.';
      setError(msg);
    }
  };

  const filteredDomains = domains.filter((d) =>
    !filter ||
    (d.host || '').toLowerCase().includes(filter.toLowerCase()) ||
    (d.tenantId || '').toLowerCase().includes(filter.toLowerCase())
  );

  return h(
    'div',
    { className: 'space-y-6' },
    h(
      'div',
      { className: 'border-b border-slate-800 pb-4' },
      h('h1', { className: 'text-2xl font-bold text-white' }, 'Alan Adı Yönetimi (Domains)'),
      h(
        'p',
        { className: 'text-sm text-slate-400 mt-1' },
        'Platform genelindeki tüm operatör alan adları, Cloudflare TLS durumu ve DNS TXT doğrulama kayıtları.'
      )
    ),
    feedback &&
      h(
        'div',
        { className: 'p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-xs text-emerald-300' },
        feedback
      ),
    error &&
      h(
        'div',
        { className: 'p-4 bg-rose-950/60 border border-rose-500/40 rounded-lg text-xs text-rose-300' },
        error
      ),
    h(
      'div',
      { className: 'flex items-center gap-3 bg-slate-800 p-4 rounded-lg border border-slate-700' },
      h('input', {
        type: 'text',
        placeholder: 'Alan adı veya operatör ID ile filtrele...',
        value: filter,
        onChange: (e) => setFilter(e.target.value),
        className:
          'flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500',
      }),
      h(
        'button',
        {
          type: 'button',
          onClick: fetchDomains,
          className: 'px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-700 rounded-md',
        },
        'Yenile'
      )
    ),
    loading
      ? h('div', { className: 'p-8 text-center text-slate-400 text-sm' }, 'Alan adları yükleniyor...')
      : filteredDomains.length === 0
      ? h('div', { className: 'p-12 text-center bg-slate-800/40 rounded-lg border border-slate-800 text-slate-400 text-sm' }, 'Kayıtlı alan adı bulunamadı.')
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
                h('th', { className: 'px-6 py-3' }, 'Alan Adı (Host)'),
                h('th', { className: 'px-6 py-3' }, 'Operatör (Tenant ID)'),
                h('th', { className: 'px-6 py-3' }, 'DNS Doğrulama'),
                h('th', { className: 'px-6 py-3' }, 'Cloudflare TLS Durumu'),
                h('th', { className: 'px-6 py-3' }, 'Gerekli DNS TXT Kaydı'),
                h('th', { className: 'px-6 py-3 text-right' }, 'İşlemler')
              )
            ),
            h(
              'tbody',
              { className: 'divide-y divide-slate-700 text-sm' },
              filteredDomains.map((d) => {
                const isVerified = Boolean(d.verifiedAt);
                const tlsStatus = d.tls?.status || 'pending';
                return h(
                  'tr',
                  { key: d._id, className: 'hover:bg-slate-700/30 transition-colors' },
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap' },
                    h('div', { className: 'font-semibold text-white text-sm' }, d.host),
                    d.isPrimary &&
                      h('span', { className: 'text-[10px] text-indigo-400 font-medium' }, '★ Birincil')
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-xs font-mono text-slate-300' },
                    d.tenantId || '-'
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap' },
                    h(
                      'span',
                      {
                        className: `inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          isVerified
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                            : 'bg-amber-950 text-amber-400 border border-amber-500/40'
                        }`,
                      },
                      isVerified ? '✓ Doğrulandı' : '✕ Bekliyor'
                    )
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap' },
                    h(
                      'span',
                      {
                        className: `inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                          tlsStatus === 'active'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-300 border border-slate-600'
                        }`,
                      },
                      tlsStatus
                    )
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 text-xs font-mono' },
                    h(
                      'div',
                      { className: 'bg-slate-900 p-2 rounded border border-slate-700/60 max-w-xs space-y-0.5' },
                      h(
                        'div',
                        { className: 'text-slate-400 text-[11px]' },
                        'Ad: ',
                        h('span', { className: 'text-indigo-300 select-all font-bold' }, `_domain-verify.${d.host}`)
                      ),
                      h(
                        'div',
                        { className: 'text-slate-400 text-[11px] truncate' },
                        'Değer: ',
                        h('span', { className: 'text-emerald-300 select-all font-bold' }, d.txtVerificationToken || 'Belirtilmedi')
                      )
                    )
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-right text-xs space-x-2' },
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: () => handleVerifyDns(d),
                        className: 'px-2.5 py-1 text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors',
                      },
                      'DNS Doğrula'
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: () => handleSyncTls(d),
                        className: 'px-2.5 py-1 text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded transition-colors',
                      },
                      'TLS Yenile'
                    )
                  )
                );
              })
            )
          )
        )
  );
}
