import React, { useState } from 'react';
import apiClient from '../api/client.js';

const h = React.createElement;

export default function TenantProvision() {
  const [step, setStep] = useState(1);
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

    // Validation
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

      const res = await apiClient.post('/tenants', payload);
      setCreatedResult(res.data);
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
            h('h2', { className: 'text-xl font-bold text-white' }, 'Operatör Başarıyla Oluşturuldu!'),
            h('p', { className: 'text-xs text-slate-400 mt-0.5' }, `ID: ${createdResult.tenantId || createdResult._id} | Durum: ${createdResult.status || 'provisioning'}`)
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
              href: '/console/tenants',
              className: 'px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-700 rounded-md transition-colors',
            },
            'Operatör Listesine Dön'
          ),
          h(
            'a',
            {
              href: `/console/tenants/${createdResult.tenantId || createdResult._id}`,
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
    { className: 'max-w-3xl mx-auto space-y-6' },
    h(
      'div',
      { className: 'border-b border-slate-800 pb-4' },
      h('h1', { className: 'text-2xl font-bold text-white' }, 'Yeni Operatör Oluşturma Sihirbazı'),
      h(
        'p',
        { className: 'text-sm text-slate-400 mt-1' },
        'Platform üzerinde yeni bir kiracı (tenant), marka, alan adı ve ilk yönetici hesabını oluşturun.'
      )
    ),
    h(
      'div',
      { className: 'flex items-center justify-between px-6 py-3 bg-slate-800 rounded-lg border border-slate-700 text-xs font-medium' },
      [
        { num: 1, title: '1. Temel Bilgiler' },
        { num: 2, title: '2. Tüzel Kişilik' },
        { num: 3, title: '3. Yönetici & Onay' },
      ].map((s) =>
        h(
          'button',
          {
            key: s.num,
            type: 'button',
            onClick: () => setStep(s.num),
            className: `flex items-center gap-2 ${
              step === s.num
                ? 'text-indigo-400 font-bold'
                : step > s.num
                ? 'text-emerald-400'
                : 'text-slate-500'
            }`,
          },
          h(
            'span',
            {
              className: `w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                step === s.num
                  ? 'bg-indigo-600 text-white'
                  : step > s.num
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                  : 'bg-slate-700 text-slate-400'
              }`,
            },
            s.num
          ),
          s.title
        )
      )
    ),
    error &&
      h(
        'div',
        { className: 'p-4 bg-rose-950/60 border border-rose-500/40 rounded-lg text-sm text-rose-300' },
        error
      ),
    h(
      'form',
      { onSubmit: handleSubmit, className: 'bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-6' },
      step === 1 &&
        h(
          'div',
          { className: 'space-y-4' },
          h('h3', { className: 'text-base font-semibold text-white border-b border-slate-700 pb-2' }, 'Operatör Tanımı'),
          h(
            'div',
            null,
            h('label', { className: 'block text-xs font-medium text-slate-300 mb-1' }, 'Operatör Kodu (Key) *'),
            h('input', {
              type: 'text',
              required: true,
              value: formData.key,
              onChange: (e) => handleChange('key', e.target.value),
              placeholder: 'örn. op2, grandbet',
              className:
                'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
            }),
            h('p', { className: 'text-xs text-slate-500 mt-1' }, 'Sistem içi benzersiz kod. Küçük harf ve rakam.')
          ),
          h(
            'div',
            null,
            h('label', { className: 'block text-xs font-medium text-slate-300 mb-1' }, 'Operatör Adı *'),
            h('input', {
              type: 'text',
              required: true,
              value: formData.name,
              onChange: (e) => handleChange('name', e.target.value),
              placeholder: 'örn. Operator Two Gaming',
              className:
                'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
            })
          ),
          h(
            'div',
            null,
            h('label', { className: 'block text-xs font-medium text-slate-300 mb-1' }, 'Birincil Alan Adı (Domain) *'),
            h('input', {
              type: 'text',
              required: true,
              value: formData.domain,
              onChange: (e) => handleChange('domain', e.target.value),
              placeholder: 'örn. op2.example.com',
              className:
                'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
            }),
            h('p', { className: 'text-xs text-slate-500 mt-1' }, 'Operatörün yayın yapacağı ana web adresi (http:// olmadan).')
          )
        ),
      step === 2 &&
        h(
          'div',
          { className: 'space-y-4' },
          h('h3', { className: 'text-base font-semibold text-white border-b border-slate-700 pb-2' }, 'Tüzel Kişilik ve Lisans'),
          h(
            'div',
            null,
            h('label', { className: 'block text-xs font-medium text-slate-300 mb-1' }, 'Şirket Resmi Ünvanı'),
            h('input', {
              type: 'text',
              value: formData.legalName,
              onChange: (e) => handleChange('legalName', e.target.value),
              placeholder: 'örn. Operator Two Ltd.',
              className:
                'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
            })
          ),
          h(
            'div',
            null,
            h('label', { className: 'block text-xs font-medium text-slate-300 mb-1' }, 'Kayıt / Sicil Numarası'),
            h('input', {
              type: 'text',
              value: formData.registrationNo,
              onChange: (e) => handleChange('registrationNo', e.target.value),
              placeholder: 'örn. C-99123',
              className:
                'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
            })
          ),
          h(
            'div',
            null,
            h('label', { className: 'block text-xs font-medium text-slate-300 mb-1' }, 'Kayıtlı Adres'),
            h('textarea', {
              rows: 2,
              value: formData.legalAddress,
              onChange: (e) => handleChange('legalAddress', e.target.value),
              placeholder: 'örn. Level 3, Business Tower, Valletta, Malta',
              className:
                'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
            })
          )
        ),
      step === 3 &&
        h(
          'div',
          { className: 'space-y-4' },
          h('h3', { className: 'text-base font-semibold text-white border-b border-slate-700 pb-2' }, 'Yönetici Hesabı ve Onay'),
          h(
            'div',
            null,
            h('label', { className: 'block text-xs font-medium text-slate-300 mb-1' }, 'İlk Operatör Sahibi E-posta Adresi *'),
            h('input', {
              type: 'email',
              required: true,
              value: formData.ownerEmail,
              onChange: (e) => handleChange('ownerEmail', e.target.value),
              placeholder: 'owner@op2.example.com',
              className:
                'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
            }),
            h(
              'p',
              { className: 'text-xs text-slate-400 mt-1' },
              'Bu e-postaya tek kullanımlık bir davet bağlantısı üretilecektir.'
            )
          ),
          h(
            'div',
            { className: 'p-4 bg-slate-900/80 border border-slate-700 rounded-lg text-xs space-y-2' },
            h('h4', { className: 'font-semibold text-white' }, 'Özet:'),
            h('p', { className: 'text-slate-300' }, `Operatör: ${formData.name || '-'} (${formData.key || '-'})`),
            h('p', { className: 'text-slate-300' }, `Alan Adı: ${formData.domain || '-'}`),
            h('p', { className: 'text-slate-300' }, `Yönetici: ${formData.ownerEmail || '-'}`),
            h(
              'p',
              { className: 'text-amber-400 pt-1 border-t border-slate-800' },
              'Yeni operatör "provisioning" (hazırlanıyor) durumunda başlatılacak ve canlı trafik kabul etmeyecektir.'
            )
          )
        ),
      h(
        'div',
        { className: 'pt-4 border-t border-slate-700 flex justify-between' },
        step > 1
          ? h(
              'button',
              {
                type: 'button',
                onClick: () => setStep(step - 1),
                className: 'px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-700 rounded-md transition-colors',
              },
              '← Geri'
            )
          : h('div', null),
        step < 3
          ? h(
              'button',
              {
                type: 'button',
                onClick: () => setStep(step + 1),
                className: 'px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors',
              },
              'İleri →'
            )
          : h(
              'button',
              {
                type: 'submit',
                disabled: loading,
                className: 'px-5 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-sm transition-colors disabled:opacity-50',
              },
              loading ? 'Oluşturuluyor...' : 'Operatörü Başlat ve Kur'
            )
      )
    )
  );
}
