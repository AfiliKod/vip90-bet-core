import React, { useState, useEffect } from 'react';
import apiClient from '../api/client.js';

const h = React.createElement;

export const PARTNER_STATUS_LABELS = {
  active: { text: 'Aktif', className: 'bg-emerald-950 text-emerald-400 border-emerald-500/40' },
  suspended: { text: 'Askıya Alındı', className: 'bg-amber-950 text-amber-400 border-amber-500/40' },
  closed: { text: 'Kapatıldı', className: 'bg-slate-800 text-slate-400 border-slate-600/40' },
};

export const ALL_CAPABILITIES = [
  { key: 'metrics.read', label: 'Metrik Okuma (metrics.read)' },
  { key: 'staff.manage', label: 'Personel Yönetimi (staff.manage)' },
  { key: 'tenants.create', label: 'Operatör Oluşturma (tenants.create)' },
  { key: 'tenants.config:write', label: 'Yapılandırma Yazma (tenants.config:write)' },
  { key: 'tenants.domains:write', label: 'Alan Adı Yönetimi (tenants.domains:write)' },
  { key: 'tenants.staff:write', label: 'Operatör Personeli (tenants.staff:write)' },
  { key: 'tenants.status:write', label: 'Durum Değiştirme (tenants.status:write)' },
  { key: 'tenants.integrations:write', label: 'Entegrasyon Yönetimi (tenants.integrations:write)' },
  { key: 'partner:grants:use', label: 'Veri İzinleri Kullanımı (partner:grants:use)' },
];

export const COMMERCIAL_MODELS = [
  { value: 'revshare_ggr', label: 'GGR Gelir Paylaşımı (revshare_ggr)' },
  { value: 'revshare_ngr', label: 'NGR Gelir Paylaşımı (revshare_ngr)' },
  { value: 'turnover', label: 'Ciro / Turnover Paylaşımı (turnover)' },
  { value: 'fixed', label: 'Sabit Aylık Ücret (fixed)' },
];

export default function PartnersList() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [formData, setFormData] = useState({
    key: '',
    name: '',
    status: 'active',
    capabilities: ['metrics.read', 'staff.manage'],
    maxTenants: 1,
    allowedModules: ['sports', 'casino'],
    commercialModel: 'revshare_ggr',
    rate: 0.15,
    currency: 'TRY',
    minimumFee: 0,
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    legalName: '',
    registrationNo: '',
    legalAddress: '',
  });

  useEffect(() => {
    fetchPartners();
  }, []);

  const fetchPartners = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/partners');
      setPartners(res.data?.partners || []);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Partner listesi yüklenirken bir hata oluştu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError(null);
    if (!formData.key.trim() || !formData.name.trim()) {
      setCreateError('Partner kodu ve adı zorunludur.');
      return;
    }

    setCreateLoading(true);
    try {
      const payload = {
        key: formData.key.trim().toLowerCase(),
        name: formData.name.trim(),
        capabilities: formData.capabilities,
        provisioningLimits: {
          maxTenants: Number(formData.maxTenants) || 1,
          allowedModules: formData.allowedModules,
        },
        defaultCommercialTerms: {
          model: formData.commercialModel,
          rate: Number(formData.rate) || 0,
          currency: formData.currency || 'TRY',
          minimumFee: Number(formData.minimumFee) || 0,
        },
        contact: {
          name: formData.contactName.trim() || null,
          email: formData.contactEmail.trim() || null,
          phone: formData.contactPhone.trim() || null,
        },
        legalEntity: {
          name: formData.legalName.trim() || null,
          registrationNo: formData.registrationNo.trim() || null,
          address: formData.legalAddress.trim() || null,
        },
      };

      await apiClient.post('/partners', payload);
      setModalOpen(false);
      setFormData({
        key: '',
        name: '',
        status: 'active',
        capabilities: ['metrics.read', 'staff.manage'],
        maxTenants: 1,
        allowedModules: ['sports', 'casino'],
        commercialModel: 'revshare_ggr',
        rate: 0.15,
        currency: 'TRY',
        minimumFee: 0,
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        legalName: '',
        registrationNo: '',
        legalAddress: '',
      });
      fetchPartners();
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Partner oluşturulurken hata oluştu.';
      setCreateError(msg);
    } finally {
      setCreateLoading(false);
    }
  };

  const toggleCapability = (capKey) => {
    setFormData((prev) => {
      const current = prev.capabilities || [];
      const updated = current.includes(capKey)
        ? current.filter((k) => k !== capKey)
        : [...current, capKey];
      return { ...prev, capabilities: updated };
    });
  };

  const filteredPartners = partners.filter((p) => {
    const matchesSearch =
      !searchTerm ||
      (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.key || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
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
        h('h1', { className: 'text-2xl font-bold text-white' }, 'Partnerler'),
        h('p', { className: 'text-sm text-slate-400 mt-1' }, 'Platformdaki B2B satış ortakları, bayi-satıcılar ve operatör portföyleri.')
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => setModalOpen(true),
          className: 'inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors',
        },
        '+ Yeni Partner Ekle'
      )
    ),

    // Search and Filters
    h(
      'div',
      { className: 'flex flex-col sm:flex-row items-center gap-3 bg-slate-800 p-4 rounded-lg border border-slate-700' },
      h('input', {
        type: 'text',
        placeholder: 'Partner adı veya koduna göre ara...',
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
        h('option', { value: 'active' }, 'Aktif'),
        h('option', { value: 'suspended' }, 'Askıya Alındı'),
        h('option', { value: 'closed' }, 'Kapatıldı')
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: fetchPartners,
          className: 'px-3 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-md transition-colors',
        },
        'Yenile'
      )
    ),

    error &&
      h('div', { className: 'p-4 bg-rose-950/60 border border-rose-500/40 rounded-lg text-sm text-rose-300' }, error),

    loading
      ? h('div', { className: 'p-8 text-center text-slate-400 text-sm' }, 'Partnerler yükleniyor...')
      : filteredPartners.length === 0
      ? h(
          'div',
          { className: 'p-12 text-center bg-slate-800/40 border border-slate-800 rounded-lg' },
          h('p', { className: 'text-slate-400 text-sm' }, 'Eşleşen partner bulunamadı.')
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
                h('th', { className: 'px-6 py-3' }, 'Partner Adı'),
                h('th', { className: 'px-6 py-3' }, 'Kod (Key)'),
                h('th', { className: 'px-6 py-3' }, 'Durum'),
                h('th', { className: 'px-6 py-3' }, 'Operatör Kotası'),
                h('th', { className: 'px-6 py-3' }, 'Ticari Model'),
                h('th', { className: 'px-6 py-3' }, 'Yetenekler'),
                h('th', { className: 'px-6 py-3 text-right' }, 'İşlemler')
              )
            ),
            h(
              'tbody',
              { className: 'divide-y divide-slate-700 text-sm' },
              filteredPartners.map((p) => {
                const statusMeta = PARTNER_STATUS_LABELS[p.status] || {
                  text: p.status || 'Bilinmiyor',
                  className: 'bg-slate-700 text-slate-300',
                };
                const activeCount = p.activeTenantsCount ?? 0;
                const maxTenants = p.provisioningLimits?.maxTenants ?? 1;
                const terms = p.defaultCommercialTerms || {};

                return h(
                  'tr',
                  { key: p._id, className: 'hover:bg-slate-700/30 transition-colors' },
                  h('td', { className: 'px-6 py-4 whitespace-nowrap font-medium text-white' }, p.name),
                  h('td', { className: 'px-6 py-4 whitespace-nowrap font-mono text-xs text-indigo-300' }, p.key),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap' },
                    h(
                      'span',
                      { className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusMeta.className}` },
                      statusMeta.text
                    )
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-slate-300 text-xs' },
                    `${activeCount} / ${maxTenants} Operatör`
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-slate-300 text-xs' },
                    `${terms.model || 'revshare_ggr'} (%${((terms.rate || 0) * 100).toFixed(0)})`
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-slate-400 text-xs' },
                    `${(p.capabilities || []).length} yetenek`
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-right text-xs font-medium' },
                    h(
                      'a',
                      {
                        href: `/console/partners/${p._id}`,
                        className: 'text-indigo-400 hover:text-indigo-300 bg-slate-900 px-3 py-1.5 rounded border border-slate-700 hover:border-indigo-500 transition-colors',
                      },
                      'Yönet / Detay →'
                    )
                  )
                );
              })
            )
          )
        ),

    // Create Partner Modal
    modalOpen &&
      h(
        'div',
        { className: 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto' },
        h(
          'div',
          { className: 'bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl my-8' },
          h('h3', { className: 'text-lg font-semibold text-white border-b border-slate-800 pb-2' }, 'Yeni Partner Ekle'),
          createError &&
            h('div', { className: 'p-3 bg-rose-950/60 border border-rose-500/40 rounded text-xs text-rose-300' }, createError),
          h(
            'form',
            { onSubmit: handleCreateSubmit, className: 'space-y-4 text-xs' },
            // Basic fields
            h(
              'div',
              { className: 'grid grid-cols-1 sm:grid-cols-2 gap-4' },
              h(
                'div',
                null,
                h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Partner Kodu (Key) *'),
                h('input', {
                  type: 'text',
                  required: true,
                  placeholder: 'örn. partner-alpha',
                  value: formData.key,
                  onChange: (e) => setFormData({ ...formData, key: e.target.value }),
                  className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white font-mono',
                })
              ),
              h(
                'div',
                null,
                h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Partner Adı *'),
                h('input', {
                  type: 'text',
                  required: true,
                  placeholder: 'örn. Alpha B2B Group Ltd',
                  value: formData.name,
                  onChange: (e) => setFormData({ ...formData, name: e.target.value }),
                  className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white',
                })
              )
            ),

            // Capabilities Checklist
            h(
              'div',
              { className: 'p-3 bg-slate-800/80 border border-slate-700 rounded space-y-2' },
              h('p', { className: 'font-semibold text-slate-200' }, 'İzin Verilen Yetenekler (Capabilities)'),
              h(
                'div',
                { className: 'grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]' },
                ALL_CAPABILITIES.map((cap) =>
                  h(
                    'label',
                    { key: cap.key, className: 'flex items-center gap-2 text-slate-300 cursor-pointer' },
                    h('input', {
                      type: 'checkbox',
                      checked: formData.capabilities.includes(cap.key),
                      onChange: () => toggleCapability(cap.key),
                      className: 'rounded bg-slate-900 border-slate-700 text-indigo-600',
                    }),
                    cap.label
                  )
                )
              )
            ),

            // Provisioning Limits & Commercial Terms
            h(
              'div',
              { className: 'grid grid-cols-1 sm:grid-cols-3 gap-3' },
              h(
                'div',
                null,
                h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Maksimum Operatör (maxTenants)'),
                h('input', {
                  type: 'number',
                  min: 1,
                  value: formData.maxTenants,
                  onChange: (e) => setFormData({ ...formData, maxTenants: e.target.value }),
                  className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white',
                })
              ),
              h(
                'div',
                null,
                h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Ticari Model'),
                h(
                  'select',
                  {
                    value: formData.commercialModel,
                    onChange: (e) => setFormData({ ...formData, commercialModel: e.target.value }),
                    className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white',
                  },
                  COMMERCIAL_MODELS.map((m) => h('option', { key: m.value, value: m.value }, m.label))
                )
              ),
              h(
                'div',
                null,
                h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Oran (Rate, örn. 0.15 = %15)'),
                h('input', {
                  type: 'number',
                  step: '0.01',
                  min: '0',
                  max: '1',
                  value: formData.rate,
                  onChange: (e) => setFormData({ ...formData, rate: e.target.value }),
                  className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white',
                })
              )
            ),

            // Contact info
            h(
              'div',
              { className: 'grid grid-cols-1 sm:grid-cols-3 gap-3' },
              h(
                'div',
                null,
                h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'İletişim Yetkilisi'),
                h('input', {
                  type: 'text',
                  placeholder: 'Ad Soyad',
                  value: formData.contactName,
                  onChange: (e) => setFormData({ ...formData, contactName: e.target.value }),
                  className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white',
                })
              ),
              h(
                'div',
                null,
                h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'E-posta'),
                h('input', {
                  type: 'email',
                  placeholder: 'partner@example.com',
                  value: formData.contactEmail,
                  onChange: (e) => setFormData({ ...formData, contactEmail: e.target.value }),
                  className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white',
                })
              ),
              h(
                'div',
                null,
                h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Telefon'),
                h('input', {
                  type: 'text',
                  placeholder: '+90 ...',
                  value: formData.contactPhone,
                  onChange: (e) => setFormData({ ...formData, contactPhone: e.target.value }),
                  className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white',
                })
              )
            ),

            // Buttons
            h(
              'div',
              { className: 'flex justify-end gap-2 pt-3 border-t border-slate-800' },
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => setModalOpen(false),
                  className: 'px-4 py-2 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded',
                },
                'Vazgeç'
              ),
              h(
                'button',
                {
                  type: 'submit',
                  disabled: createLoading,
                  className: 'px-5 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50',
                },
                createLoading ? 'Kaydediliyor...' : 'Partneri Kaydet'
              )
            )
          )
        )
      )
  );
}
