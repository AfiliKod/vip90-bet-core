import React, { useState, useEffect } from 'react';
import apiClient from '../api/client.js';

const h = React.createElement;

export default function Dashboard() {
  const [tenants, setTenants] = useState([]);
  const [scopeGates, setScopeGates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, gRes] = await Promise.allSettled([
        apiClient.get('/tenants'),
        apiClient.get('/system/scope-gates'),
      ]);

      if (tRes.status === 'fulfilled') {
        setTenants(tRes.value.data?.tenants || []);
      }
      if (gRes.status === 'fulfilled') {
        setScopeGates(gRes.value.data);
      }
    } catch (err) {
      setError('Genel bakış verileri yüklenirken bir sorun oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const statusCounts = tenants.reduce(
    (acc, t) => {
      const s = t.status || 'unknown';
      acc[s] = (acc[s] || 0) + 1;
      acc.total += 1;
      return acc;
    },
    { total: 0, active: 0, provisioning: 0, suspended: 0, closed: 0 }
  );

  const stagingGate = scopeGates?.staging || {
    requiredDays: 14,
    consecutiveCleanDays: 0,
    totalViolations: 0,
    gatePassed: false,
    started: false,
  };

  const productionGate = scopeGates?.production || {
    requiredDays: 7,
    consecutiveCleanDays: 0,
    totalViolations: 0,
    gatePassed: false,
    started: false,
  };

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
        h('h1', { className: 'text-2xl font-bold text-white' }, 'Platform Yönetim Paneli'),
        h('p', { className: 'text-sm text-slate-400 mt-1' }, 'Merkezi çok kiracılı (multi-tenant) sistem özeti ve güvenlik kapıları.')
      ),
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h(
          'a',
          {
            href: '/console/tenants/new',
            className: 'px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors',
          },
          '+ Yeni Operatör Ekle'
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

    error &&
      h(
        'div',
        { className: 'p-4 bg-rose-950/60 border border-rose-500/40 rounded-lg text-xs text-rose-300' },
        error
      ),

    // Tenant Metrics Cards
    h(
      'div',
      { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4' },
      [
        { title: 'Toplam Operatör', count: statusCounts.total, color: 'text-white', border: 'border-slate-700' },
        { title: 'Aktif (Canlı)', count: statusCounts.active, color: 'text-emerald-400', border: 'border-emerald-500/30' },
        { title: 'Hazırlanıyor', count: statusCounts.provisioning, color: 'text-blue-400', border: 'border-blue-500/30' },
        { title: 'Askıya Alındı', count: statusCounts.suspended, color: 'text-amber-400', border: 'border-amber-500/30' },
        { title: 'Kapatıldı', count: statusCounts.closed, color: 'text-slate-400', border: 'border-slate-700' },
      ].map((card) =>
        h(
          'div',
          {
            key: card.title,
            className: `bg-slate-800 p-5 rounded-xl border ${card.border} shadow-sm space-y-1`,
          },
          h('p', { className: 'text-xs font-medium text-slate-400' }, card.title),
          h('p', { className: `text-2xl font-bold ${card.color}` }, loading ? '...' : card.count)
        )
      )
    ),

    // N6 Scope Gates Widget
    h(
      'div',
      { className: 'bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-6' },
      h(
        'div',
        { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-700 pb-3' },
        h(
          'div',
          null,
          h('h2', { className: 'text-lg font-semibold text-white' }, 'N6 Kapsam İzolasyon Güvenlik Kapıları (Scope Gates)'),
          h(
            'p',
            { className: 'text-xs text-slate-400 mt-0.5' },
            'Tüm veri sorguları için sıfır TenantScopeError gereksinimi: Staging için 14 ardışık gün, Canlı (Prod) için 7 ardışık gün.'
          )
        ),
        h(
          'span',
          { className: 'text-xs font-semibold px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300' },
          'Multi-Mode Enforce'
        )
      ),
      h(
        'div',
        { className: 'grid grid-cols-1 md:grid-cols-2 gap-6' },
        // Staging Gate Card
        h(
          'div',
          { className: 'p-5 bg-slate-900/80 rounded-xl border border-slate-700 space-y-4' },
          h(
            'div',
            { className: 'flex justify-between items-center' },
            h(
              'div',
              null,
              h('h3', { className: 'font-semibold text-white text-sm' }, 'Staging Ortamı Güvenlik Kapısı'),
              h('p', { className: 'text-xs text-slate-400' }, `Hedef: ${stagingGate.requiredDays} ardışık temiz gün`)
            ),
            h(
              'span',
              {
                className: `px-2.5 py-0.5 rounded text-xs font-semibold ${
                  stagingGate.gatePassed
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                    : 'bg-amber-950 text-amber-400 border border-amber-500/40'
                }`,
              },
              stagingGate.gatePassed ? '✓ Kapı Geçildi (Hazır)' : '⏳ İlerleme Bekleniyor'
            )
          ),
          h(
            'div',
            { className: 'space-y-1.5' },
            h(
              'div',
              { className: 'flex justify-between text-xs text-slate-300' },
              h('span', null, 'Ardışık Temiz Gün:'),
              h('span', { className: 'font-bold' }, `${stagingGate.consecutiveCleanDays || 0} / ${stagingGate.requiredDays}`)
            ),
            h(
              'div',
              { className: 'w-full bg-slate-800 rounded-full h-2 overflow-hidden' },
              h('div', {
                className: `h-2 rounded-full transition-all ${stagingGate.gatePassed ? 'bg-emerald-500' : 'bg-indigo-500'}`,
                style: { width: `${Math.min(100, ((stagingGate.consecutiveCleanDays || 0) / stagingGate.requiredDays) * 100)}%` },
              })
            )
          ),
          h(
            'div',
            { className: 'pt-2 border-t border-slate-800 flex justify-between text-[11px] text-slate-400' },
            h('span', null, `Toplam İhlal: ${stagingGate.totalViolations || 0}`),
            h('span', null, `Son İhlal: ${stagingGate.lastViolationDay || 'Kayıt Yok'}`)
          )
        ),

        // Production Gate Card
        h(
          'div',
          { className: 'p-5 bg-slate-900/80 rounded-xl border border-slate-700 space-y-4' },
          h(
            'div',
            { className: 'flex justify-between items-center' },
            h(
              'div',
              null,
              h('h3', { className: 'font-semibold text-white text-sm' }, 'Canlı (Production) Ortamı Güvenlik Kapısı'),
              h('p', { className: 'text-xs text-slate-400' }, `Hedef: ${productionGate.requiredDays} ardışık temiz gün`)
            ),
            h(
              'span',
              {
                className: `px-2.5 py-0.5 rounded text-xs font-semibold ${
                  productionGate.gatePassed
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                    : 'bg-amber-950 text-amber-400 border border-amber-500/40'
                }`,
              },
              productionGate.gatePassed ? '✓ Kapı Geçildi (Hazır)' : '⏳ İlerleme Bekleniyor'
            )
          ),
          h(
            'div',
            { className: 'space-y-1.5' },
            h(
              'div',
              { className: 'flex justify-between text-xs text-slate-300' },
              h('span', null, 'Ardışık Temiz Gün:'),
              h('span', { className: 'font-bold' }, `${productionGate.consecutiveCleanDays || 0} / ${productionGate.requiredDays}`)
            ),
            h(
              'div',
              { className: 'w-full bg-slate-800 rounded-full h-2 overflow-hidden' },
              h('div', {
                className: `h-2 rounded-full transition-all ${productionGate.gatePassed ? 'bg-emerald-500' : 'bg-indigo-500'}`,
                style: { width: `${Math.min(100, ((productionGate.consecutiveCleanDays || 0) / productionGate.requiredDays) * 100)}%` },
              })
            )
          ),
          h(
            'div',
            { className: 'pt-2 border-t border-slate-800 flex justify-between text-[11px] text-slate-400' },
            h('span', null, `Toplam İhlal: ${productionGate.totalViolations || 0}`),
            h('span', null, `Son İhlal: ${productionGate.lastViolationDay || 'Kayıt Yok'}`)
          )
        )
      )
    ),

    // System Alerts & Guidance
    h(
      'div',
      { className: 'bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4' },
      h('h3', { className: 'text-base font-semibold text-white border-b border-slate-700 pb-2' }, 'Platform Güvenlik ve İşleyiş Bildirimleri'),
      h(
        'div',
        { className: 'space-y-3 text-xs' },
        statusCounts.provisioning > 0 &&
          h(
            'div',
            { className: 'p-3 bg-blue-950/40 border border-blue-500/30 rounded-lg flex items-center justify-between text-blue-300' },
            h('span', null, `ℹ ${statusCounts.provisioning} operatör hazırlanıyor durumunda. Go-live checklist tamamlanmadan canlı trafik alamazlar.`),
            h('a', { href: '/console/tenants', className: 'text-indigo-400 hover:underline font-medium' }, 'Görüntüle →')
          ),
        statusCounts.suspended > 0 &&
          h(
            'div',
            { className: 'p-3 bg-amber-950/40 border border-amber-500/30 rounded-lg flex items-center justify-between text-amber-300' },
            h('span', null, `⚠️ ${statusCounts.suspended} operatör askıya alınmış durumda. Oyuncu trafiği engellendi.`),
            h('a', { href: '/console/tenants', className: 'text-amber-400 hover:underline font-medium' }, 'Görüntüle →')
          ),
        h(
          'div',
          { className: 'p-3 bg-slate-900 border border-slate-700/60 rounded-lg text-slate-300' },
          'Platform personeli operatör rotalarında varsayılan olarak salt okunurdur (K23). Yazma işlemi gerekiyorsa tenant detayından zaman sınırlı (en fazla 24 saat) ve denetime tabi bir yazma izni (PlatformWriteGrant) verilmelidir.'
        )
      )
    )
  );
}
