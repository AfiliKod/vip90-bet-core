import React, { useState } from 'react';
import apiClient from '../api/client.js';

const h = React.createElement;

export const GATE_TITLES = {
  legalEntity: 'Tüzel Kişilik Bilgileri (Legal Entity)',
  providerApproval: 'İçerik Sağlayıcı Yazılı Onayı (K22)',
  pspSandbox: 'PSP Sandbox Para Yatırma / Çekme Testi',
  kycWebhook: 'KYC Webhook Uç Noktası Doğrulaması',
  emailSending: 'E-posta Gönderim Altyapısı',
  domainTls: 'Alan Adı DNS TXT ve TLS Durumu',
};

export default function GoLiveChecklist({ tenantId, checklist, onStatusChanged }) {
  const [loading, setLoading] = useState(false);
  const [forceMode, setForceMode] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const gates = checklist?.gates || {};
  const allPassed = Boolean(checklist?.allPassed);

  const handleActivate = async (isForced = false) => {
    setError(null);
    setSuccessMessage(null);

    if (isForced && !String(reason || '').trim()) {
      setError('Zorla aktifleştirme işlemi için geçerli bir gerekçe girilmesi zorunludur.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.patch(`/tenants/${tenantId}/status`, {
        status: 'active',
        force: Boolean(isForced),
        reason: String(reason || '').trim(),
      });
      setSuccessMessage('Operatör başarıyla aktifleştirildi (active). Canlı trafiğe açıldı.');
      setForceMode(false);
      setReason('');
      if (onStatusChanged) onStatusChanged(res.data);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Operatör durumu güncellenirken bir hata oluştu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return h(
    'div',
    { className: 'bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-6' },
    h(
      'div',
      { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-700' },
      h(
        'div',
        null,
        h('h3', { className: 'text-lg font-semibold text-white' }, 'Canlıya Geçiş Kontrol Listesi (Go-Live Checklist)'),
        h(
          'p',
          { className: 'text-xs text-slate-400 mt-0.5' },
          'Operatörün canlıya alınabilmesi için aşağıdaki 6 güvenlik ve uyumluluk koşulunun sağlanması gerekir.'
        )
      ),
      h(
        'div',
        { className: 'flex items-center gap-2' },
        allPassed
          ? h('span', { className: 'px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/40' }, '✓ Tüm Koşullar Sağlandı')
          : h('span', { className: 'px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-950 text-amber-400 border border-amber-500/40' }, '⚠ Eksik Koşullar Mevcut')
      )
    ),
    error &&
      h(
        'div',
        { className: 'p-3 bg-rose-950/60 border border-rose-500/40 rounded-md text-xs text-rose-300' },
        error
      ),
    successMessage &&
      h(
        'div',
        { className: 'p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-md text-xs text-emerald-300' },
        successMessage
      ),
    h(
      'div',
      { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
      Object.keys(GATE_TITLES).map((key) => {
        const gate = gates[key] || { passed: false, detail: 'Belirsiz' };
        const passed = Boolean(gate.passed);
        return h(
          'div',
          {
            key,
            className: `p-4 rounded-lg border transition-colors ${
              passed
                ? 'bg-slate-900/60 border-emerald-500/30'
                : 'bg-slate-900/40 border-slate-700'
            }`,
          },
          h(
            'div',
            { className: 'flex items-start justify-between gap-3' },
            h(
              'div',
              { className: 'space-y-1' },
              h('h4', { className: 'text-sm font-medium text-white' }, GATE_TITLES[key] || key),
              h('p', { className: 'text-xs text-slate-400' }, gate.detail || (passed ? 'Tamamlandı' : 'Bekliyor'))
            ),
            h(
              'span',
              {
                className: `inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                  passed
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                    : 'bg-rose-950 text-rose-400 border border-rose-500/40'
                }`,
              },
              passed ? '✓ Doğrulandı' : '✕ Eksik'
            )
          )
        );
      })
    ),
    h(
      'div',
      { className: 'pt-4 border-t border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4' },
      h(
        'div',
        { className: 'text-xs text-slate-400' },
        allPassed
          ? 'Tüm koşullar tamamlandı; operatör doğrudan canlıya açılabilir.'
          : 'Koşullar tamamlanmadan açılış için denetimli yetkili geçişi (force) ve gerekçe gereklidir.'
      ),
      h(
        'div',
        { className: 'flex items-center gap-3 w-full sm:w-auto justify-end' },
        !allPassed &&
          !forceMode &&
          h(
            'button',
            {
              type: 'button',
              onClick: () => setForceMode(true),
              className: 'px-3 py-2 text-xs font-medium text-amber-400 hover:text-amber-300 border border-amber-500/40 hover:bg-amber-950/40 rounded-md transition-colors',
            },
            'Zorla Aktifleştir (Force)'
          ),
        allPassed &&
          h(
            'button',
            {
              type: 'button',
              disabled: loading,
              onClick: () => handleActivate(false),
              className: 'px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-sm transition-colors disabled:opacity-50',
            },
            loading ? 'İşleniyor...' : 'Operatörü Aktifleştir (Activate)'
          )
      )
    ),
    forceMode &&
      h(
        'div',
        { className: 'p-4 bg-amber-950/40 border border-amber-500/40 rounded-lg space-y-3' },
        h(
          'div',
          null,
          h('h4', { className: 'text-xs font-semibold text-amber-300' }, 'Yetkili Zorla Aktifleştirme (Audited Override)'),
          h(
            'p',
            { className: 'text-xs text-slate-300 mt-0.5' },
            'Kontrol listesindeki eksik koşullara rağmen operatörün canlıya alınması için yazılı gerekçe girilmelidir. Bu işlem denetim günlüğüne (AuditLog) kaydedilir.'
          )
        ),
        h('textarea', {
          rows: 2,
          value: reason,
          onChange: (e) => setReason(e.target.value),
          placeholder: 'Zorla aktifleştirme gerekçesini girin (örn. Test ortamı istisnası, acil onay ref)...',
          className:
            'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-xs text-white focus:outline-none focus:ring-amber-500 focus:border-amber-500',
        }),
        h(
          'div',
          { className: 'flex justify-end gap-2' },
          h(
            'button',
            {
              type: 'button',
              onClick: () => setForceMode(false),
              className: 'px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md',
            },
            'Vazgeç'
          ),
          h(
            'button',
            {
              type: 'button',
              disabled: loading || !String(reason || '').trim(),
              onClick: () => handleActivate(true),
              className: 'px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md disabled:opacity-50',
            },
            loading ? 'İşleniyor...' : 'Onayla ve Zorla Aktifleştir'
          )
        )
      )
  );
}
