import React, { useState } from 'react';
import { partnerApi } from '../../api/client.js';

const h = React.createElement;

export default function PartnerTenantProvision() {
  const [formData, setFormData] = useState({
    key: '',
    name: '',
    domain: '',
    ownerEmail: '',
    legalName: '',
    registrationNo: '',
    legalAddress: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [createdResult, setCreatedResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCopyInvite = () => {
    if (createdResult?.ownerInviteUrl && typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(createdResult.ownerInviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.key.trim() || !formData.name.trim() || !formData.domain.trim() || !formData.ownerEmail.trim()) {
      setError('Lütfen zorunlu alanları doldurun (Kod, İsim, Alan Adı, Yönetici E-posta).');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        key: formData.key.trim().toLowerCase(),
        name: formData.name.trim(),
        domain: formData.domain.trim().toLowerCase(),
        ownerEmail: formData.ownerEmail.trim().toLowerCase(),
        legalEntity: {
          name: formData.legalName.trim() || formData.name.trim(),
          registrationNo: formData.registrationNo.trim() || 'REG-PENDING',
          address: formData.legalAddress.trim() || 'Address Pending',
        },
      };

      const res = await partnerApi.provisionTenant(payload);
      setCreatedResult(res);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Operatör oluşturulurken bir hata oluştu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (createdResult) {
    const tenantId = createdResult.tenantId || createdResult.tenant?._id || createdResult._id;
    return h(
      'div',
      { className: 'max-w-2xl mx-auto space-y-6' },
      h(
        'div',
        { className: 'p-6 bg-slate-800 border border-slate-700 rounded-xl space-y-6' },
        h(
          'div',
          { className: 'flex items-center gap-3 text-emerald-400' },
          h('span', { className: 'text-2xl' }, '✓'),
          h(
            'div',
            null,
            h('h2', { className: 'text-xl font-bold text-white' }, 'Operatör Başarıyla Başlatıldı!'),
            h('p', { className: 'text-xs text-slate-400 mt-0.5' }, `ID: ${tenantId} | Durum: ${createdResult.status || 'provisioning'}`)
          )
        ),
        createdResult.ownerInviteUrl &&
          h(
            'div',
            { className: 'p-4 bg-amber-950/60 border border-amber-500/50 rounded-lg space-y-3' },
            h(
              'div',
              { className: 'flex items-start gap-2' },
              h('span', { className: 'text-amber-400 font-bold text-base' }, '⚠️'),
              h(
                'div',
                null,
                h('h4', { className: 'text-sm font-semibold text-amber-300' }, 'ÖNEMLİ: Yönetici Davet Bağlantısı (Yalnızca Bir Kez Gösterilir!)'),
                h(
                  'p',
                  { className: 'text-xs text-amber-200/80 mt-1' },
                  'Bu bağlantı operatör sahibinin hesabını aktifleştirmesi ve şifre belirlemesi için oluşturulmuştur. Güvenlik nedeniyle bu bağlantı konsolda yalnızca BİR KEZ gösterilir. Lütfen şimdi kopyalayın ve güvenli bir şekilde operatör sahibine iletin.'
                )
              )
            ),
            h(
              'div',
              { className: 'flex items-center gap-2 pt-2' },
              h('input', {
                type: 'text',
                readOnly: true,
                value: createdResult.ownerInviteUrl,
                className:
                  'flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-xs font-mono text-emerald-300 select-all focus:outline-none',
              }),
              h(
                'button',
                {
                  type: 'button',
                  onClick: handleCopyInvite,
                  className: `px-4 py-2 text-xs font-medium rounded-md transition-colors ${
                    copied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`,
                },
                copied ? '✓ Kopyalandı' : 'Kopyala'
              )
            )
          ),
        h(
          'div',
          { className: 'pt-4 border-t border-slate-700 flex justify-between items-center' },
          h(
            'a',
            {
              href: '/console/partner/operators',
              className: 'px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-700 rounded-md transition-colors',
            },
            'Operatör Listesine Dön'
          ),
          h(
            'a',
            {
              href: `/console/partner/operators/${tenantId}`,
              className: 'px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors',
            },
            'Operatör Detayına Git →'
          )
        )
      )
    );
  }

  return h(
    'div',
    { className: 'max-w-2xl mx-auto space-y-6' },
    // Header
    h(
      'div',
      { className: 'border-b border-slate-800 pb-4' },
      h('h1', { className: 'text-2xl font-bold text-white' }, 'Yeni Operatör Başlatma'),
      h(
        'p',
        { className: 'text-sm text-slate-400 mt-1' },
        'Partner portföyünüz altında yeni bir bahis ve casino operatörü (kiracı) oluşturun.'
      )
    ),

    error && h('div', { className: 'p-4 bg-rose-950/60 border border-rose-500/40 rounded-lg text-sm text-rose-300' }, error),

    h(
      'form',
      { onSubmit: handleSubmit, className: 'bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5 text-xs' },
      // Key & Name
      h(
        'div',
        { className: 'grid grid-cols-1 sm:grid-cols-2 gap-4' },
        h(
          'div',
          null,
          h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Operatör Kodu (Key) *'),
          h('input', {
            type: 'text',
            required: true,
            placeholder: 'örn. op-beta1',
            value: formData.key,
            onChange: (e) => handleChange('key', e.target.value),
            className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white font-mono',
          }),
          h('p', { className: 'text-[11px] text-slate-500 mt-1' }, 'Küçük harf, rakam ve tire.')
        ),
        h(
          'div',
          null,
          h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Operatör Adı *'),
          h('input', {
            type: 'text',
            required: true,
            placeholder: 'örn. Beta Gaming',
            value: formData.name,
            onChange: (e) => handleChange('name', e.target.value),
            className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white',
          })
        )
      ),

      // Domain & Owner Email
      h(
        'div',
        { className: 'grid grid-cols-1 sm:grid-cols-2 gap-4' },
        h(
          'div',
          null,
          h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Birincil Alan Adı (Domain) *'),
          h('input', {
            type: 'text',
            required: true,
            placeholder: 'örn. betagaming.example.com',
            value: formData.domain,
            onChange: (e) => handleChange('domain', e.target.value),
            className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white',
          })
        ),
        h(
          'div',
          null,
          h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Operatör Sahibi E-posta *'),
          h('input', {
            type: 'email',
            required: true,
            placeholder: 'owner@example.com',
            value: formData.ownerEmail,
            onChange: (e) => handleChange('ownerEmail', e.target.value),
            className: 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-white',
          }),
          h('p', { className: 'text-[11px] text-slate-500 mt-1' }, 'Tek kullanımlık şifre belirleme daveti bu adrese iletilecektir.')
        )
      ),

      // Legal Entity
      h(
        'div',
        { className: 'p-4 bg-slate-900/60 rounded border border-slate-700/80 space-y-3' },
        h('h4', { className: 'font-semibold text-slate-200' }, 'Tüzel Kişilik Bilgileri (İsteğe Bağlı)'),
        h(
          'div',
          { className: 'grid grid-cols-1 sm:grid-cols-2 gap-3' },
          h(
            'div',
            null,
            h('label', { className: 'block text-slate-400 mb-1' }, 'Şirket Resmi Ünvanı'),
            h('input', {
              type: 'text',
              placeholder: 'örn. Beta Gaming Ltd.',
              value: formData.legalName,
              onChange: (e) => handleChange('legalName', e.target.value),
              className: 'w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white',
            })
          ),
          h(
            'div',
            null,
            h('label', { className: 'block text-slate-400 mb-1' }, 'Sicil / Kayıt No'),
            h('input', {
              type: 'text',
              placeholder: 'örn. REG-12345',
              value: formData.registrationNo,
              onChange: (e) => handleChange('registrationNo', e.target.value),
              className: 'w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white',
            })
          )
        ),
        h(
          'div',
          null,
          h('label', { className: 'block text-slate-400 mb-1' }, 'Kayıtlı Adres'),
          h('input', {
            type: 'text',
            placeholder: 'örn. Valletta, Malta',
            value: formData.legalAddress,
            onChange: (e) => handleChange('legalAddress', e.target.value),
            className: 'w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white',
          })
        )
      ),

      // Buttons
      h(
        'div',
        { className: 'pt-4 border-t border-slate-700 flex justify-between items-center' },
        h(
          'a',
          {
            href: '/console/partner/operators',
            className: 'px-4 py-2 text-slate-300 hover:text-white bg-slate-700 rounded transition-colors',
          },
          'Vazgeç'
        ),
        h(
          'button',
          {
            type: 'submit',
            disabled: loading,
            className: 'px-5 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm transition-colors disabled:opacity-50',
          },
          loading ? 'Başlatılıyor...' : 'Operatörü Başlat ve Davet Üret'
        )
      )
    )
  );
}
