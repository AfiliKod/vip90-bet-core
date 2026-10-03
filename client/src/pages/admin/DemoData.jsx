// client/src/pages/admin/DemoData.jsx
import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { useToastStore } from '../../store/toastStore';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableEmpty, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

// Kategori id'leri sabit; ikonlar Faz 9'da Material Symbols glyph adlarına çevrildi
// (adminNav.config.js'teki ilgili menü öğeleriyle aynı görsel dil).
const CATEGORY_META = {
  users:    { icon: 'group', labelKey: 'admin.demoData.category.users', descKey: 'admin.demoData.category.usersDesc' },
  sports:   { icon: 'sports_soccer', labelKey: 'admin.demoData.category.sports', descKey: 'admin.demoData.category.sportsDesc' },
  casino:   { icon: 'casino', labelKey: 'admin.demoData.category.casino', descKey: 'admin.demoData.category.casinoDesc' },
  kyc:      { icon: 'badge', labelKey: 'admin.demoData.category.kyc', descKey: 'admin.demoData.category.kycDesc' },
  risk:     { icon: 'shield', labelKey: 'admin.demoData.category.risk', descKey: 'admin.demoData.category.riskDesc' },
  tickets:  { icon: 'confirmation_number', labelKey: 'admin.demoData.category.tickets', descKey: 'admin.demoData.category.ticketsDesc' },
  agents:   { icon: 'handshake', labelKey: 'admin.demoData.category.agents', descKey: 'admin.demoData.category.agentsDesc' },
  payments: { icon: 'payments', labelKey: 'admin.demoData.category.payments', descKey: 'admin.demoData.category.paymentsDesc' },
};
const CATEGORY_IDS = Object.keys(CATEGORY_META);

// Kullanıcı sayısına göre diğer kategorilerin ortalama/makul oranları — admin
// tek bir sayı girer, geri kalanı burada otomatik türetilir (spec: "her modül
// için ayrı ayrı rakam girmek zorunda kalmamalı").
const CATEGORY_RATIOS = {
  users: 1,
  sports: 3,
  casino: 5,
  kyc: 0.4,
  risk: 0.15,
  tickets: 0.3,
  agents: 0.05,
  payments: 0.6,
};

function deriveCounts(masterUsers) {
  return Object.fromEntries(
    CATEGORY_IDS.map(id => [id, id === 'users' ? masterUsers : Math.max(1, Math.round(masterUsers * CATEGORY_RATIOS[id]))]),
  );
}

function formatCount(n, locale) {
  return new Intl.NumberFormat(locale).format(n ?? 0);
}

function categoryLabel(t, id) {
  const key = CATEGORY_META[id]?.labelKey;
  return key ? t(key) : id;
}

function categoryDescription(t, id) {
  const key = CATEGORY_META[id]?.descKey;
  return key ? t(key) : '';
}

export default function AdminDemoData() {
  const { t, locale } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [masterUsers, setMasterUsers] = useState(100);
  const [counts, setCounts] = useState(() => deriveCounts(100));
  const [busyCategory, setBusyCategory] = useState(null);
  const [tickInterval, setTickInterval] = useState(2);

  // Master sayı değişince diğer tüm kategoriler orana göre otomatik yeniden hesaplanır.
  // Tek tek kategoriler yine de aşağıdaki input'lardan elle düzeltilebilir.
  useEffect(() => { setCounts(deriveCounts(masterUsers)); }, [masterUsers]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/admin/demo-data/status')
      .then(r => { setStatus(r.data); setTickInterval(r.data.live?.tickIntervalMinutes || 2); })
      .catch(() => { setError(t('common.error')); addToast(t('common.error'), 'error'); })
      .finally(() => setLoading(false));
  }, [addToast, t]);

  useEffect(() => { load(); }, [load]);

  const loadCategory = async (category) => {
    setBusyCategory(category);
    try {
      const { data } = await api.post(`/admin/demo-data/${category}/load`, { count: counts[category] });
      addToast(t('admin.demoData.loadedCount', { count: formatCount(data.created, locale) }), 'success');
      load();
    } catch (e) {
      const message = e.response?.data?.error || t('common.error');
      setError(message);
      addToast(message, 'error');
    } finally {
      setBusyCategory(null);
    }
  };

  // Kullanıcılar diğer tüm kategorilerin bağımlı olduğu havuz — sırayla önce o, sonra kalanlar.
  const loadAll = async () => {
    setBusyCategory('all-load');
    try {
      for (const id of CATEGORY_IDS) {
        await api.post(`/admin/demo-data/${id}/load`, { count: counts[id] });
      }
      addToast(t('admin.demoData.loadedAll'), 'success');
      load();
    } catch (e) {
      const message = e.response?.data?.error || t('common.error');
      setError(message);
      addToast(message, 'error');
    } finally {
      setBusyCategory(null);
    }
  };

  const clearCategory = async (category) => {
    if (!window.confirm(t('admin.demoData.confirmClear', { category: categoryLabel(t, category) }))) return;
    setBusyCategory(category);
    try {
      await api.post(`/admin/demo-data/${category}/clear`);
      addToast(t('admin.demoData.cleared'), 'info');
      load();
    } catch (e) {
      const message = e.response?.data?.error || t('common.error');
      setError(message);
      addToast(message, 'error');
    } finally {
      setBusyCategory(null);
    }
  };

  // Spec §Admin UI: "Tümünü Temizle" — users.clear() cascade'i tüm bağımlı kategorileri temizler.
  const clearAll = async () => {
    if (!window.confirm(t('admin.demoData.confirmClearAll'))) return;
    setBusyCategory('all-clear');
    try {
      await api.post('/admin/demo-data/users/clear');
      addToast(t('admin.demoData.clearedAll'), 'info');
      load();
    } catch (e) {
      const message = e.response?.data?.error || t('common.error');
      setError(message);
      addToast(message, 'error');
    } finally {
      setBusyCategory(null);
    }
  };

  const totalSeeds = status
    ? Object.values(status.categories || {}).reduce((sum, c) => sum + (c?.count || 0), 0)
    : 0;

  const toggleLive = async () => {
    try {
      if (status?.live?.enabled) {
        await api.post('/admin/demo-data/live/stop');
        addToast(t('admin.demoData.liveStopped'), 'info');
      } else {
        await api.post('/admin/demo-data/live/start', { tickIntervalMinutes: tickInterval });
        addToast(t('admin.demoData.liveStarted'), 'success');
      }
      load();
    } catch (e) {
      const message = e.response?.data?.error || t('common.error');
      setError(message);
      addToast(message, 'error');
    }
  };

  // Spec §Admin UI: canlı başlatma yalnızca users kategorisinde ≥1 seed kullanıcı varken etkin.
  const seedUserCount = status?.categories?.users?.count ?? 0;
  const liveEnabled = !!status?.live?.enabled;
  const startDisabled = !liveEnabled && seedUserCount === 0;

  if (loading && !status) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
        <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
          <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">progress_activity</span>
          <div className="mt-2 text-sm text-text-3">{t('common.loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 space-y-5">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupDemoSimulation') }, { label: t('admin.demoData.title') }]}
        title={t('admin.demoData.title')}
        sub={t('admin.demoData.subtitle')}
      />

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/15 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Üst panel: toplam özet + tek sayıdan tüm kategorileri oluştur + tam temizlik */}
      <section className="rounded-xl border border-white/10 bg-bg-card p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">analytics</span>
          </span>
          <h3 className="text-sm font-extrabold text-text-1">{t('admin.demoData.title')}</h3>
          <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">
            {formatCount(totalSeeds, locale)}
          </span>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.demoData.summaryTotal')}</div>
            <div className="mt-2 font-mono text-[22px] font-bold tabular-nums tracking-tight text-text-1">{formatCount(totalSeeds, locale)}</div>
            <div className="mt-1 text-xs text-text-3">{t('admin.demoData.summaryHint')}</div>
          </div>
          <button
            onClick={clearAll}
            disabled={busyCategory === 'all-clear' || totalSeeds === 0}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2.5 text-xs font-bold text-danger transition hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">delete_sweep</span>
            {busyCategory === 'all-clear' ? t('admin.demoData.clearing') : t('admin.demoData.clearAll')}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">
            {t('admin.demoData.masterCountLabel')}
            <input
              type="number" min="1" max="10000" value={masterUsers}
              onChange={e => setMasterUsers(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1.5 w-28 rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm tabular-nums text-text-1 focus:border-white/25 focus:outline-none"
            />
          </label>
          <button
            onClick={loadAll}
            disabled={busyCategory === 'all-load'}
            className={`${ADMIN_BTN_PRIMARY} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">auto_awesome</span>
            {busyCategory === 'all-load' ? t('admin.demoData.loadingAll') : t('admin.demoData.generateAll')}
          </button>
          <p className="min-w-[16rem] flex-1 text-xs text-text-3">
            {t('admin.demoData.autoProportionHint')}
          </p>
        </div>
      </section>

      {/* Canlı simülasyon */}
      <section className="rounded-xl border border-white/10 bg-bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="flex-1">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">sensors</span>
              </span>
              <h3 className="text-sm font-extrabold text-text-1">{t('admin.demoData.liveSimulation')}</h3>
              <span className={`rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase ${liveEnabled ? 'bg-success/15 text-success' : 'bg-white/10 text-text-2'}`}>
                {liveEnabled ? t('admin.demoData.liveActive') : t('admin.demoData.liveInactive')}
              </span>
            </div>
            <p className="text-sm text-text-2 mt-1.5 max-w-xl">
              {t('admin.demoData.liveSimulationHint')}
            </p>
            {startDisabled && (
              <p className="mt-2 flex items-center gap-1 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">warning</span> {t('admin.demoData.startNeedsUsers')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <label className="mb-1.5 flex flex-col items-center text-[11px] font-bold uppercase tracking-wide text-text-3">
              {t('admin.demoData.tickIntervalLabel')}
              <input
                type="number" min="1" max="60" value={tickInterval}
                onChange={e => setTickInterval(Number(e.target.value))}
                className="mt-1.5 w-16 rounded-lg border border-white/10 bg-bg-deep px-2 py-1.5 text-center text-sm tabular-nums text-text-1 focus:border-white/25 focus:outline-none"
                disabled={liveEnabled}
              />
            </label>
            <button
              onClick={toggleLive}
              disabled={startDisabled}
              className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                liveEnabled
                  ? 'border-danger/25 bg-danger/10 text-danger hover:bg-danger/20'
                  : 'border-transparent bg-primary text-black hover:brightness-110'
              }`}
            >
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">{liveEnabled ? 'stop_circle' : 'play_circle'}</span>
              {liveEnabled ? t('admin.demoData.stop') : t('admin.demoData.start')}
            </button>
          </div>
        </div>
      </section>

      {/* Kategoriler — sayılar üstteki tek girişten otomatik türetilir, istenirse elle düzeltilebilir */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">category</span>
          </span>
          <h3 className="text-sm font-extrabold text-text-1">{t('admin.demoData.categoriesHeading')}</h3>
          <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">
            {CATEGORY_IDS.length.toLocaleString(locale)}
          </span>
        </div>
        <AdminTable
          columns={[
            { key: 'category', label: t('admin.demoData.columnCategory') },
            { key: 'existing', label: t('admin.demoData.columnExisting') },
            { key: 'count', label: t('admin.demoData.columnCount') },
            { key: 'actions', label: t('admin.demoData.columnActions'), align: 'right' },
          ]}
        >
          {CATEGORY_IDS.map(id => {
            const count = status?.categories?.[id]?.count ?? 0;
            const busy = busyCategory === id;
            return (
              <AdminTableRow key={id}>
                <AdminTableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">{CATEGORY_META[id].icon}</span>
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium text-text-1">{categoryLabel(t, id)}</div>
                      <div className="mt-0.5 line-clamp-1 text-xs text-text-3">
                        {categoryDescription(t, id)}
                      </div>
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell className="text-text-1 tabular-nums font-semibold">
                  {formatCount(count, locale)}
                </AdminTableCell>
                <AdminTableCell>
                  <input
                    type="number" min="1" max="10000" value={counts[id]}
                    onChange={e => setCounts(c => ({ ...c, [id]: Math.max(1, Number(e.target.value) || 1) }))}
                    aria-label={t('admin.demoData.countInputLabel')}
                    className="w-24 rounded-lg border border-white/10 bg-bg-deep px-2 py-1.5 text-center text-sm tabular-nums text-text-1 focus:border-white/25 focus:outline-none"
                  />
                </AdminTableCell>
                <AdminTableActionsCell>
                  <RowActions
                    label={t('admin.demoData.columnActions')}
                    items={[
                      { key: 'load', label: busy ? t('admin.demoData.loading') : t('admin.demoData.load'), icon: 'download', disabled: busy, onClick: () => loadCategory(id) },
                      { key: 'clear', label: t('admin.demoData.clear'), icon: 'delete', tone: 'danger', disabled: busy || count === 0, onClick: () => clearCategory(id) },
                    ]}
                  />
                </AdminTableActionsCell>
              </AdminTableRow>
            );
          })}
          {!CATEGORY_IDS.length && (
            <AdminTableEmpty colSpan={4}>{t('admin.demoData.categoriesHeading')}</AdminTableEmpty>
          )}
        </AdminTable>
      </div>
    </div>
  );
}
