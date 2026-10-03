import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { ADMIN_BTN, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { useToastStore } from '../../store/toastStore';
import { AdminTable, AdminTableRow, AdminTableCell, AdminPager, AdminKpiCard, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

const JOB_TYPES = ['transaction', 'bet', 'deposit', 'withdrawal', 'balance', 'custom', 'cryptoDeposit'];
const RESOLVE_STATUSES = ['resolved', 'dismissed', 'escalated'];

const BADGE_CLS = 'inline-flex items-center rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase';

const INPUT_CLS =
  'w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:border-white/25 focus:outline-none';

const LABEL_CLS = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3';

// i18n anahtarları alt çizgi kabul etmiyor (assertValidKey); Mongoose enum
// değerleri (raw) camelCase anahtar segmentlerine eşlenir.
const ITEM_STATUS_KEY = {
  matched: 'matched',
  missing_internally: 'missingInternally',
  missing_externally: 'missingExternally',
  amount_mismatch: 'amountMismatch',
  status_mismatch: 'statusMismatch',
  duplicate: 'duplicate',
  unresolved: 'unresolved',
};

export default function Reconciliation() {
  const { t, locale } = useTranslation();
  const addToast = useToastStore(s => s.add);

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const [stats, setStats] = useState([]);

  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', type: JOB_TYPES[0], dateStart: '', dateEnd: '' });
  const [creating, setCreating] = useState(false);

  const [startingId, setStartingId] = useState(null);

  const [activeJob, setActiveJob] = useState(null); // job object when viewing items
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);
  const [itemsPages, setItemsPages] = useState(1);
  const [itemsTotal, setItemsTotal] = useState(0);
  const [jobsTotal, setJobsTotal] = useState(0);

  const [resolveModal, setResolveModal] = useState(null); // item object or null
  const [resolveForm, setResolveForm] = useState({ status: RESOLVE_STATUSES[0], notes: '' });
  const [resolving, setResolving] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/reconciliation/jobs', { params: { page, limit: 20 } });
      setJobs(data.jobs || []);
      setPages(data.pages || 1);
      setJobsTotal(data.total ?? 0);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/reconciliation/stats');
      setStats(Array.isArray(data.stats) ? data.stats : []);
    } catch {
      setStats([]);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => { loadStats(); }, [loadStats]);

  function openCreate() {
    setCreateForm({ name: '', description: '', type: JOB_TYPES[0], dateStart: '', dateEnd: '' });
    setCreateModal(true);
  }

  async function createJob() {
    if (!createForm.name.trim()) return;
    if (!createForm.dateStart || !createForm.dateEnd) {
      addToast(t('admin.reconciliation.dateRangeRequired'), 'error');
      return;
    }
    setCreating(true);
    try {
      const body = {
        name: createForm.name.trim(),
        type: createForm.type,
        dateRange: {
          start: new Date(createForm.dateStart).toISOString(),
          end: new Date(createForm.dateEnd).toISOString(),
        },
      };
      if (createForm.description.trim()) body.description = createForm.description.trim();
      await api.post('/admin/reconciliation/jobs', body);
      addToast(t('admin.reconciliation.created'), 'success');
      setCreateModal(false);
      loadJobs();
      loadStats();
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.reconciliation.createFailed'), 'error');
    } finally {
      setCreating(false);
    }
  }

  async function startJob(job) {
    setStartingId(job._id);
    try {
      await api.post(`/admin/reconciliation/jobs/${job._id}/start`);
      addToast(t('admin.reconciliation.started'), 'success');
      loadJobs();
      loadStats();
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.reconciliation.startFailed'), 'error');
    } finally {
      setStartingId(null);
    }
  }

  const loadItems = useCallback(async (jobId, p) => {
    setItemsLoading(true);
    try {
      const { data } = await api.get(`/admin/reconciliation/jobs/${jobId}/items`, { params: { page: p, limit: 20 } });
      setItems(data.items || []);
      setItemsPages(data.pages || 1);
      setItemsTotal(data.total ?? 0);
    } catch {
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  function openJob(job) {
    setActiveJob(job);
    setItemsPage(1);
    loadItems(job._id, 1);
  }

  function closeJob() {
    setActiveJob(null);
    setItems([]);
  }

  useEffect(() => {
    if (activeJob) loadItems(activeJob._id, itemsPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsPage]);

  function openResolve(item) {
    setResolveForm({ status: RESOLVE_STATUSES[0], notes: '' });
    setResolveModal(item);
  }

  async function resolveItem() {
    setResolving(true);
    try {
      const body = { status: resolveForm.status };
      if (resolveForm.notes.trim()) body.notes = resolveForm.notes.trim();
      await api.post(`/admin/reconciliation/items/${resolveModal._id}/resolve`, body);
      addToast(t('admin.reconciliation.resolved'), 'success');
      setResolveModal(null);
      if (activeJob) loadItems(activeJob._id, itemsPage);
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.reconciliation.resolveFailed'), 'error');
    } finally {
      setResolving(false);
    }
  }

  const statusColor = {
    pending: 'bg-warning/20 text-warning',
    running: 'bg-info/15 text-info',
    completed: 'bg-success/15 text-success',
    failed: 'bg-danger/20 text-danger',
    cancelled: 'bg-white/10 text-text-3',
  };

  const itemStatusColor = {
    matched: 'bg-success/15 text-success',
    missing_internally: 'bg-danger/20 text-danger',
    missing_externally: 'bg-danger/20 text-danger',
    amount_mismatch: 'bg-warning/20 text-warning',
    status_mismatch: 'bg-warning/20 text-warning',
    duplicate: 'bg-gold/15 text-gold',
    unresolved: 'bg-warning/20 text-warning',
  };

  if (activeJob) {
    return (
      // Dış sarmalayıcı yok: Compliance.jsx wrapper'ı tab içeriğini sarar
      <div>
        <button onClick={closeJob} className="mb-4 inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-bg-hover px-2.5 text-xs font-bold text-text-2 transition hover:text-text-1">
          <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">arrow_back</span>
          {t('admin.reconciliation.backToJobs')}
        </button>

        <div className="mb-4 rounded-xl border border-white/10 bg-bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">receipt_long</span>
            </span>
            <h3 className="min-w-0 truncate text-sm font-extrabold text-text-1">{activeJob.name}</h3>
            <span className={`${BADGE_CLS} ${statusColor[activeJob.status] || 'bg-white/10 text-text-3'}`}>
              {t(`admin.reconciliation.jobStatus.${activeJob.status}`)}
            </span>
          </div>
          {activeJob.description && (
            <div className="mt-1.5 text-sm text-text-3">{activeJob.description}</div>
          )}
        </div>

        <AdminTable
          loading={itemsLoading}
          empty={items.length === 0}
          emptyLabel={t('admin.reconciliation.noItems')}
          columns={[
            { key: 'recordType', label: t('admin.reconciliation.columnRecordType') },
            { key: 'internalId', label: t('admin.reconciliation.columnInternalId') },
            { key: 'externalId', label: t('admin.reconciliation.columnExternalId') },
            { key: 'status', label: t('admin.reconciliation.columnItemStatus') },
            { key: 'actions', label: t('admin.reconciliation.columnActions'), align: 'right' },
          ]}
        >
          {items.map(item => (
            <AdminTableRow key={item._id}>
              <AdminTableCell><span className="text-text-2">{item.recordType}</span></AdminTableCell>
              <AdminTableCell>
                <span className="font-mono text-xs text-text-3">{item.internalRecordId || '—'}</span>
              </AdminTableCell>
              <AdminTableCell>
                <span className="font-mono text-xs text-text-3">{item.externalRecordId || '—'}</span>
              </AdminTableCell>
              <AdminTableCell>
                <span className={`${BADGE_CLS} ${itemStatusColor[item.status] || 'bg-white/10 text-text-3'}`}>
                  {t(`admin.reconciliation.itemStatus.${ITEM_STATUS_KEY[item.status] || item.status}`)}
                </span>
                {item.resolutionStatus && (
                  <span className={`${BADGE_CLS} ml-2 bg-white/10 text-text-2`}>
                    {t(`admin.reconciliation.resolveStatus.${item.resolutionStatus}`)}
                  </span>
                )}
              </AdminTableCell>
              <AdminTableActionsCell>
                {item.status === 'unresolved' && (
                  <button
                    type="button"
                    onClick={() => openResolve(item)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/30 bg-primary/15 px-2.5 text-xs font-bold text-primary transition hover:bg-primary/25"
                  >
                    <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">task_alt</span>
                    {t('admin.reconciliation.resolve')}
                  </button>
                )}
              </AdminTableActionsCell>
            </AdminTableRow>
          ))}
        </AdminTable>

        <AdminPager
          page={itemsPage}
          pages={itemsPages}
          onPage={setItemsPage}
          totalLabel={t('admin.reconciliation.countLine', {
            count: itemsTotal.toLocaleString(locale),
            page: itemsPage,
            pages: itemsPages,
          })}
        />

        {resolveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-lg rounded-xl border border-white/10 bg-bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                  <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">task_alt</span>
                </span>
                <h3 className="text-sm font-extrabold text-text-1">{t('admin.reconciliation.resolveTitle')}</h3>
              </div>
              <div className="space-y-3">
                <div>
                  <label className={LABEL_CLS}>{t('admin.reconciliation.fieldResolveStatus')}</label>
                  <select value={resolveForm.status} onChange={e => setResolveForm(f => ({ ...f, status: e.target.value }))} className={INPUT_CLS}>
                    {RESOLVE_STATUSES.map(s => (
                      <option key={s} value={s}>{t(`admin.reconciliation.resolveStatus.${s}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>{t('admin.reconciliation.fieldNotes')}</label>
                  <textarea value={resolveForm.notes} onChange={e => setResolveForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                    className={`${INPUT_CLS} resize-none`} />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4">
                <button onClick={() => setResolveModal(null)} className={ADMIN_BTN}>
                  {t('common.cancel')}
                </button>
                <button onClick={resolveItem} disabled={resolving} className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}>
                  <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">save</span>
                  {resolving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    // Dış sarmalayıcı yok: Compliance.jsx wrapper'ı tab içeriğini sarar
    <div>
      <div className="mb-4 flex justify-end">
        <button onClick={openCreate} className={ADMIN_BTN_PRIMARY}>
          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">add</span>
          {t('admin.reconciliation.create')}
        </button>
      </div>

      {stats.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {stats.map(s => (
            <AdminKpiCard
              key={s._id}
              label={t(`admin.reconciliation.jobStatus.${s._id}`)}
              value={Number(s.count || 0).toLocaleString(locale)}
            />
          ))}
        </div>
      )}

      <AdminTable
        loading={loading}
        empty={jobs.length === 0}
        emptyLabel={t('admin.reconciliation.noJobs')}
        columns={[
          { key: 'name', label: t('admin.reconciliation.columnName') },
          { key: 'type', label: t('admin.reconciliation.columnType') },
          { key: 'status', label: t('admin.reconciliation.columnStatus') },
          { key: 'unresolved', label: t('admin.reconciliation.columnUnresolved'), align: 'right' },
          { key: 'actions', label: t('admin.reconciliation.columnActions'), align: 'right' },
        ]}
      >
        {jobs.map(job => (
          <AdminTableRow key={job._id} className="cursor-pointer" onClick={() => openJob(job)}>
            <AdminTableCell>
              <span className="font-bold text-text-1">{job.name}</span>
            </AdminTableCell>
            <AdminTableCell><span className="text-text-2">{job.type}</span></AdminTableCell>
            <AdminTableCell>
              <span className={`${BADGE_CLS} ${statusColor[job.status] || 'bg-white/10 text-text-3'}`}>
                {t(`admin.reconciliation.jobStatus.${job.status}`)}
              </span>
            </AdminTableCell>
            <AdminTableCell align="right">
              <span className="font-mono font-bold tabular-nums text-text-2">
                {Number(job.summary?.unresolved ?? 0).toLocaleString(locale)}
              </span>
            </AdminTableCell>
            <AdminTableActionsCell>
              <RowActions
                label={t('admin.reconciliation.columnActions')}
                items={[
                  { key: 'start', label: startingId === job._id ? t('common.saving') : t('admin.reconciliation.start'), icon: 'play_arrow', hidden: job.status !== 'pending', disabled: startingId === job._id, onClick: () => startJob(job) },
                  { key: 'items', label: t('admin.reconciliation.viewItems'), icon: 'list', onClick: () => openJob(job) },
                ]}
              />
            </AdminTableActionsCell>
          </AdminTableRow>
        ))}
      </AdminTable>

      <AdminPager
        page={page}
        pages={pages}
        onPage={setPage}
        totalLabel={t('admin.reconciliation.countLine', {
          count: jobsTotal.toLocaleString(locale),
          page,
          pages,
        })}
      />

      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">add_task</span>
              </span>
              <h3 className="text-sm font-extrabold text-text-1">{t('admin.reconciliation.createTitle')}</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className={LABEL_CLS}>{t('admin.reconciliation.fieldName')}</label>
                <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>{t('admin.reconciliation.fieldDescription')}</label>
                <textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className={`${INPUT_CLS} resize-none`} />
              </div>
              <div>
                <label className={LABEL_CLS}>{t('admin.reconciliation.fieldType')}</label>
                <select value={createForm.type} onChange={e => setCreateForm(f => ({ ...f, type: e.target.value }))} className={INPUT_CLS}>
                  {JOB_TYPES.map(type => (
                    <option key={type} value={type}>{t(`admin.reconciliation.jobType.${type}`)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={LABEL_CLS}>{t('admin.reconciliation.fieldDateStart')}</label>
                  <input type="date" required value={createForm.dateStart} onChange={e => setCreateForm(f => ({ ...f, dateStart: e.target.value }))} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>{t('admin.reconciliation.fieldDateEnd')}</label>
                  <input type="date" required value={createForm.dateEnd} onChange={e => setCreateForm(f => ({ ...f, dateEnd: e.target.value }))} className={INPUT_CLS} />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2 border-t border-white/10 pt-4">
              <button onClick={() => setCreateModal(false)} className={ADMIN_BTN}>
                {t('common.cancel')}
              </button>
              <button
                onClick={createJob}
                disabled={creating || !createForm.name.trim() || !createForm.dateStart || !createForm.dateEnd}
                className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}
              >
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">save</span>
                {creating ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
