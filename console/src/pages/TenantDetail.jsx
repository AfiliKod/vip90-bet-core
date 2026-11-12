import React, { useState, useEffect } from 'react';
import apiClient from '../api/client.js';
import GoLiveChecklist from './GoLiveChecklist.jsx';
import WriteGrantModal from '../components/WriteGrantModal.jsx';

const h = React.createElement;

export default function TenantDetail({ tenantId: propTenantId }) {
  const [tenantId, setTenantId] = useState(propTenantId || '');
  const [tenant, setTenant] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Status Change Modal State
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState('active');
  const [forceStatus, setForceStatus] = useState(false);
  const [statusReason, setStatusReason] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

  // Owner Invite State
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Write Grant Modal State
  const [writeGrantModalOpen, setWriteGrantModalOpen] = useState(false);

  useEffect(() => {
    let id = propTenantId;
    if (!id && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/');
      id = parts[parts.length - 1];
    }
    if (id && id !== 'new') {
      setTenantId(id);
      loadTenantData(id);
    }
  }, [propTenantId]);

  const loadTenantData = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, dRes] = await Promise.all([
        apiClient.get(`/tenants/${id}`),
        apiClient.get(`/tenants/${id}/domains`),
      ]);
      setTenant(tRes.data?.tenant);
      setChecklist(tRes.data?.checklist);
      setDomains(dRes.data?.domains || []);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Operatör bilgileri yüklenirken bir hata oluştu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChangeSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (forceStatus && !String(statusReason || '').trim()) {
      setError('Zorla geçiş (force) yapıldığında geçerli bir gerekçe girilmesi zorunludur.');
      return;
    }

    if (targetStatus === 'closed' && !String(statusReason || '').trim()) {
      setError('Operatör kapatılırken gerekçe girilmesi zorunludur (K26 yasal saklama kaydı).');
      return;
    }

    setStatusLoading(true);
    try {
      const res = await apiClient.patch(`/tenants/${tenantId}/status`, {
        status: targetStatus,
        force: Boolean(forceStatus),
        reason: String(statusReason || '').trim(),
      });
      setStatusModalOpen(false);
      setForceStatus(false);
      setStatusReason('');
      setActionSuccess(`Durum başarıyla "${targetStatus}" olarak güncellendi.`);
      loadTenantData(tenantId);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Durum güncellenirken bir hata oluştu.';
      setError(msg);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleReissueInvite = async () => {
    setInviteLoading(true);
    setError(null);
    setInviteResult(null);
    try {
      const res = await apiClient.post(`/tenants/${tenantId}/owner-invite`);
      setInviteResult(res.data);
      setActionSuccess('Yeni sahip davet bağlantısı oluşturuldu.');
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'OWNER_ALREADY_ACTIVE' || err.response?.status === 409) {
        setError('Güvenlik Uyarısı (K23): Operatör sahibi zaten daha önce giriş yapmıştır; şifresini kendisi sıfırlamalıdır.');
      } else {
        const msg =
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Davet oluşturulamadı.';
        setError(msg);
      }
    } finally {
      setInviteLoading(false);
    }
  };

  const handleVerifyDns = async (domainId) => {
    setError(null);
    try {
      const res = await apiClient.post(`/tenants/${tenantId}/domains/${domainId}/verify-dns`);
      if (res.data?.verified) {
        setActionSuccess('Alan adı DNS doğrulaması başarıyla tamamlandı.');
      } else {
        setError(`DNS doğrulaması başarısız: ${res.data?.message || 'TXT kaydı bulunamadı.'}`);
      }
      loadTenantData(tenantId);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'DNS doğrulaması sırasında bir hata oluştu.';
      setError(msg);
    }
  };

  const handleSyncTls = async (domainId) => {
    setError(null);
    try {
      const res = await apiClient.post(`/tenants/${tenantId}/domains/${domainId}/sync-tls`);
      setActionSuccess(`TLS durumu senkronize edildi: ${res.data?.status || 'güncellendi'}.`);
      loadTenantData(tenantId);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'TLS durumu güncellenirken bir hata oluştu.';
      setError(msg);
    }
  };

  if (loading) {
    return h('div', { className: 'p-8 text-center text-slate-400 text-sm' }, 'Operatör detayları yükleniyor...');
  }

  if (!tenant) {
    return h(
      'div',
      { className: 'p-8 text-center space-y-4' },
      h('p', { className: 'text-rose-400 text-sm' }, error || 'Operatör bulunamadı.'),
      h(
        'a',
        { href: '/tenants', className: 'inline-block px-4 py-2 text-xs bg-slate-800 text-slate-200 rounded-md' },
        '← Operatör Listesine Dön'
      )
    );
  }

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
          h('h1', { className: 'text-2xl font-bold text-white' }, tenant.name || 'Operatör'),
          h(
            'span',
            { className: 'px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-indigo-300 border border-slate-700' },
            tenant.key
          ),
          h(
            'span',
            {
              className: `px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                tenant.status === 'active'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                  : tenant.status === 'provisioning'
                  ? 'bg-blue-950 text-blue-400 border border-blue-500/40'
                  : tenant.status === 'suspended'
                  ? 'bg-amber-950 text-amber-400 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-600/40'
              }`,
            },
            tenant.status
          )
        ),
        h(
          'p',
          { className: 'text-xs text-slate-400 mt-1' },
          `ID: ${tenant._id} | Oluşturulma: ${new Date(tenant.createdAt).toLocaleString('tr-TR')}`
        )
      ),
      h(
        'div',
        { className: 'flex flex-wrap items-center gap-2' },
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              setTargetStatus(tenant.status === 'active' ? 'suspended' : 'active');
              setStatusModalOpen(true);
            },
            className: 'px-3 py-1.5 text-xs font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-md transition-colors',
          },
          'Durum Değiştir...'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () => setWriteGrantModalOpen(true),
            className: 'px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-950/60 border border-amber-500/40 hover:bg-amber-900/60 rounded-md transition-colors',
          },
          '⚡ K23 Yazma İzni Ver'
        ),
        h(
          'button',
          {
            type: 'button',
            disabled: inviteLoading,
            onClick: handleReissueInvite,
            className: 'px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-950/60 border border-indigo-500/40 hover:bg-indigo-900/60 rounded-md transition-colors disabled:opacity-50',
          },
          inviteLoading ? 'Oluşturuluyor...' : 'Sahip Davet Linki Üret'
        )
      )
    ),
    error &&
      h(
        'div',
        { className: 'p-4 bg-rose-950/60 border border-rose-500/40 rounded-lg text-xs text-rose-300' },
        error
      ),
    actionSuccess &&
      h(
        'div',
        { className: 'p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-xs text-emerald-300' },
        actionSuccess
      ),
    inviteResult &&
      h(
        'div',
        { className: 'p-4 bg-indigo-950/60 border border-indigo-500/50 rounded-lg space-y-2' },
        h('h4', { className: 'text-xs font-semibold text-indigo-300' }, 'Yeni Sahip Davet Bağlantısı:'),
        h(
          'div',
          { className: 'flex items-center gap-2' },
          h('input', {
            type: 'text',
            readOnly: true,
            value: inviteResult.inviteUrl,
            className: 'flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-white select-all',
          }),
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(inviteResult.inviteUrl);
                  setCopiedInvite(true);
                  setTimeout(() => setCopiedInvite(false), 2000);
                }
              },
              className: 'px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700',
            },
            copiedInvite ? '✓ Kopyalandı' : 'Kopyala'
          )
        ),
        h(
          'p',
          { className: 'text-xs text-slate-400' },
          `Geçerlilik: ${new Date(inviteResult.expiresAt).toLocaleString('tr-TR')}`
        )
      ),

    // Grid: General Info & Entitlements
    h(
      'div',
      { className: 'grid grid-cols-1 md:grid-cols-2 gap-6' },
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-3' },
        h('h3', { className: 'text-sm font-semibold text-white border-b border-slate-700 pb-2' }, 'Tüzel Kişilik Bilgileri'),
        h('p', { className: 'text-xs text-slate-300' }, `Şirket: ${tenant.legalEntity?.name || 'Belirtilmedi'}`),
        h('p', { className: 'text-xs text-slate-300' }, `Sicil No: ${tenant.legalEntity?.registrationNo || 'Belirtilmedi'}`),
        h('p', { className: 'text-xs text-slate-300' }, `Adres: ${tenant.legalEntity?.address || 'Belirtilmedi'}`)
      ),
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-3' },
        h('h3', { className: 'text-sm font-semibold text-white border-b border-slate-700 pb-2' }, 'K22 Sağlayıcı Onayı ve Modüller'),
        h(
          'p',
          { className: 'text-xs text-slate-300' },
          `Yetkili Modüller: ${(tenant.entitlements?.modules || []).join(', ') || 'Yok'}`
        ),
        h(
          'p',
          { className: 'text-xs text-slate-300' },
          `Sağlayıcı Onay Durumu: ${tenant.providerApproval?.approved ? `Onaylandı (${tenant.providerApproval?.documentRef || 'Belge Var'})` : 'Onay Bekliyor'}`
        ),
        tenant.retentionLockUntil &&
          h(
            'p',
            { className: 'text-xs text-rose-400 font-semibold pt-1 border-t border-slate-700' },
            `K24/K26 Yasal Saklama Kilidi: ${new Date(tenant.retentionLockUntil).toLocaleDateString('tr-TR')} tarihine kadar silinemez.`
          )
      )
    ),

    // Go Live Checklist
    h(GoLiveChecklist, {
      tenantId,
      checklist,
      onStatusChanged: () => loadTenantData(tenantId),
    }),

    // Domains Section
    h(
      'div',
      { className: 'bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4' },
      h(
        'div',
        { className: 'flex justify-between items-center border-b border-slate-700 pb-3' },
        h('h3', { className: 'text-base font-semibold text-white' }, 'Operatör Alan Adları ve DNS TXT Doğrulaması'),
        h('span', { className: 'text-xs text-slate-400' }, `${domains.length} Alan Adı Kayıtlı`)
      ),
      domains.length === 0
        ? h('p', { className: 'text-xs text-slate-400' }, 'Henüz alan adı bulunmuyor.')
        : h(
            'div',
            { className: 'space-y-4' },
            domains.map((d) =>
              h(
                'div',
                { key: d._id, className: 'p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-3' },
                h(
                  'div',
                  { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2' },
                  h(
                    'div',
                    null,
                    h(
                      'div',
                      { className: 'flex items-center gap-2' },
                      h('span', { className: 'font-semibold text-sm text-white' }, d.host),
                      d.isPrimary &&
                        h('span', { className: 'px-2 py-0.5 text-xs bg-indigo-950 text-indigo-300 border border-indigo-500/40 rounded' }, 'Birincil (Primary)')
                    ),
                    h(
                      'p',
                      { className: 'text-xs text-slate-400 mt-0.5' },
                      `Doğrulama: ${d.verifiedAt ? `✓ Doğrulandı (${new Date(d.verifiedAt).toLocaleDateString('tr-TR')})` : '✕ Bekliyor'} | TLS: ${d.tls?.status || 'pending'}`
                    )
                  ),
                  h(
                    'div',
                    { className: 'flex items-center gap-2' },
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: () => handleVerifyDns(d._id),
                        className: 'px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors',
                      },
                      'DNS Doğrula'
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: () => handleSyncTls(d._id),
                        className: 'px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors',
                      },
                      'TLS Senkronize Et'
                    )
                  )
                ),
                // Show DNS TXT challenge info
                h(
                  'div',
                  { className: 'p-3 bg-slate-950 rounded border border-slate-800 text-xs space-y-1 font-mono' },
                  h('p', { className: 'text-slate-400 font-sans font-medium mb-1' }, 'DNS Yönetim Paneline Eklenecek TXT Kaydı:'),
                  h(
                    'div',
                    { className: 'flex items-center gap-2' },
                    h('span', { className: 'text-slate-500 select-none' }, 'Kayıt Adı (Label):'),
                    h('span', { className: 'text-indigo-300 select-all font-bold' }, `_domain-verify.${d.host}`)
                  ),
                  h(
                    'div',
                    { className: 'flex items-center gap-2' },
                    h('span', { className: 'text-slate-500 select-none' }, 'Değer (Value):'),
                    h('span', { className: 'text-emerald-300 select-all font-bold' }, d.txtVerificationToken || 'Belirtilmedi')
                  )
                )
              )
            )
          )
    ),

    // Status Change Modal
    statusModalOpen &&
      h(
        'div',
        { className: 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm' },
        h(
          'div',
          { className: 'bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl' },
          h('h3', { className: 'text-lg font-semibold text-white' }, 'Operatör Durumu Değiştir'),
          h(
            'form',
            { onSubmit: handleStatusChangeSubmit, className: 'space-y-4' },
            h(
              'div',
              null,
              h('label', { className: 'block text-xs font-medium text-slate-300 mb-1' }, 'Hedef Durum'),
              h(
                'select',
                {
                  value: targetStatus,
                  onChange: (e) => setTargetStatus(e.target.value),
                  className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-indigo-500',
                },
                h('option', { value: 'active' }, 'active (Canlı / Açık)'),
                h('option', { value: 'suspended' }, 'suspended (Askıya Alınmış / Trafik Engelli)'),
                h('option', { value: 'closed' }, 'closed (Kapatıldı / 5 Yıl Saklama Kilidi)'),
                h('option', { value: 'provisioning' }, 'provisioning (Hazırlık Aşaması)')
              )
            ),
            h(
              'div',
              { className: 'flex items-center gap-2' },
              h('input', {
                type: 'checkbox',
                id: 'force-checkbox',
                checked: forceStatus,
                onChange: (e) => setForceStatus(e.target.checked),
                className: 'rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500',
              }),
              h('label', { htmlFor: 'force-checkbox', className: 'text-xs font-medium text-slate-300 cursor-pointer' }, 'Zorla Değiştir (Force Override)')
            ),
            (forceStatus || targetStatus === 'closed') &&
              h(
                'div',
                null,
                h(
                  'label',
                  { className: 'block text-xs font-medium text-amber-300 mb-1' },
                  forceStatus ? 'Zorla Değiştirme Gerekçesi (Zorunlu) *' : 'Kapatma Gerekçesi (Zorunlu) *'
                ),
                h('textarea', {
                  required: true,
                  rows: 2,
                  value: statusReason,
                  onChange: (e) => setStatusReason(e.target.value),
                  placeholder: 'Gerekçe ve yetkili onay referansını girin...',
                  className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none focus:ring-indigo-500',
                })
              ),
            h(
              'div',
              { className: 'flex justify-end gap-2 pt-2 border-t border-slate-800' },
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => setStatusModalOpen(false),
                  className: 'px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded',
                },
                'Vazgeç'
              ),
              h(
                'button',
                {
                  type: 'submit',
                  disabled: statusLoading,
                  className: 'px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50',
                },
                statusLoading ? 'İşleniyor...' : 'Durumu Güncelle'
              )
            )
          )
        )
      ),

    // Write Grant Modal
    h(WriteGrantModal, {
      isOpen: writeGrantModalOpen,
      onClose: () => setWriteGrantModalOpen(false),
      tenantId,
      onGrantIssued: () => {
        setActionSuccess('K23 yazma izni (write grant) başarıyla verildi ve denetim kaydı oluşturuldu.');
        loadTenantData(tenantId);
      },
    })
  );
}
