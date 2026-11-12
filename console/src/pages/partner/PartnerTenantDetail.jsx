import React, { useState, useEffect } from 'react';
import { partnerApi } from '../../api/client.js';
import { TENANT_STATUS_LABELS } from './PartnerTenantsList.jsx';

const h = React.createElement;

export default function PartnerTenantDetail({ tenantId: propTenantId }) {
  const [tenantId, setTenantId] = useState(propTenantId || '');
  const [tenant, setTenant] = useState(null);
  const [domains, setDomains] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Status Change State (Suspend / Reactivate only, no close, no force)
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState('suspended');
  const [statusReason, setStatusReason] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

  // Owner Re-invite State
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Integrations Write-Only State (Never displays stored secrets)
  const [integProvider, setIntegProvider] = useState('smtp');
  const [integHost, setIntegHost] = useState('');
  const [integUser, setIntegUser] = useState('');
  const [integPass, setIntegPass] = useState('');
  const [integApiKey, setIntegApiKey] = useState('');
  const [integLoading, setIntegLoading] = useState(false);
  const [integSuccess, setIntegSuccess] = useState(null);

  useEffect(() => {
    let id = propTenantId;
    if (!id && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/');
      id = parts[parts.length - 1];
    }
    if (id && id !== 'new') {
      setTenantId(id);
      loadOperatorData(id);
    }
  }, [propTenantId]);

  const loadOperatorData = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, mRes] = await Promise.allSettled([
        partnerApi.getTenant(id),
        partnerApi.getTenantMetrics(id),
      ]);

      if (tRes.status === 'fulfilled') {
        setTenant(tRes.value?.tenant);
        setDomains(tRes.value?.domains || []);
      } else {
        const msg =
          tRes.reason?.response?.data?.error?.message ||
          tRes.reason?.response?.data?.message ||
          'Operatör bilgileri yüklenemedi.';
        setError(msg);
      }

      if (mRes.status === 'fulfilled') {
        setMetrics(mRes.value?.metrics || {});
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChangeSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setActionSuccess(null);

    // K16 & Reviewer correction: partners can ONLY suspend or reactivate (no close, no force)
    if (targetStatus !== 'active' && targetStatus !== 'suspended') {
      setError('Partnerler operatörü yalnızca askıya alabilir veya tekrar aktif edebilir.');
      return;
    }

    setStatusLoading(true);
    try {
      await partnerApi.changeTenantStatus(tenantId, targetStatus, statusReason.trim());
      setStatusModalOpen(false);
      setStatusReason('');
      setActionSuccess(`Operatör durumu başarıyla "${targetStatus === 'active' ? 'Aktif' : 'Askıya Alındı'}" olarak güncellendi.`);
      loadOperatorData(tenantId);
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
    setActionSuccess(null);
    try {
      const res = await partnerApi.reissueOwnerInvite(tenantId);
      setInviteResult(res);
      setActionSuccess('Yeni sahip davet bağlantısı oluşturuldu.');
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'OWNER_ALREADY_ACTIVE' || err.response?.status === 409) {
        setError('Güvenlik Kuralı: Operatör sahibi daha önce giriş yapmıştır; şifresini kendisi sıfırlamalıdır.');
      } else {
        const msg =
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Davet bağlantısı oluşturulamadı.';
        setError(msg);
      }
    } finally {
      setInviteLoading(false);
    }
  };

  const handleIntegrationsSubmit = async (e) => {
    e.preventDefault();
    setIntegLoading(true);
    setError(null);
    setIntegSuccess(null);
    try {
      const credentials = {};
      if (integHost) credentials.host = integHost;
      if (integUser) credentials.user = integUser;
      if (integPass) credentials.pass = integPass;
      if (integApiKey) credentials.apiKey = integApiKey;

      await partnerApi.updateIntegrations(tenantId, {
        provider: integProvider,
        credentials,
      });

      // Clear sensitive fields immediately after submission (write-only)
      setIntegPass('');
      setIntegApiKey('');
      setIntegSuccess(`"${integProvider.toUpperCase()}" entegrasyon kimlik bilgileri başarıyla kaydedildi (Salt Yazılır / Maskeli).`);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Entegrasyon kaydedilirken bir hata oluştu.';
      setError(msg);
    } finally {
      setIntegLoading(false);
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
        { href: '/console/partner/operators', className: 'inline-block px-4 py-2 text-xs bg-slate-800 text-slate-200 rounded-md' },
        '← Operatör Listesine Dön'
      )
    );
  }

  const statusMeta = TENANT_STATUS_LABELS[tenant.status] || {
    text: tenant.status || 'Bilinmiyor',
    className: 'bg-slate-700 text-slate-300',
  };

  const activePlayers = metrics?.activePlayers ?? '<5';

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
          h('span', { className: 'px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-slate-800 text-indigo-300 border border-slate-700' }, tenant.key),
          h('span', { className: `px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusMeta.className}` }, statusMeta.text)
        ),
        h('p', { className: 'text-xs text-slate-400 mt-1' }, `ID: ${tenant._id} | Kayıt: ${new Date(tenant.createdAt).toLocaleString('tr-TR')}`)
      ),
      h(
        'div',
        { className: 'flex flex-wrap items-center gap-2' },
        // Suspend / Reactivate button
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              setTargetStatus(tenant.status === 'active' ? 'suspended' : 'active');
              setStatusModalOpen(true);
            },
            className: `px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tenant.status === 'active'
                ? 'bg-amber-950/80 text-amber-300 hover:bg-amber-900 border border-amber-500/40'
                : 'bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900 border border-emerald-500/40'
            }`,
          },
          tenant.status === 'active' ? '⏸ Operatörü Askıya Al' : '▶ Operatörü Aktifleştir'
        ),
        // Re-issue owner invite
        h(
          'button',
          {
            type: 'button',
            disabled: inviteLoading,
            onClick: handleReissueInvite,
            className: 'px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-950/60 border border-indigo-500/40 hover:bg-indigo-900/60 rounded-md transition-colors disabled:opacity-50',
          },
          inviteLoading ? 'Oluşturuluyor...' : 'Sahip Davet Linkini Yeniden Üret'
        ),
        h(
          'a',
          {
            href: '/console/partner/operators',
            className: 'px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors',
          },
          '← Operatörlerim'
        )
      )
    ),

    error && h('div', { className: 'p-4 bg-rose-950/60 border border-rose-500/40 rounded-lg text-xs text-rose-300' }, error),
    actionSuccess && h('div', { className: 'p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-xs text-emerald-300' }, actionSuccess),

    // Re-issued invite result card
    inviteResult &&
      h(
        'div',
        { className: 'p-4 bg-indigo-950/60 border border-indigo-500/50 rounded-lg space-y-2' },
        h('h4', { className: 'text-xs font-semibold text-indigo-300' }, 'Yeniden Üretilen Sahip Davet Bağlantısı (Tek Kullanımlık):'),
        h(
          'div',
          { className: 'flex items-center gap-2' },
          h('input', {
            type: 'text',
            readOnly: true,
            value: inviteResult.inviteUrl,
            className: 'flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-emerald-300 select-all',
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
        h('p', { className: 'text-xs text-slate-400' }, `Geçerlilik Bitişi: ${new Date(inviteResult.expiresAt).toLocaleString('tr-TR')}`)
      ),

    // Operator Metrics Grid
    h(
      'div',
      { className: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4' },
      [
        { title: 'Casino GGR', value: `₺${(metrics?.casinoGgr ?? 0).toLocaleString('tr-TR')}`, color: 'text-emerald-400', border: 'border-emerald-500/30' },
        { title: 'Spor GGR', value: `₺${(metrics?.sportsGgrRealized ?? 0).toLocaleString('tr-TR')}`, color: 'text-emerald-400', border: 'border-emerald-500/30' },
        { title: 'Ciro (Turnover)', value: `₺${((metrics?.casinoTurnover ?? 0) + (metrics?.sportsTurnover ?? 0)).toLocaleString('tr-TR')}`, color: 'text-white', border: 'border-slate-700' },
        { title: 'Aktif Oyuncu', value: String(activePlayers), color: 'text-indigo-400', border: 'border-indigo-500/30' },
      ].map((card) =>
        h(
          'div',
          { key: card.title, className: `bg-slate-800 p-4 rounded-xl border ${card.border} space-y-1` },
          h('p', { className: 'text-xs text-slate-400 font-medium' }, card.title),
          h('p', { className: `text-xl font-bold ${card.color}` }, card.value)
        )
      )
    ),

    // Operator Info & Domains Grid
    h(
      'div',
      { className: 'grid grid-cols-1 md:grid-cols-2 gap-6' },
      // Info
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3' },
        h('h3', { className: 'text-sm font-semibold text-white border-b border-slate-700 pb-2' }, 'Operatör ve Tüzel Kişilik Bilgileri'),
        h('p', { className: 'text-xs text-slate-300' }, `Operatör Adı: ${tenant.name}`),
        h('p', { className: 'text-xs text-slate-300' }, `Sistem Kodu: ${tenant.key}`),
        h('p', { className: 'text-xs text-slate-300' }, `Şirket: ${tenant.legalEntity?.name || 'Belirtilmedi'}`),
        h('p', { className: 'text-xs text-slate-300' }, `Sicil No: ${tenant.legalEntity?.registrationNo || 'Belirtilmedi'}`),
        h('p', { className: 'text-xs text-slate-300' }, `Adres: ${tenant.legalEntity?.address || 'Belirtilmedi'}`)
      ),

      // Domains
      h(
        'div',
        { className: 'bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3' },
        h('h3', { className: 'text-sm font-semibold text-white border-b border-slate-700 pb-2' }, 'Kayıtlı Alan Adları (Domains)'),
        domains.length === 0
          ? h('p', { className: 'text-xs text-slate-400' }, 'Henüz alan adı atanmamış.')
          : h(
              'div',
              { className: 'space-y-2' },
              domains.map((d) =>
                h(
                  'div',
                  { key: d._id, className: 'flex justify-between items-center p-2.5 bg-slate-900 rounded border border-slate-700 text-xs' },
                  h(
                    'div',
                    null,
                    h('span', { className: 'font-semibold text-white' }, d.host),
                    d.isPrimary && h('span', { className: 'ml-2 text-[10px] text-indigo-300 bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-500/40' }, 'Birincil')
                  ),
                  h(
                    'span',
                    { className: `text-[11px] ${d.verifiedAt ? 'text-emerald-400' : 'text-amber-400'}` },
                    d.verifiedAt ? '✓ Doğrulandı' : 'Bekliyor'
                  )
                )
              )
            )
      )
    ),

    // Integrations Write-Only Form (Spec §4.3.4 & prompt)
    h(
      'div',
      { className: 'bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4' },
      h(
        'div',
        { className: 'border-b border-slate-700 pb-3' },
        h('h3', { className: 'text-base font-semibold text-white' }, 'Entegrasyon Yapılandırması (Salt Yazılır / Maskeli)'),
        h(
          'p',
          { className: 'text-xs text-slate-400 mt-1' },
          'K16/K27 güvenlik standardı: Partner personeli sağlayıcı kimlik bilgilerini (SMTP, SMS, Ödeme) kaydedebilir ancak saklanan parolaları veya API anahtarlarını düz metin olarak geri okuyamaz.'
        )
      ),

      integSuccess && h('div', { className: 'p-3 bg-emerald-950/60 border border-emerald-500/40 rounded text-xs text-emerald-300' }, integSuccess),

      h(
        'form',
        { onSubmit: handleIntegrationsSubmit, className: 'space-y-4 text-xs' },
        h(
          'div',
          { className: 'grid grid-cols-1 sm:grid-cols-2 gap-4' },
          h(
            'div',
            null,
            h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Entegrasyon Sağlayıcısı (Provider) *'),
            h(
              'select',
              {
                value: integProvider,
                onChange: (e) => setIntegProvider(e.target.value),
                className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white',
              },
              h('option', { value: 'smtp' }, 'SMTP E-posta Gönderimi'),
              h('option', { value: 'sms' }, 'SMS Sağlayıcısı'),
              h('option', { value: 'telegram' }, 'Telegram Bildirim Botu'),
              h('option', { value: 'kyc' }, 'KYC Kimlik Doğrulama'),
              h('option', { value: 'payment' }, 'Ödeme Ağ Geçidi')
            )
          ),
          h(
            'div',
            null,
            h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Sunucu / Host Adresi'),
            h('input', {
              type: 'text',
              placeholder: 'örn. smtp.mailgun.org veya api.provider.com',
              value: integHost,
              onChange: (e) => setIntegHost(e.target.value),
              className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white',
            })
          )
        ),
        h(
          'div',
          { className: 'grid grid-cols-1 sm:grid-cols-2 gap-4' },
          h(
            'div',
            null,
            h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Kullanıcı Adı / API Key'),
            h('input', {
              type: 'text',
              placeholder: 'Kullanıcı adı veya API anahtarı',
              value: integUser,
              onChange: (e) => setIntegUser(e.target.value),
              className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white',
            })
          ),
          h(
            'div',
            null,
            h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Parola / Secret (Gizli) *'),
            h('input', {
              type: 'password',
              required: true,
              placeholder: '••••••••••••••••',
              value: integPass,
              onChange: (e) => setIntegPass(e.target.value),
              className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono',
            }),
            h('p', { className: 'text-[11px] text-slate-500 mt-1' }, 'Kaydedildikten sonra geri gösterilmez; sunucuda AES-256 ile şifrelenir.')
          )
        ),
        h(
          'div',
          { className: 'flex justify-end pt-2' },
          h(
            'button',
            {
              type: 'submit',
              disabled: integLoading,
              className: 'px-5 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm transition-colors disabled:opacity-50',
            },
            integLoading ? 'Kaydediliyor...' : 'Entegrasyonu Güvenli Kaydet'
          )
        )
      )
    ),

    // Suspend / Reactivate Modal (NO close option, NO force option)
    statusModalOpen &&
      h(
        'div',
        { className: 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm' },
        h(
          'div',
          { className: 'bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl' },
          h('h3', { className: 'text-lg font-semibold text-white' }, 'Operatör Durumu Değiştir'),
          h(
            'p',
            { className: 'text-xs text-slate-400' },
            targetStatus === 'suspended'
              ? 'Operatörü askıya aldığınızda tüm oyuncu trafiği ve girişleri geçici olarak durdurulur.'
              : 'Operatörü aktifleştirdiğinizde canlı bahis ve oyun trafiği yeniden başlar.'
          ),
          h(
            'form',
            { onSubmit: handleStatusChangeSubmit, className: 'space-y-4 text-xs' },
            h(
              'div',
              null,
              h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Hedef Durum'),
              h(
                'select',
                {
                  value: targetStatus,
                  onChange: (e) => setTargetStatus(e.target.value),
                  className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white',
                },
                h('option', { value: 'suspended' }, 'suspended (Askıya Alındı)'),
                h('option', { value: 'active' }, 'active (Aktif / Canlı)')
              )
            ),
            h(
              'div',
              null,
              h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'İşlem Gerekçesi (Zorunlu) *'),
              h('textarea', {
                required: true,
                rows: 2,
                value: statusReason,
                onChange: (e) => setStatusReason(e.target.value),
                placeholder: 'Durum değişikliği için denetim gerekçesi girin...',
                className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white',
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
                  className: 'px-3 py-1.5 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded',
                },
                'Vazgeç'
              ),
              h(
                'button',
                {
                  type: 'submit',
                  disabled: statusLoading,
                  className: 'px-4 py-1.5 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50',
                },
                statusLoading ? 'İşleniyor...' : 'Durumu Güncelle'
              )
            )
          )
        )
      )
  );
}
