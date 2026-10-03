import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { formatMoney } from '../../utils/money.js';
import AdminPageHeader, { ADMIN_BTN, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminKpiCard, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

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
  const { t, locale } = useTranslation();
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

  // Arama client-side: /admin/promotions tüm kayıtları döner (backend sayfalama
  // desteklemiyor), kampanya sayısı operatör için onlarca ile sınırlı.
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? promotions.filter(p => [p.title, p.type, p.description].some(v => String(v || '').toLowerCase().includes(needle)))
    : promotions;

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
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupEngagement') }, { label: t('admin.promotions.title') }]}
        title={t('admin.promotions.title')}
        sub={t('admin.promotions.subtitle')}
        actions={(
          <button onClick={openCreate} className={ADMIN_BTN_PRIMARY}>
            {t('admin.promotions.newButton')}
          </button>
        )}
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">{error}</div>
      )}

      {!loading && (
        <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: t('admin.promotions.statTotal'), value: promotions.length.toLocaleString(locale) },
            { label: t('common.active'), value: promotions.filter(p => p.isActive).length.toLocaleString(locale) },
            { label: t('admin.promotions.inactive'), value: promotions.filter(p => !p.isActive).length.toLocaleString(locale) },
            { label: t('admin.promotions.statClaimed'), value: promotions.reduce((s, p) => s + (p.claimedBy?.length || 0), 0).toLocaleString(locale) },
          ].map(k => <AdminKpiCard key={k.label} label={k.label} value={k.value} />)}
        </section>
      )}

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[300px]">
          <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('admin.promotions.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
        </label>
        <button
          type="button"
          onClick={() => setSearch('')}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-bold text-text-3 transition hover:text-text-1"
        >
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">close</span>
          {t('common.reset')}
        </button>
      </div>

      {/* Referans Komisyonu Ayarları */}
      <div className="mb-6 rounded-xl border border-white/10 bg-bg-card">
        <div className="flex items-center gap-3 px-4 pt-4 sm:px-[18px]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-gold/15 text-gold">
            <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">handshake</span>
          </span>
          <h3 className="text-sm font-extrabold text-text-1">{t('admin.promotions.referralSectionTitle')}</h3>
        </div>
        <div className="p-4 sm:px-[18px] sm:pb-[18px]">
          {refLoading ? (
            <div className="text-sm text-text-3">{t('common.loading')}</div>
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
              <button onClick={saveReferral} disabled={refSaving} className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}>
                {refSaving ? t('common.saving') : t('common.save')}
              </button>
              {refMsg && <span className="text-xs font-semibold text-success">{refMsg}</span>}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-bg-card p-4 text-sm text-text-3">{t('common.loading')}</div>
      ) : (
        <AdminTable
          empty={!visible.length}
          emptyLabel={t('admin.promotions.empty')}
          columns={[
            { key: 'title', label: t('admin.promotions.columnTitle') },
            { key: 'type', label: t('admin.promotions.columnType') },
            { key: 'status', label: t('admin.promotions.columnStatus') },
            { key: 'details', label: t('admin.promotions.columnDetails') },
            { key: 'actions', label: t('admin.promotions.columnActions'), align: 'right' },
          ]}
        >
          {visible.map(p => (
            <AdminTableRow key={p._id} dimmed={!p.isActive}>
              <AdminTableCell>
                <div className="font-medium text-text-1">{p.title}</div>
              </AdminTableCell>
              <AdminTableCell>
                <span className="text-xs text-text-3 bg-white/5 px-2 py-0.5 rounded-full">
                  {TYPE_LABELS[p.type] || p.type}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <span className={`rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase ${
                  p.isActive ? 'bg-success/15 text-success' : 'bg-danger/20 text-danger'
                }`}>
                  {p.isActive ? t('common.active') : t('admin.promotions.inactive')}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <div className="text-xs text-text-3">
                  {formatMoney(p.amount)} · {t('admin.promotions.wageringLabel', { multiplier: p.wageringMultiplier ?? p.wagering })} · {t('admin.promotions.minOddsLabel', { minOdds: p.minOdds })}
                  {p.deadlineDays ? ` · ${t('admin.promotions.deadlineLabel', { days: p.deadlineDays })}` : ''} · {t('admin.promotions.claimedByLabel', { count: p.claimedBy?.length || 0 })}
                </div>
              </AdminTableCell>
              <AdminTableActionsCell>
                <RowActions
                  label={t('admin.promotions.columnActions')}
                  items={[
                    { key: 'toggle', label: p.isActive ? t('admin.promotions.deactivate') : t('admin.promotions.activate'), icon: p.isActive ? 'pause' : 'play_arrow', onClick: () => toggleActive(p) },
                    { key: 'edit', label: t('admin.promotions.edit'), icon: 'edit', onClick: () => openEdit(p) },
                    { key: 'delete', label: t('admin.promotions.delete'), icon: 'delete', tone: 'danger', onClick: () => remove(p._id) },
                  ]}
                />
              </AdminTableActionsCell>
            </AdminTableRow>
          ))}
        </AdminTable>
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
            <div className="mt-5 flex justify-end gap-2 border-t border-white/10 pt-4">
              <button onClick={() => setForm(null)} className={ADMIN_BTN}>{t('admin.promotions.cancel')}</button>
              <button onClick={save} disabled={saving || !form.title} className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
