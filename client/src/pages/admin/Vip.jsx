import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import AdminPageHeader, { ADMIN_BTN, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminKpiCard, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

/**
 * O1 — VIP/seviye programı.
 *
 * services/vip.js zaten tam yazılmıştı (awardXp, getVipStatus, level CRUD)
 * — eksik olan admin arayüzüydü. XP artık her casino turunda (CasinoRound
 * post-save hook) ve her sonuçlanan spor bahsinde (settlement.js) veriliyor.
 */
export default function AdminVip() {
  const { t, locale } = useTranslation();
  const { formatPercent } = useFormatters();
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);

  function load() {
    setError('');
    api.get('/admin/vip-levels')
      .then(r => setLevels(r.data.levels))
      .catch(() => setError(t('admin.vip.loadError')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function openEdit(level) {
    setForm({ ...level });
  }

  function openCreate() {
    const nextLevel = (levels.reduce((max, l) => Math.max(max, l.level), 0)) + 1;
    setForm({
      level: nextLevel, name: '', xpRequired: 0, cashbackPercent: 0,
      rewardAmount: 0, rewardType: 'balance', color: '#6b7280', icon: 'star',
    });
  }

  async function save() {
    setError('');
    try {
      await api.post('/admin/vip-levels', {
        level: Number(form.level),
        name: form.name,
        xpRequired: Number(form.xpRequired),
        cashbackPercent: Number(form.cashbackPercent),
        rewardAmount: Number(form.rewardAmount),
        rewardType: form.rewardType,
        color: form.color,
        icon: form.icon,
      });
      setForm(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.vip.saveError'));
    }
  }

  async function remove(level) {
    setError('');
    try {
      await api.delete(`/admin/vip-levels/${level}`);
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.vip.deleteError'));
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupEngagement') }, { label: t('admin.vip.title') }]}
        title={t('admin.vip.title')}
        sub={t('admin.vip.subtitle')}
        actions={(
          <button onClick={openCreate} className={ADMIN_BTN_PRIMARY}>
            {t('admin.vip.newLevel')}
          </button>
        )}
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-bg-card p-4 text-sm text-text-3">{t('admin.vip.loading')}</div>
      ) : (
        <>
          {/* Mini KPI */}
          <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
            {[
              { label: t('admin.vip.statLevels'), value: levels.length.toLocaleString(locale) },
              {
                label: t('admin.vip.statTopXp'),
                value: levels.length ? Math.max(...levels.map(l => l.xpRequired)).toLocaleString(locale) : '0',
              },
              {
                label: t('admin.vip.statAvgCashback'),
                value: levels.length
                  ? formatPercent(levels.reduce((s, l) => s + l.cashbackPercent, 0) / levels.length / 100)
                  : formatPercent(0),
              },
            ].map(k => <AdminKpiCard key={k.label} label={k.label} value={k.value} />)}
          </section>

          <AdminTable
            empty={levels.length === 0}
            emptyLabel={t('admin.vip.empty')}
            columns={[
              { key: 'level', label: t('admin.vip.columnLevel') },
              { key: 'xp', label: t('admin.vip.columnXp') },
              { key: 'cashback', label: t('admin.vip.columnCashback'), align: 'right' },
              { key: 'reward', label: t('admin.vip.columnReward'), align: 'right' },
              { key: 'actions', label: t('admin.vip.columnActions'), align: 'right' },
            ]}
          >
            {levels.map(l => {
              const maxXp = Math.max(...levels.map(x => x.xpRequired), 1);
              return (
                <AdminTableRow key={l._id} className="cursor-pointer" onClick={() => openEdit(l)}>
                  <AdminTableCell>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10"
                        style={{ background: `${l.color}22`, color: l.color }}
                      >
                        {/^[a-z][a-z0-9_]*$/.test(l.icon || '') ? (
                          <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">{l.icon}</span>
                        ) : (
                          <span aria-hidden="true">{l.icon || '★'}</span>
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-bold text-text-1">{l.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-text-3">{t('admin.vip.levelLabel', { n: l.level })}</div>
                      </div>
                    </div>
                  </AdminTableCell>
                  <AdminTableCell>
                    {/* XP merdiveni (bar = en yüksek eşiğe göre) */}
                    <div className="w-40 max-w-full">
                      <div className="font-mono text-xs font-bold text-text-1">{l.xpRequired.toLocaleString(locale)}</div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <i
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(4, Math.round((l.xpRequired / maxXp) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </AdminTableCell>
                  <AdminTableCell align="right">
                    <span className="font-mono text-[13px] font-bold tabular-nums text-text-1">{formatPercent(l.cashbackPercent / 100)}</span>
                  </AdminTableCell>
                  <AdminTableCell align="right">
                    <span className="font-mono text-[13px] font-bold tabular-nums text-text-1">
                      {t('admin.vip.reward', { amount: l.rewardAmount, type: l.rewardType })}
                    </span>
                  </AdminTableCell>
                  <AdminTableActionsCell>
                    <RowActions
                      label={t('admin.vip.columnActions')}
                      items={[
                        { key: 'edit', label: t('common.edit'), icon: 'edit', onClick: () => openEdit(l) },
                        { key: 'delete', label: t('common.delete'), icon: 'delete', tone: 'danger', onClick: () => remove(l.level) },
                      ]}
                    />
                  </AdminTableActionsCell>
                </AdminTableRow>
              );
            })}
          </AdminTable>
        </>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setForm(null)}>
          <div className="bg-bg-card border border-white/10 rounded-xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold mb-4">{t('admin.vip.editLevel')}</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="text-xs text-text-3">
                {t('admin.vip.levelField')}
                <input type="number" min="1" value={form.level}
                  onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.vip.nameField')}
                <input value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.vip.xpField')}
                <input type="number" min="0" value={form.xpRequired}
                  onChange={e => setForm(f => ({ ...f, xpRequired: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.vip.cashbackField')}
                <input type="number" min="0" max="100" step="0.5" value={form.cashbackPercent}
                  onChange={e => setForm(f => ({ ...f, cashbackPercent: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.vip.rewardAmountField')}
                <input type="number" min="0" value={form.rewardAmount}
                  onChange={e => setForm(f => ({ ...f, rewardAmount: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
              <label className="text-xs text-text-3">
                {t('admin.vip.iconField')}
                <input value={form.icon}
                  onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setForm(null)} className={ADMIN_BTN}>{t('common.cancel')}</button>
              <button onClick={save} className={ADMIN_BTN_PRIMARY}>{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
