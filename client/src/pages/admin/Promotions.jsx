import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';

const EMPTY_FORM = {
  type: 'welcome', title: '', description: '', amount: 0,
  minOdds: 1.5, wageringMultiplier: 35, deadlineDays: 30, isActive: true,
};

/**
 * Kampanyalar/promosyonlar (Promotion modeli) — admin CRUD. Öncesinde tek
 * yaratım yolu tek seferlik bir script'ti (scripts/add-deneme-bonusu-promotion.mjs),
 * panelden yönetilebilir bir yüzey yoktu. client/src/pages/Promotions.jsx bu
 * kayıtları kullanıcıya listeler (yalnızca isActive:true olanları) — burada
 * pasif kampanyalar da görünür, admin yeniden aktive edebilir.
 *
 * Not: "Slider Düzenleme Aracı" (/admin/pages) ayrı bir şey — anasayfadaki kampanya
 * BANNER'larının (başlık/açıklama/buton metni, görsel sabit) sırasını/görünürlüğünü
 * yönetir. Burası ise gerçek bonus KAYITLARINI (tutar, wagering, vade) yönetir.
 */
export default function AdminPromotions() {
  const { t } = useTranslation();
  const TYPE_LABELS = {
    welcome: t('admin.promotions.types.welcome'),
    freeBet: t('admin.promotions.types.freeBet'),
    reload: t('admin.promotions.types.reload'),
    trial: t('admin.promotions.types.trial'),
  };
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  // Referans komisyonu ayarları
  const [refEnabled, setRefEnabled] = useState(true);
  const [refRate, setRefRate] = useState(10);
  const [refLoading, setRefLoading] = useState(true);
  const [refSaving, setRefSaving] = useState(false);
  const [refMsg, setRefMsg] = useState('');

  function load() {
    setError('');
    api.get('/admin/promotions')
      .then(r => setPromotions(r.data.promotions))
      .catch(() => setError(t('admin.promotions.loadError')))
      .finally(() => setLoading(false));
  }

  function loadReferral() {
    api.get('/admin/referral/settings')
      .then(r => { setRefEnabled(r.data.enabled); setRefRate(r.data.commissionRate); })
      .catch(() => {})
      .finally(() => setRefLoading(false));
  }

  useEffect(() => { load(); loadReferral(); }, []);

  function openCreate() {
    setForm({ ...EMPTY_FORM });
  }

  function openEdit(p) {
    setForm({
      id: p._id, type: p.type, title: p.title, description: p.description || '',
      amount: p.amount, minOdds: p.minOdds ?? 1.5, wageringMultiplier: p.wageringMultiplier ?? p.wagering ?? 35,
      deadlineDays: p.deadlineDays ?? 30, isActive: p.isActive,
    });
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      await api.post('/admin/promotions', {
        ...(form.id ? { id: form.id } : {}),
        type: form.type,
        title: form.title,
        description: form.description,
        amount: Number(form.amount),
        minOdds: Number(form.minOdds),
        wageringMultiplier: Number(form.wageringMultiplier),
        deadlineDays: Number(form.deadlineDays),
        isActive: !!form.isActive,
      });
      setForm(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.promotions.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p) {
    setError('');
    try {
      await api.post('/admin/promotions', { id: p._id, type: p.type, title: p.title, amount: p.amount, isActive: !p.isActive });
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.promotions.updateError'));
    }
  }

  async function remove(id) {
    setError('');
    try {
      await api.delete(`/admin/promotions/${id}`);
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.promotions.deleteError'));
    }
  }

  async function saveReferral() {
    setRefSaving(true);
    setRefMsg('');
    try {
      await api.put('/admin/referral/settings', { enabled: refEnabled, commissionRate: Number(refRate) });
      setRefMsg(t('admin.promotions.referralSaved'));
      setTimeout(() => setRefMsg(''), 2000);
    } catch (e) {
      setRefMsg(e.response?.data?.error?.message || t('admin.promotions.referralSaveError'));
    } finally {
      setRefSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-text-1">🎁 {t('admin.promotions.title')}</h1>
        <button onClick={openCreate} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">
          {t('admin.promotions.newButton')}
        </button>
      </div>
      <p className="text-text-3 text-sm mb-6">
        {t('admin.promotions.subtitle')}
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
      )}

      {/* Referans Komisyonu Ayarları */}
      <div className="bg-bg-card border border-white/10 rounded-xl p-5 mb-6">
        <h2 className="font-semibold text-text-1 mb-4">🤝 {t('admin.promotions.referralSectionTitle')}</h2>
        {refLoading ? (
          <div className="text-text-3 text-sm">{t('common.loading')}</div>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-text-2">
              <input type="checkbox" checked={refEnabled} onChange={e => setRefEnabled(e.target.checked)}
                className="accent-primary" />
              {t('admin.promotions.referralEnabled')}
            </label>
            <label className="text-xs text-text-3">
              {t('admin.promotions.referralRateLabel')}
              <input type="number" min="0" max="100" step="0.5" value={refRate}
                onChange={e => setRefRate(e.target.value)}
                className="mt-1 w-20 h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
            </label>
            <button onClick={saveReferral} disabled={refSaving}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40">
              {refSaving ? t('common.saving') : t('common.save')}
            </button>
            {refMsg && <span className="text-xs text-green-400">{refMsg}</span>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-text-3">{t('common.loading')}</div>
      ) : (
        <div className="space-y-3">
          {promotions.map(p => (
            <div key={p._id} className={`bg-bg-card border rounded-xl p-4 flex items-center justify-between gap-3 ${p.isActive ? 'border-white/10' : 'border-white/5 opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-text-1 flex items-center gap-2 flex-wrap">
                  {p.title}
                  <span className="text-xs text-text-3 font-normal bg-white/5 px-2 py-0.5 rounded-full">{TYPE_LABELS[p.type] || p.type}</span>
                  {!p.isActive && <span className="text-xs text-red-300 font-normal">{t('admin.promotions.inactive')}</span>}
                </div>
                <div className="text-xs text-text-3 mt-0.5">
                  ₺{p.amount} · {t('admin.promotions.wageringLabel', { multiplier: p.wageringMultiplier ?? p.wagering })} · {t('admin.promotions.minOddsLabel', { minOdds: p.minOdds })}
                  {p.deadlineDays ? ` · ${t('admin.promotions.deadlineLabel', { days: p.deadlineDays })}` : ''} · {t('admin.promotions.claimedByLabel', { count: p.claimedBy?.length || 0 })}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => toggleActive(p)} className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-text-2 hover:text-text-1">
                  {p.isActive ? t('admin.promotions.deactivate') : t('admin.promotions.activate')}
                </button>
                <button onClick={() => openEdit(p)} className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-text-2 hover:text-text-1">
                  {t('admin.promotions.edit')}
                </button>
                <button onClick={() => remove(p._id)} className="px-3 py-1.5 rounded-lg text-xs border border-red-500/20 text-red-300 hover:bg-red-500/10">
                  {t('admin.promotions.delete')}
                </button>
              </div>
            </div>
          ))}
          {!promotions.length && <div className="text-center text-text-3 py-12">{t('admin.promotions.empty')}</div>}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setForm(null)}>
          <div className="bg-bg-card border border-white/10 rounded-xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-text-1 mb-4">{form.id ? t('admin.promotions.editTitle') : t('admin.promotions.newTitle')}</h2>
            <div className="space-y-3 mb-4">
              <label className="text-xs text-text-3 block">
                {t('admin.promotions.typeLabel')}
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1">
                  {Object.entries(TYPE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <label className="text-xs text-text-3 block">
                {t('admin.promotions.titleLabel')}
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3 block">
                {t('admin.promotions.descLabel')}
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="mt-1 w-full rounded-lg bg-bg-base border border-white/10 px-3 py-2 text-sm text-text-1" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-text-3">
                  {t('admin.promotions.amountLabel')}
                  <input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
                </label>
                <label className="text-xs text-text-3">
                  {t('admin.promotions.minOddsFieldLabel')}
                  <input type="number" min="1" step="0.1" value={form.minOdds} onChange={e => setForm(f => ({ ...f, minOdds: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
                </label>
                <label className="text-xs text-text-3">
                  {t('admin.promotions.wageringFieldLabel')}
                  <input type="number" min="0" value={form.wageringMultiplier} onChange={e => setForm(f => ({ ...f, wageringMultiplier: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
                </label>
                <label className="text-xs text-text-3">
                  {t('admin.promotions.deadlineFieldLabel')}
                  <input type="number" min="0" value={form.deadlineDays} onChange={e => setForm(f => ({ ...f, deadlineDays: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-text-3">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                  className="accent-primary" />
                {t('admin.promotions.activeCheckbox')}
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={saving || !form.title} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40">
                {saving ? t('common.saving') : t('common.save')}
              </button>
              <button onClick={() => setForm(null)} className="px-4 py-2 rounded-lg border border-white/10 text-text-2 text-sm">{t('admin.promotions.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
