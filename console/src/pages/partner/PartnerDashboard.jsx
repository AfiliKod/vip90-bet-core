import React, { useEffect, useState } from 'react';
import { partnerApi } from '../../api/client.js';

const h = React.createElement;

export default function PartnerDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [partnerInfo, setPartnerInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, meRes] = await Promise.allSettled([
        partnerApi.getPortfolioMetrics(),
        partnerApi.me(),
      ]);
      if (mRes.status === 'fulfilled') {
        setMetrics(mRes.value?.totals || {});
      }
      if (meRes.status === 'fulfilled') {
        setPartnerInfo(meRes.value);
      }
    } catch (err) {
      setError('Portföy metrikleri yüklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const casinoGgr = metrics?.casinoGgr ?? 0;
  const sportsGgr = metrics?.sportsGgrRealized ?? 0;
  const totalTurnover = (metrics?.casinoTurnover ?? 0) + (metrics?.sportsTurnover ?? 0);
  const activePlayers = metrics?.activePlayers ?? '<5';
  const deposits = metrics?.deposits ?? 0;
  const withdrawals = metrics?.withdrawals ?? 0;

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
        h('h1', { className: 'text-2xl font-bold text-white' }, 'Partner Portföy Özeti'),
        h(
          'p',
          { className: 'text-sm text-slate-400 mt-1' },
          partnerInfo?.partner?.name
            ? `${partnerInfo.partner.name} portföyüne bağlı operatörlerin toplulaştırılmış ticari performans metrikleri.`
            : 'Bağlı operatörlerin toplulaştırılmış ticari performans metrikleri.'
        )
      ),
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h(
          'a',
          {
            href: '/console/partner/operators/new',
            className: 'px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors',
          },
          '+ Yeni Operatör Başlat'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: fetchData,
            className: 'px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors',
          },
          'Yenile'
        )
      )
    ),

    error && h('div', { className: 'p-4 bg-rose-950/60 border border-rose-500/40 rounded-lg text-xs text-rose-300' }, error),

    // Commercial Metric Cards
    h(
      'div',
      { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5' },
      [
        {
          title: 'Casino GGR',
          value: `₺${casinoGgr.toLocaleString('tr-TR')}`,
          color: 'text-emerald-400',
          border: 'border-emerald-500/30',
          desc: 'Brüt Casino Oyun Geliri',
        },
        {
          title: 'Spor GGR',
          value: `₺${sportsGgr.toLocaleString('tr-TR')}`,
          color: 'text-emerald-400',
          border: 'border-emerald-500/30',
          desc: 'Gerçekleşen Spor Bahis Geliri',
        },
        {
          title: 'Toplam Ciro (Turnover)',
          value: `₺${totalTurnover.toLocaleString('tr-TR')}`,
          color: 'text-white',
          border: 'border-slate-700',
          desc: 'Casino + Spor Toplam Bahis Hacmi',
        },
        {
          title: 'Aktif Oyuncu Sayısı',
          value: String(activePlayers),
          color: 'text-indigo-400',
          border: 'border-indigo-500/30',
          desc: activePlayers === '<5' ? 'Gizlilik Koruması (<5 gizlenmiş)' : 'Dönem İçi Aktif Oyuncular',
        },
      ].map((card) =>
        h(
          'div',
          {
            key: card.title,
            className: `bg-slate-800 p-5 rounded-xl border ${card.border} shadow-sm space-y-2`,
          },
          h('p', { className: 'text-xs font-medium text-slate-400' }, card.title),
          h('p', { className: `text-2xl font-bold ${card.color}` }, loading ? '...' : card.value),
          h('p', { className: 'text-[11px] text-slate-500' }, card.desc)
        )
      )
    ),

    // Financial movements summary
    h(
      'div',
      { className: 'grid grid-cols-1 md:grid-cols-2 gap-5' },
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-2' },
        h('h3', { className: 'text-sm font-semibold text-slate-300' }, 'Toplam Yatırımlar (Deposits)'),
        h('p', { className: 'text-2xl font-bold text-white' }, loading ? '...' : `₺${deposits.toLocaleString('tr-TR')}`),
        h('p', { className: 'text-xs text-slate-400' }, 'Oyuncuların portföy genelinde yaptığı toplam başarılı para yatırma tutarı.')
      ),
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-2' },
        h('h3', { className: 'text-sm font-semibold text-slate-300' }, 'Toplam Çekimler (Withdrawals)'),
        h('p', { className: 'text-2xl font-bold text-white' }, loading ? '...' : `₺${withdrawals.toLocaleString('tr-TR')}`),
        h('p', { className: 'text-xs text-slate-400' }, 'Oyunculara portföy genelinde ödenen toplam başarılı para çekme tutarı.')
      )
    ),

    // Quick Actions & Isolation Notice
    h(
      'div',
      { className: 'grid grid-cols-1 lg:grid-cols-3 gap-6' },
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4' },
        h('h3', { className: 'text-sm font-semibold text-white border-b border-slate-700 pb-2' }, 'Hızlı Menü'),
        h(
          'div',
          { className: 'space-y-2 text-xs' },
          h(
            'a',
            {
              href: '/console/partner/operators',
              className: 'block p-3 bg-slate-900 hover:bg-slate-700/60 rounded border border-slate-700 text-indigo-300 font-medium transition-colors',
            },
            '→ Operatörlerimi Yönet'
          ),
          h(
            'a',
            {
              href: '/console/partner/operators/new',
              className: 'block p-3 bg-slate-900 hover:bg-slate-700/60 rounded border border-slate-700 text-indigo-300 font-medium transition-colors',
            },
            '+ Yeni Operatör Kurulum Sihirbazı'
          ),
          h(
            'a',
            {
              href: '/console/partner/staff',
              className: 'block p-3 bg-slate-900 hover:bg-slate-700/60 rounded border border-slate-700 text-indigo-300 font-medium transition-colors',
            },
            '👥 Partner Personeli ve Davetler'
          )
        )
      ),
      h(
        'div',
        { className: 'lg:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3' },
        h('h3', { className: 'text-sm font-semibold text-white border-b border-slate-700 pb-2' }, 'K23/K27 Veri Yalıtımı ve Gizlilik Bildirimi'),
        h(
          'div',
          { className: 'space-y-2 text-xs text-slate-300 leading-relaxed' },
          h('p', null, '• Partner paneli metrikleri doğrudan fiziksel olarak izole edilmiş platform özet koleksiyonundan (TenantDailyStat) okunmaktadır.'),
          h('p', null, '• Küçük hücre gizlemesi (Small-Cell Suppression): Oyuncu gizliliğini korumak amacıyla 5\'ten az aktif oyuncu sayısı sistem tarafından otomatik olarak "<5" biçiminde maskelenir.'),
          h('p', null, '• Partner personelinin oyuncu kişisel verilerine (PII), bakiyelerine veya para hareketlerine doğrudan erişim yetkisi bulunmaz; bu veriler yalnızca operatörün açıkça verdiği zaman sınırlı PartnerGrant ile incelenebilir.')
        )
      )
    )
  );
}
