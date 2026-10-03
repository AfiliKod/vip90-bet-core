import { useEffect, useState, useCallback } from 'react';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminPager, AdminKpiCard, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

const STATUSES = ['pending', 'resolved', 'ignored'];

function statusTone(status) {
  if (status === 'resolved') return { pill: 'bg-success/15 text-success', dot: 'bg-success' };
  if (status === 'ignored') return { pill: 'bg-white/10 text-text-2', dot: 'bg-white/40' };
  return { pill: 'bg-warning/15 text-warning', dot: 'bg-warning' };
}

export default function AdminGameTasks() {
  const { t, locale } = useTranslation();
  const fmt = useFormatters();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ pending: 0, resolved: 0, ignored: 0 });
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/tasks', { params: { status: filter, page, limit: 20 } });
      setTasks(r.data.tasks || []);
      setTotal(r.data.total ?? 0);
      setPages(r.data.pages || 1);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  // Sekme rozetleri için durum sayıları (tek çağrıda üç sayım).
  const loadCounts = useCallback(async () => {
    const results = await Promise.all(
      STATUSES.map(s => api.get('/admin/tasks', { params: { status: s, page: 1, limit: 1 } }).catch(() => ({ data: { total: 0 } }))),
    );
    setCounts(Object.fromEntries(STATUSES.map((s, i) => [s, results[i].data.total ?? 0])));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCounts(); }, [loadCounts, filter]);

  const onTab = (key) => { setFilter(key); setPage(1); };

  async function updateStatus(id, status) {
    const r = await api.patch(`/admin/tasks/${id}`, { status, notes: notes[id] || '' });
    setTasks(prev => prev.map(task => (task._id === id ? r.data.task : task)));
    loadCounts();
  }

  const tabItems = STATUSES.map(s => ({
    key: s,
    label: t(`admin.gameTasks.${s}`),
    count: counts[s],
  }));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupProducts') }, { label: t('admin.gameTasks.title') }]}
        title={t('admin.gameTasks.title')}
        sub={t('admin.gameTasks.countLine', { count: total.toLocaleString(locale), page, pages })}
      >
        <AdminTabs items={tabItems} value={filter} onChange={onTab} />
      </AdminPageHeader>

      <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
        <AdminKpiCard label={t('admin.gameTasks.pending')} value={counts.pending.toLocaleString(locale)} tone="text-warning" />
        <AdminKpiCard label={t('admin.gameTasks.resolved')} value={counts.resolved.toLocaleString(locale)} tone="text-success" />
        <AdminKpiCard label={t('admin.gameTasks.ignored')} value={counts.ignored.toLocaleString(locale)} />
      </section>

      <AdminTable
        loading={loading}
        empty={tasks.length === 0}
        emptyLabel={t('admin.gameTasks.noneFound')}
        columns={[
          { key: 'game', label: t('admin.gameTasks.columnGame') },
          { key: 'type', label: t('admin.gameTasks.columnType') },
          { key: 'status', label: t('admin.gameTasks.columnStatus') },
          { key: 'detected', label: t('admin.gameTasks.columnDetected') },
          { key: 'actions', label: t('admin.gameTasks.columnActions'), align: 'right' },
        ]}
      >
        {tasks.map(task => {
          const tone = statusTone(task.status);
          return (
            <AdminTableRow key={task._id}>
              <AdminTableCell>
                <div className="truncate font-bold text-text-1">{task.gameTitle || task.gameId}</div>
                <div className="mt-0.5 font-mono text-xs text-text-3">{task.gameId}</div>
              </AdminTableCell>
              <AdminTableCell>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-extrabold uppercase text-text-2">{task.type}</span>
                {task.notes && <div className="mt-0.5 truncate text-xs italic text-text-3">"{task.notes}"</div>}
              </AdminTableCell>
              <AdminTableCell>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${tone.pill}`}>
                  <i className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                  {t(`admin.gameTasks.${task.status}`)}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <div className="whitespace-nowrap font-mono text-xs text-text-3">{fmt.formatDateTime(task.detectedAt)}</div>
                {task.provider && <div className="mt-0.5 truncate text-xs text-text-3">{task.provider}</div>}
              </AdminTableCell>
              <AdminTableActionsCell>
                {task.status === 'pending' ? (
                  <>
                    <input
                      value={notes[task._id] || ''}
                      onChange={e => setNotes(prev => ({ ...prev, [task._id]: e.target.value }))}
                      placeholder={t('admin.gameTasks.addNotePlaceholder')}
                      className="h-8 w-36 rounded-lg border border-white/10 bg-bg-deep px-2 text-xs text-text-1 placeholder:text-text-3 focus:border-white/25 focus:outline-none"
                    />
                    <RowActions
                      label={t('admin.gameTasks.columnActions')}
                      items={[
                        { key: 'resolved', label: t('admin.gameTasks.resolved'), icon: 'task_alt', tone: 'success', onClick: () => updateStatus(task._id, 'resolved') },
                        { key: 'ignored', label: t('admin.gameTasks.ignore'), icon: 'visibility_off', onClick: () => updateStatus(task._id, 'ignored') },
                      ]}
                    />
                  </>
                ) : (
                  <span className="text-xs text-text-3">—</span>
                )}
              </AdminTableActionsCell>
            </AdminTableRow>
          );
        })}
      </AdminTable>

      <AdminPager
        page={page}
        pages={pages}
        onPage={setPage}
        totalLabel={t('admin.gameTasks.countLine', { count: total.toLocaleString(locale), page, pages })}
      />
    </div>
  );
}
