import React, { useState, useEffect } from 'react';
import apiClient, { billingApi } from '../../api/client.js';
import { formatMoney } from './BillingDashboard.jsx';

const h = React.createElement;

export const SPORTSBOOK_MODEL_OPTIONS = [
  { value: 'none', label: 'Ücret Yok (none)' },
  { value: 'fixed', label: 'Sabit Aylık Ücret (fixed)' },
  { value: 'turnover_percentage', label: 'Ciro Paylaşımı % (turnover_percentage)' },
  { value: 'both', label: 'Karma: Sabit + Ciro % (both)' },
];

export const PLATFORM_FEE_MODEL_OPTIONS = [
  { value: 'none', label: 'Ücret Yok (none)' },
  { value: 'fixed', label: 'Sabit Aylık Ücret (fixed)' },
  { value: 'ggr_percentage', label: 'GGR Paylaşımı % (ggr_percentage)' },
  { value: 'both', label: 'Karma: Sabit + GGR % (both)' },
];

export default function OperatorFeePlans() {
  const [plans, setPlans] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Form State
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [sportsModel, setSportsModel] = useState('none');
  const [sportsFixed, setSportsFixed] = useState('0');
  const [sportsRate, setSportsRate] = useState('0.015'); // 1.5%
  const [sportsCurrency, setSportsCurrency] = useState('TRY');

  const [platModel, setPlatModel] = useState('none');
  const [platFixed, setPlatFixed] = useState('0');
  const [platRate, setPlatRate] = useState('0.02'); // 2%
  const [platCurrency, setPlatCurrency] = useState('TRY');

  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, tenantsRes] = await Promise.allSettled([
        billingApi.listPlans(),
        apiClient.get('/tenants'),
      ]);

      if (plansRes.status === 'fulfilled') {
        setPlans(plansRes.value?.plans || []);
      } else {
        setError(plansRes.reason?.response?.data?.error?.message || 'Planlar alınamadı.');
      }

      if (tenantsRes.status === 'fulfilled') {
        const tList = tenantsRes.value?.data?.tenants || [];
        setTenants(tList);
        if (tList.length > 0 && !selectedTenantId) {
          setSelectedTenantId(tList[0]._id);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Veriler yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const openNewPlanModal = (existingPlan = null) => {
    setSaveError(null);
    if (existingPlan) {
      setSelectedTenantId(existingPlan.tenantId?._id || existingPlan.tenantId || '');
      setSportsModel(existingPlan.sportsbookFee?.model || 'none');
      setSportsFixed(String(existingPlan.sportsbookFee?.fixedMonthlyFee || 0));
      setSportsRate(String(existingPlan.sportsbookFee?.turnoverRate || 0));
      setSportsCurrency(existingPlan.sportsbookFee?.currency || 'TRY');

      setPlatModel(existingPlan.platformFee?.model || 'none');
      setPlatFixed(String(existingPlan.platformFee?.fixedMonthlyFee || 0));
      setPlatRate(String(existingPlan.platformFee?.ggrRate || 0));
      setPlatCurrency(existingPlan.platformFee?.currency || 'TRY');

      setNotes(existingPlan.notes || '');
    } else {
      if (tenants.length > 0) setSelectedTenantId(tenants[0]._id);
      setSportsModel('none');
      setSportsFixed('0');
      setSportsRate('0.015');
      setSportsCurrency('TRY');

      setPlatModel('none');
      setPlatFixed('0');
      setPlatRate('0.02');
      setPlatCurrency('TRY');

      setNotes('');
    }
    setModalOpen(true);
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    setSaveError(null);

    if (!selectedTenantId) {
      setSaveError('Lütfen bir operatör seçin.');
      return;
    }

    setSaveLoading(true);
    try {
      await billingApi.savePlan({
        tenantId: selectedTenantId,
        sportsbookFee: {
          model: sportsModel,
          fixedMonthlyFee: parseFloat(sportsFixed) || 0,
          turnoverRate: parseFloat(sportsRate) || 0,
          currency: sportsCurrency,
        },
        platformFee: {
          model: platModel,
          fixedMonthlyFee: parseFloat(platFixed) || 0,
          ggrRate: parseFloat(platRate) || 0,
          currency: platCurrency,
        },
        notes: notes || undefined,
      });

      setSuccess('Ücret planı başarıyla kaydedildi.');
      setModalOpen(false);
      setTimeout(() => setSuccess(null), 3000);
      loadData();
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Plan kaydedilirken hata oluştu.';
      setSaveError(msg);
    } finally {
      setSaveLoading(false);
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
        h('h1', { className: 'text-2xl font-bold text-white' }, 'Operatör Ücret Planları'),
        h('p', { className: 'text-sm text-slate-400 mt-1' }, 'K20 Spor bahisleri altyapı maliyetleri ve operatör platform lisans modelleri.')
      ),
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h(
          'button',
          {
            type: 'button',
            onClick: () => openNewPlanModal(null),
            className: 'px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors',
          },
          '+ Yeni Plan Tanımla'
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

    // Notifications
    success &&
      h(
        'div',
        { className: 'p-4 rounded-lg bg-emerald-950/50 border border-emerald-800 text-emerald-200 text-sm' },
        success
      ),

    error &&
      h(
        'div',
        { className: 'p-4 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-200 text-sm' },
        error
      ),

    // Info Banner
    h(
      'div',
      { className: 'p-4 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1' },
      h('div', { className: 'font-semibold text-slate-200' }, 'K20 & S3 Ticari Ücretlendirme Kuralları:'),
      h('div', null, '• Her operatör için aynı anda yalnızca bir adet aktif ücret planı bulunabilir (validTo: null).'),
      h('div', null, '• Yeni plan tanımlandığında önceki plan otomatik olarak sonlandırılır; geçmiş günler eski oranlarla deterministic olarak hesaplanır.'),
      h('div', null, '• Tüm plan kayıtları K24 gereği en az 5 yıl boyunca yasal saklama korumasındadır.')
    ),

    // Fee Plans Table
    loading
      ? h('div', { className: 'p-12 text-center text-sm text-slate-500' }, 'Planlar yükleniyor...')
      : plans.length === 0
      ? h(
          'div',
          { className: 'p-12 rounded-lg bg-slate-900 border border-slate-800 text-center text-sm text-slate-400' },
          'Henüz tanımlanmış bir ücret planı bulunmuyor.'
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
                h('th', { className: 'py-3 px-4' }, 'Operatör (Tenant)'),
                h('th', { className: 'py-3 px-4' }, 'Bahis Altyapı Modeli (K20)'),
                h('th', { className: 'py-3 px-4 text-right' }, 'Bahis Sabit Ücret'),
                h('th', { className: 'py-3 px-4 text-center' }, 'Bahis Ciro %'),
                h('th', { className: 'py-3 px-4' }, 'Platform Lisans Modeli'),
                h('th', { className: 'py-3 px-4 text-right' }, 'Platform Sabit Ücret'),
                h('th', { className: 'py-3 px-4 text-center' }, 'Platform GGR %'),
                h('th', { className: 'py-3 px-4' }, 'Geçerlilik'),
                h('th', { className: 'py-3 px-4 text-right' }, 'İşlem')
              )
            ),
            h(
              'tbody',
              { className: 'divide-y divide-slate-800/60' },
              plans.map((p) => {
                const sFee = p.sportsbookFee || {};
                const pFee = p.platformFee || {};
                return h(
                  'tr',
                  { key: p._id, className: 'hover:bg-slate-800/40 transition-colors' },
                  h(
                    'td',
                    { className: 'py-3 px-4 font-medium text-white' },
                    h('div', null, p.tenantId?.name || p.tenantId?.key || p.tenantId),
                    h('div', { className: 'text-slate-500 font-mono text-xs' }, p.tenantId?.key || '')
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4' },
                    h(
                      'span',
                      { className: 'inline-flex px-2 py-0.5 rounded text-xs font-medium border bg-blue-950 text-blue-400 border-blue-500/40' },
                      sFee.model || 'none'
                    )
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4 text-right font-medium text-slate-200' },
                    sFee.fixedMonthlyFee ? formatMoney(sFee.fixedMonthlyFee, sFee.currency || 'TRY') : '-'
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4 text-center text-slate-300' },
                    sFee.turnoverRate ? `${(sFee.turnoverRate * 100).toFixed(2)}%` : '-'
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4' },
                    h(
                      'span',
                      { className: 'inline-flex px-2 py-0.5 rounded text-xs font-medium border bg-indigo-950 text-indigo-400 border-indigo-500/40' },
                      pFee.model || 'none'
                    )
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4 text-right font-medium text-slate-200' },
                    pFee.fixedMonthlyFee ? formatMoney(pFee.fixedMonthlyFee, pFee.currency || 'TRY') : '-'
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4 text-center text-slate-300' },
                    pFee.ggrRate ? `${(pFee.ggrRate * 100).toFixed(2)}%` : '-'
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4 text-slate-400' },
                    p.validFrom ? new Date(p.validFrom).toLocaleDateString('tr-TR') : '-'
                  ),
                  h(
                    'td',
                    { className: 'py-3 px-4 text-right' },
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: () => openNewPlanModal(p),
                        className: 'px-2 py-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-colors',
                      },
                      'Güncelle'
                    )
                  )
                );
              })
            )
          )
        ),

    // Modal
    modalOpen &&
      h(
        'div',
        { className: 'fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm' },
        h(
          'div',
          { className: 'bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto' },
          h(
            'div',
            { className: 'flex items-center justify-between border-b border-slate-800 pb-3' },
            h('h3', { className: 'text-base font-bold text-white' }, 'Operatör Ücret Planı Yapılandır'),
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

          saveError &&
            h('div', { className: 'p-3 rounded bg-rose-950/60 border border-rose-800 text-rose-200 text-xs' }, saveError),

          h(
            'form',
            { onSubmit: handleSavePlan, className: 'space-y-4 text-xs' },

            // Tenant select
            h(
              'div',
              { className: 'space-y-1' },
              h('label', { className: 'font-medium text-slate-300' }, 'Operatör (Tenant) *'),
              h(
                'select',
                {
                  value: selectedTenantId,
                  onChange: (e) => setSelectedTenantId(e.target.value),
                  className: 'w-full px-3 py-2 bg-slate-800 text-white rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500',
                  required: true,
                },
                tenants.map((t) =>
                  h('option', { key: t._id, value: t._id }, `${t.name} (${t.key})`)
                )
              )
            ),

            // Sportsbook Fee Box
            h(
              'div',
              { className: 'p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3' },
              h('div', { className: 'font-semibold text-blue-400' }, 'K20 Spor Bahisleri Altyapı Ücreti'),
              h(
                'div',
                { className: 'grid grid-cols-2 gap-3' },
                h(
                  'div',
                  { className: 'space-y-1' },
                  h('label', { className: 'text-slate-400' }, 'Maliyet Modeli'),
                  h(
                    'select',
                    {
                      value: sportsModel,
                      onChange: (e) => setSportsModel(e.target.value),
                      className: 'w-full px-3 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700',
                    },
                    SPORTSBOOK_MODEL_OPTIONS.map((opt) =>
                      h('option', { key: opt.value, value: opt.value }, opt.label)
                    )
                  )
                ),
                h(
                  'div',
                  { className: 'space-y-1' },
                  h('label', { className: 'text-slate-400' }, 'Para Birimi'),
                  h(
                    'select',
                    {
                      value: sportsCurrency,
                      onChange: (e) => setSportsCurrency(e.target.value),
                      className: 'w-full px-3 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700',
                    },
                    h('option', { value: 'TRY' }, 'TRY'),
                    h('option', { value: 'EUR' }, 'EUR'),
                    h('option', { value: 'USD' }, 'USD')
                  )
                )
              ),
              ['fixed', 'both'].includes(sportsModel) &&
                h(
                  'div',
                  { className: 'space-y-1' },
                  h('label', { className: 'text-slate-400' }, `Sabit Aylık Feed Ücreti (${sportsCurrency})`),
                  h('input', {
                    type: 'number',
                    step: '0.01',
                    value: sportsFixed,
                    onChange: (e) => setSportsFixed(e.target.value),
                    className: 'w-full px-3 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700',
                  })
                ),
              ['turnover_percentage', 'both'].includes(sportsModel) &&
                h(
                  'div',
                  { className: 'space-y-1' },
                  h('label', { className: 'text-slate-400' }, 'Bahis Ciro Oranı (Turnover Rate, örn: 0.015 = %1.5)'),
                  h('input', {
                    type: 'number',
                    step: '0.001',
                    value: sportsRate,
                    onChange: (e) => setSportsRate(e.target.value),
                    className: 'w-full px-3 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700',
                  })
                )
            ),

            // Platform Fee Box
            h(
              'div',
              { className: 'p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3' },
              h('div', { className: 'font-semibold text-indigo-400' }, 'Operatör Platform Lisans Ücreti'),
              h(
                'div',
                { className: 'grid grid-cols-2 gap-3' },
                h(
                  'div',
                  { className: 'space-y-1' },
                  h('label', { className: 'text-slate-400' }, 'Lisans Modeli'),
                  h(
                    'select',
                    {
                      value: platModel,
                      onChange: (e) => setPlatModel(e.target.value),
                      className: 'w-full px-3 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700',
                    },
                    PLATFORM_FEE_MODEL_OPTIONS.map((opt) =>
                      h('option', { key: opt.value, value: opt.value }, opt.label)
                    )
                  )
                ),
                h(
                  'div',
                  { className: 'space-y-1' },
                  h('label', { className: 'text-slate-400' }, 'Para Birimi'),
                  h(
                    'select',
                    {
                      value: platCurrency,
                      onChange: (e) => setPlatCurrency(e.target.value),
                      className: 'w-full px-3 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700',
                    },
                    h('option', { value: 'TRY' }, 'TRY'),
                    h('option', { value: 'EUR' }, 'EUR'),
                    h('option', { value: 'USD' }, 'USD')
                  )
                )
              ),
              ['fixed', 'both'].includes(platModel) &&
                h(
                  'div',
                  { className: 'space-y-1' },
                  h('label', { className: 'text-slate-400' }, `Sabit Aylık Platform Ücreti (${platCurrency})`),
                  h('input', {
                    type: 'number',
                    step: '0.01',
                    value: platFixed,
                    onChange: (e) => setPlatFixed(e.target.value),
                    className: 'w-full px-3 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700',
                  })
                ),
              ['ggr_percentage', 'both'].includes(platModel) &&
                h(
                  'div',
                  { className: 'space-y-1' },
                  h('label', { className: 'text-slate-400' }, 'Platform GGR Oranı (GGR Rate, örn: 0.02 = %2.0)'),
                  h('input', {
                    type: 'number',
                    step: '0.001',
                    value: platRate,
                    onChange: (e) => setPlatRate(e.target.value),
                    className: 'w-full px-3 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700',
                  })
                )
            ),

            // Notes
            h(
              'div',
              { className: 'space-y-1' },
              h('label', { className: 'font-medium text-slate-300' }, 'Notlar / Sözleşme Referansı'),
              h('textarea', {
                rows: 2,
                placeholder: 'Örn: 2026-Q4 Özel Altyapı Anlaşması...',
                value: notes,
                onChange: (e) => setNotes(e.target.value),
                className: 'w-full px-3 py-1.5 bg-slate-800 text-white rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500',
              })
            ),

            // Actions
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
                  disabled: saveLoading,
                  className: 'px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md shadow-sm transition-colors',
                },
                saveLoading ? 'Kaydediliyor...' : 'Planı Kaydet'
              )
            )
          )
        )
      )
  );
}
