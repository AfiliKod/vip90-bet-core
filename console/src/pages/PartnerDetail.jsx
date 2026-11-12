import React, { useState, useEffect } from 'react';
import apiClient from '../api/client.js';
import { ALL_CAPABILITIES, COMMERCIAL_MODELS, PARTNER_STATUS_LABELS } from './PartnersList.jsx';

const h = React.createElement;

export default function PartnerDetail({ partnerId: propPartnerId }) {
  const [partnerId, setPartnerId] = useState(propPartnerId || '');
  const [partner, setPartner] = useState(null);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Edit states
  const [statusVal, setStatusVal] = useState('active');
  const [capabilities, setCapabilities] = useState([]);
  const [maxTenants, setMaxTenants] = useState(1);
  const [allowedModulesStr, setAllowedModulesStr] = useState('sports, casino');
  const [commercialModel, setCommercialModel] = useState('revshare_ggr');
  const [rate, setRate] = useState(0.15);
  const [currency, setCurrency] = useState('TRY');
  const [minimumFee, setMinimumFee] = useState(0);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let id = propPartnerId;
    if (!id && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/');
      id = parts[parts.length - 1];
    }
    if (id && id !== 'new') {
      setPartnerId(id);
      loadPartnerData(id);
    }
  }, [propPartnerId]);

  const loadPartnerData = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/partners/${id}`);
      const p = res.data?.partner;
      setPartner(p);
      setLinks(res.data?.links || []);
      if (p) {
        setStatusVal(p.status || 'active');
        setCapabilities(p.capabilities || []);
        setMaxTenants(p.provisioningLimits?.maxTenants ?? 1);
        setAllowedModulesStr((p.provisioningLimits?.allowedModules || ['sports', 'casino']).join(', '));
        const terms = p.defaultCommercialTerms || {};
        setCommercialModel(terms.model || 'revshare_ggr');
        setRate(terms.rate ?? 0.15);
        setCurrency(terms.currency || 'TRY');
        setMinimumFee(terms.minimumFee ?? 0);
      }
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Partner bilgileri yüklenirken bir hata oluştu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (patch, successText) => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiClient.patch(`/partners/${partnerId}`, patch);
      setPartner(res.data?.partner);
      setSuccessMsg(successText || 'Değişiklikler başarıyla kaydedildi.');
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Güncelleme sırasında bir hata oluştu.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleCap = (capKey) => {
    setCapabilities((prev) =>
      prev.includes(capKey) ? prev.filter((k) => k !== capKey) : [...prev, capKey]
    );
  };

  if (loading) {
    return h('div', { className: 'p-8 text-center text-slate-400 text-sm' }, 'Partner detayları yükleniyor...');
  }

  if (!partner) {
    return h(
      'div',
      { className: 'p-8 text-center space-y-4' },
      h('p', { className: 'text-rose-400 text-sm' }, error || 'Partner bulunamadı.'),
      h(
        'a',
        { href: '/console/partners', className: 'inline-block px-4 py-2 text-xs bg-slate-800 text-slate-200 rounded-md' },
        '← Partner Listesine Dön'
      )
    );
  }

  const statusMeta = PARTNER_STATUS_LABELS[partner.status] || {
    text: partner.status || 'Bilinmiyor',
    className: 'bg-slate-700 text-slate-300',
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
        h(
          'div',
          { className: 'flex items-center gap-3' },
          h('h1', { className: 'text-2xl font-bold text-white' }, partner.name),
          h('span', { className: 'px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-slate-800 text-indigo-300 border border-slate-700' }, partner.key),
          h('span', { className: `px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusMeta.className}` }, statusMeta.text)
        ),
        h('p', { className: 'text-xs text-slate-400 mt-1' }, `ID: ${partner._id} | Kayıt Tarihi: ${new Date(partner.createdAt).toLocaleString('tr-TR')}`)
      ),
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h(
          'a',
          {
            href: '/console/partners',
            className: 'px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors',
          },
          '← Tüm Partnerler'
        )
      )
    ),

    error && h('div', { className: 'p-4 bg-rose-950/60 border border-rose-500/40 rounded-lg text-xs text-rose-300' }, error),
    successMsg && h('div', { className: 'p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-xs text-emerald-300' }, successMsg),

    // Status & Capabilities Row
    h(
      'div',
      { className: 'grid grid-cols-1 lg:grid-cols-3 gap-6' },
      // Status & Limits Card
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4' },
        h('h3', { className: 'text-sm font-semibold text-white border-b border-slate-700 pb-2' }, 'Durum ve Operatör Kotası'),
        h(
          'div',
          { className: 'space-y-3 text-xs' },
          h(
            'div',
            null,
            h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Hesap Durumu'),
            h(
              'select',
              {
                value: statusVal,
                onChange: (e) => setStatusVal(e.target.value),
                className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white',
              },
              h('option', { value: 'active' }, 'Aktif (active)'),
              h('option', { value: 'suspended' }, 'Askıya Alındı (suspended)'),
              h('option', { value: 'closed' }, 'Kapatıldı (closed)')
            )
          ),
          h(
            'div',
            null,
            h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Maksimum Operatör (maxTenants)'),
            h('input', {
              type: 'number',
              min: 1,
              value: maxTenants,
              onChange: (e) => setMaxTenants(e.target.value),
              className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white',
            })
          ),
          h(
            'div',
            null,
            h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'İzin Verilen Modüller (Virgülle ayırın)'),
            h('input', {
              type: 'text',
              value: allowedModulesStr,
              onChange: (e) => setAllowedModulesStr(e.target.value),
              className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono text-xs',
            })
          ),
          h(
            'button',
            {
              type: 'button',
              disabled: saving,
              onClick: () => {
                const modules = allowedModulesStr.split(',').map((m) => m.trim()).filter(Boolean);
                handleUpdate({
                  status: statusVal,
                  provisioningLimits: { maxTenants: Number(maxTenants), allowedModules: modules },
                }, 'Durum ve limitler güncellendi.');
              },
              className: 'w-full px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors disabled:opacity-50',
            },
            saving ? 'Kaydediliyor...' : 'Durum ve Limitleri Kaydet'
          )
        )
      ),

      // Commercial Terms Card
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4' },
        h('h3', { className: 'text-sm font-semibold text-white border-b border-slate-700 pb-2' }, 'K20/K21 Ticari Koşullar'),
        h(
          'div',
          { className: 'space-y-3 text-xs' },
          h(
            'div',
            null,
            h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Hesaplama Modeli'),
            h(
              'select',
              {
                value: commercialModel,
                onChange: (e) => setCommercialModel(e.target.value),
                className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white',
              },
              COMMERCIAL_MODELS.map((m) => h('option', { key: m.value, value: m.value }, m.label))
            )
          ),
          h(
            'div',
            null,
            h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Komisyon Oranı (Rate, örn. 0.15 = %15)'),
            h('input', {
              type: 'number',
              step: '0.01',
              min: '0',
              max: '1',
              value: rate,
              onChange: (e) => setRate(e.target.value),
              className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white',
            })
          ),
          h(
            'div',
            { className: 'grid grid-cols-2 gap-2' },
            h(
              'div',
              null,
              h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Para Birimi'),
              h('input', {
                type: 'text',
                value: currency,
                onChange: (e) => setCurrency(e.target.value),
                className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white',
              })
            ),
            h(
              'div',
              null,
              h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Minimum Ücret'),
              h('input', {
                type: 'number',
                value: minimumFee,
                onChange: (e) => setMinimumFee(e.target.value),
                className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white',
              })
            )
          ),
          h(
            'button',
            {
              type: 'button',
              disabled: saving,
              onClick: () => {
                handleUpdate({
                  defaultCommercialTerms: {
                    model: commercialModel,
                    rate: Number(rate),
                    currency,
                    minimumFee: Number(minimumFee),
                  },
                }, 'Ticari koşullar güncellendi.');
              },
              className: 'w-full px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors disabled:opacity-50',
            },
            saving ? 'Kaydediliyor...' : 'Ticari Koşulları Kaydet'
          )
        )
      ),

      // Contact & Entity Card
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4' },
        h('h3', { className: 'text-sm font-semibold text-white border-b border-slate-700 pb-2' }, 'İletişim ve Tüzel Kişilik'),
        h(
          'div',
          { className: 'space-y-2 text-xs text-slate-300' },
          h('p', null, h('span', { className: 'text-slate-500 font-medium' }, 'Yetkili: '), partner.contact?.name || 'Belirtilmedi'),
          h('p', null, h('span', { className: 'text-slate-500 font-medium' }, 'E-posta: '), partner.contact?.email || 'Belirtilmedi'),
          h('p', null, h('span', { className: 'text-slate-500 font-medium' }, 'Telefon: '), partner.contact?.phone || 'Belirtilmedi'),
          h('div', { className: 'pt-2 border-t border-slate-700' }),
          h('p', null, h('span', { className: 'text-slate-500 font-medium' }, 'Şirket: '), partner.legalEntity?.name || 'Belirtilmedi'),
          h('p', null, h('span', { className: 'text-slate-500 font-medium' }, 'Sicil No: '), partner.legalEntity?.registrationNo || 'Belirtilmedi'),
          h('p', null, h('span', { className: 'text-slate-500 font-medium' }, 'Adres: '), partner.legalEntity?.address || 'Belirtilmedi')
        )
      )
    ),

    // Capabilities Card
    h(
      'div',
      { className: 'bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4' },
      h(
        'div',
        { className: 'flex justify-between items-center border-b border-slate-700 pb-3' },
        h(
          'div',
          null,
          h('h3', { className: 'text-base font-semibold text-white' }, 'Partner Yetenek Seti (Capabilities)'),
          h('p', { className: 'text-xs text-slate-400 mt-0.5' }, 'Partner personelinin bu organizasyon altında kullanabileceği izinler.')
        ),
        h(
          'button',
          {
            type: 'button',
            disabled: saving,
            onClick: () => handleUpdate({ capabilities }, 'Yetenek seti güncellendi.'),
            className: 'px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors disabled:opacity-50',
          },
          saving ? 'Kaydediliyor...' : 'Yetenekleri Güncelle'
        )
      ),
      h(
        'div',
        { className: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs' },
        ALL_CAPABILITIES.map((cap) =>
          h(
            'label',
            { key: cap.key, className: 'flex items-center gap-2 p-2 bg-slate-900/60 rounded border border-slate-700 text-slate-300 cursor-pointer hover:border-slate-600' },
            h('input', {
              type: 'checkbox',
              checked: capabilities.includes(cap.key),
              onChange: () => toggleCap(cap.key),
              className: 'rounded bg-slate-800 border-slate-700 text-indigo-600',
            }),
            h('span', null, cap.label)
          )
        )
      )
    ),

    // Linked Operators Section
    h(
      'div',
      { className: 'bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4' },
      h(
        'div',
        { className: 'flex justify-between items-center border-b border-slate-700 pb-3' },
        h('h3', { className: 'text-base font-semibold text-white' }, 'Bağlı Operatörler (Partner-Operator Links)'),
        h('span', { className: 'text-xs text-slate-400' }, `${links.length} Bağlantı Kayıtlı`)
      ),
      links.length === 0
        ? h('p', { className: 'text-xs text-slate-400' }, 'Bu partnere bağlı operatör bulunmuyor.')
        : h(
            'div',
            { className: 'overflow-hidden border border-slate-700 rounded-lg' },
            h(
              'table',
              { className: 'min-w-full divide-y divide-slate-700 text-left text-xs' },
              h(
                'thead',
                { className: 'bg-slate-900/60 font-semibold text-slate-400 uppercase tracking-wider' },
                h(
                  'tr',
                  null,
                  h('th', { className: 'px-4 py-3' }, 'Operatör Adı'),
                  h('th', { className: 'px-4 py-3' }, 'Kod'),
                  h('th', { className: 'px-4 py-3' }, 'Durum'),
                  h('th', { className: 'px-4 py-3' }, 'Geçerlilik Başlangıcı'),
                  h('th', { className: 'px-4 py-3' }, 'Bitiş Tarihi'),
                  h('th', { className: 'px-4 py-3 text-right' }, 'İşlemler')
                )
              ),
              h(
                'tbody',
                { className: 'divide-y divide-slate-700 text-slate-300' },
                links.map((link) => {
                  const t = link.tenantId || {};
                  const isActiveLink = !link.validTo;
                  return h(
                    'tr',
                    { key: link._id, className: 'hover:bg-slate-700/30' },
                    h('td', { className: 'px-4 py-3 font-medium text-white' }, t.name || 'Bilinmiyor'),
                    h('td', { className: 'px-4 py-3 font-mono text-indigo-300' }, t.key || '-'),
                    h('td', { className: 'px-4 py-3' }, t.status || '-'),
                    h('td', { className: 'px-4 py-3 text-slate-400' }, link.validFrom ? new Date(link.validFrom).toLocaleDateString('tr-TR') : '-'),
                    h(
                      'td',
                      { className: 'px-4 py-3' },
                      isActiveLink
                        ? h('span', { className: 'px-2 py-0.5 rounded text-[11px] bg-emerald-950 text-emerald-400 border border-emerald-500/40' }, 'Aktif Bağlantı')
                        : h('span', { className: 'text-slate-500' }, new Date(link.validTo).toLocaleDateString('tr-TR'))
                    ),
                    h(
                      'td',
                      { className: 'px-4 py-3 text-right' },
                      t._id &&
                        h(
                          'a',
                          {
                            href: `/console/tenants/${t._id}`,
                            className: 'text-indigo-400 hover:text-indigo-300 font-medium',
                          },
                          'Operatör Detayı →'
                        )
                    )
                  );
                })
              )
            )
          )
    )
  );
}
