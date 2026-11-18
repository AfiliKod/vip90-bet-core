import React, { useEffect, useState } from 'react';
import { billingApi } from '../../api/client.js';

const h = React.createElement;

const initialForm = {
  tenantId: '',
  provider: 'igames',
  rateOfGgr: '',
  minimumMonthlyFee: '0',
  currency: 'TRY',
  validFrom: new Date().toISOString().slice(0, 10),
  note: '',
};

function scheduleTenantLabel(schedule) {
  return schedule.tenantId ? `${schedule.tenantId.name} (${schedule.tenantId.key})` : 'Platform varsayılanı';
}

export default function ProviderFeeSchedules() {
  const [schedules, setSchedules] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const scheduleResponse = await billingApi.listProviderFeeSchedules();
      setSchedules(scheduleResponse.schedules || []);
      setTenants(scheduleResponse.tenants || []);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Sağlayıcı ücret takvimleri alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await billingApi.createProviderFeeSchedule({
        ...form,
        tenantId: form.tenantId || null,
        rateOfGgr: Number(form.rateOfGgr),
        minimumMonthlyFee: Number(form.minimumMonthlyFee || 0),
        validFrom: new Date(`${form.validFrom}T00:00:00.000Z`).toISOString(),
      });
      setForm(initialForm);
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Sağlayıcı ücret takvimi kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return h('div', { className: 'space-y-6' },
    h('div', { className: 'flex items-center justify-between border-b border-slate-800 pb-4' },
      h('div', null,
        h('h1', { className: 'text-2xl font-bold text-white' }, 'Sağlayıcı Ücret Takvimleri'),
        h('p', { className: 'text-sm text-slate-400 mt-1' }, 'Casino sağlayıcılarının GGR yüzdeli sözleşme değişikliklerini yönetin.')
      ),
      h('a', { href: '/console/billing', className: 'text-sm text-indigo-400 hover:text-indigo-300' }, 'Faturalandırmaya dön')
    ),
    error && h('div', { className: 'p-3 rounded bg-rose-950/60 border border-rose-800 text-rose-200 text-sm' }, error),
    h('form', { onSubmit: submit, className: 'grid grid-cols-1 md:grid-cols-3 gap-4 p-5 rounded-lg bg-slate-900 border border-slate-800' },
      h('div', null, h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'Operatör'), h('select', { value: form.tenantId, onChange: (e) => update('tenantId', e.target.value), className: 'w-full px-3 py-2 bg-slate-800 text-white rounded border border-slate-700' }, h('option', { value: '' }, 'Platform varsayılanı'), tenants.map((tenant) => h('option', { key: tenant._id, value: tenant._id }, `${tenant.name} (${tenant.key})`)))),
      h('div', null, h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'Sağlayıcı anahtarı *'), h('input', { required: true, value: form.provider, onChange: (e) => update('provider', e.target.value), className: 'w-full px-3 py-2 bg-slate-800 text-white rounded border border-slate-700' })),
      h('div', null, h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'GGR oranı *'), h('input', { type: 'number', required: true, min: 0, max: 1, step: '0.0001', value: form.rateOfGgr, onChange: (e) => update('rateOfGgr', e.target.value), placeholder: '0.12', className: 'w-full px-3 py-2 bg-slate-800 text-white rounded border border-slate-700' })),
      h('div', null, h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'Geçerlilik başlangıcı *'), h('input', { type: 'date', required: true, value: form.validFrom, onChange: (e) => update('validFrom', e.target.value), className: 'w-full px-3 py-2 bg-slate-800 text-white rounded border border-slate-700' })),
      h('div', null, h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'Para birimi *'), h('select', { value: form.currency, onChange: (e) => update('currency', e.target.value), className: 'w-full px-3 py-2 bg-slate-800 text-white rounded border border-slate-700' }, ['TRY', 'EUR', 'USD'].map((currency) => h('option', { key: currency, value: currency }, currency)))),
      h('div', null, h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'Bilgi amaçlı aylık asgari ücret'), h('input', { type: 'number', min: 0, step: '0.01', value: form.minimumMonthlyFee, onChange: (e) => update('minimumMonthlyFee', e.target.value), className: 'w-full px-3 py-2 bg-slate-800 text-white rounded border border-slate-700' })),
      h('div', { className: 'md:col-span-2' }, h('label', { className: 'block text-xs text-slate-400 mb-1' }, 'Not'), h('input', { value: form.note, onChange: (e) => update('note', e.target.value), className: 'w-full px-3 py-2 bg-slate-800 text-white rounded border border-slate-700' })),
      h('div', { className: 'flex items-end' }, h('button', { type: 'submit', disabled: saving, className: 'w-full px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium' }, saving ? 'Kaydediliyor…' : 'Yeni takvimi kaydet'))
    ),
    h('p', { className: 'text-xs text-slate-500' }, 'Yeni takvim aynı operatör ve sağlayıcı için açık sözleşmeyi başlangıç tarihinde kapatır. Aylık asgari ücret günlük hesaplamada uygulanmaz.'),
    loading ? h('p', { className: 'text-slate-400' }, 'Yükleniyor…') : h('div', { className: 'overflow-x-auto rounded-lg border border-slate-800' },
      h('table', { className: 'w-full text-sm' },
        h('thead', { className: 'bg-slate-900 text-slate-400 text-left' }, h('tr', null, ...['Operatör', 'Sağlayıcı', 'GGR oranı', 'Para birimi', 'Başlangıç', 'Bitiş', 'Not'].map((label) => h('th', { key: label, className: 'px-4 py-3 font-medium' }, label)))),
        h('tbody', { className: 'divide-y divide-slate-800 bg-slate-950/40' }, schedules.map((schedule) => h('tr', { key: schedule._id, className: 'text-slate-200' },
          h('td', { className: 'px-4 py-3' }, scheduleTenantLabel(schedule)), h('td', { className: 'px-4 py-3' }, schedule.provider), h('td', { className: 'px-4 py-3' }, `${(schedule.rateOfGgr * 100).toFixed(2)}%`), h('td', { className: 'px-4 py-3' }, schedule.currency), h('td', { className: 'px-4 py-3' }, new Date(schedule.validFrom).toLocaleDateString('tr-TR')), h('td', { className: 'px-4 py-3' }, schedule.validTo ? new Date(schedule.validTo).toLocaleDateString('tr-TR') : 'Açık'), h('td', { className: 'px-4 py-3 text-slate-400' }, schedule.note || '-'))))
      )
    )
  );
}
