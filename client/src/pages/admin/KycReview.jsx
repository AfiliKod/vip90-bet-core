import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useToastStore } from '../../store/toastStore';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import { useTranslation } from '../../i18n';
import DetailDrawer from '../../components/admin/DetailDrawer.jsx';
import { ADMIN_BTN } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';

const STATUS_FILTERS = [
  { value: '', labelKey: 'common.all' },
  { value: 'pending', labelKey: 'admin.kycReview.filterPending' },
  { value: 'under_review', labelKey: 'admin.kycReview.filterUnderReview' },
  { value: 'approved', labelKey: 'admin.kycReview.filterApproved' },
  { value: 'rejected', labelKey: 'admin.kycReview.filterRejected' },
];

const STATUS_BADGE = {
  not_started:  'bg-white/10 text-text-3',
  pending:      'bg-warning/20 text-warning',
  under_review: 'bg-info/15 text-info',
  approved:     'bg-success/15 text-success',
  rejected:     'bg-danger/20 text-danger',
  expired:      'bg-white/10 text-text-3',
};

const STATUS_LABELS = {
  not_started: 'admin.kycReview.statusNotStarted', pending: 'admin.kycReview.statusPending',
  under_review: 'admin.kycReview.statusUnderReview', approved: 'admin.kycReview.statusApproved',
  rejected: 'admin.kycReview.statusRejected', expired: 'admin.kycReview.statusExpired',
};

const ACTION_BASE =
  'inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-sm font-bold transition disabled:opacity-40';

function StatusBadge({ status }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${STATUS_BADGE[status] || STATUS_BADGE.not_started}`}>
      <i className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status] ? t(STATUS_LABELS[status]) : status}
    </span>
  );
}

export default function AdminKycReview() {
  const { t, locale } = useTranslation();
  const fmt = useFormatters();
  const addToast = useToastStore(s => s.add);
  const [submissions, setSubmissions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailDocs, setDetailDocs] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [acting, setActing] = useState(false);
  const [stats, setStats] = useState(null);
  const searchTimer = useRef(null);

  const load = useCallback(async (f, s, p) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 20 });
      if (f) params.set('status', f);
      if (s) params.set('search', s);
      const [subRes, statsRes] = await Promise.all([
        api.get(`/admin/kyc/submissions?${params}`),
        api.get('/admin/kyc/stats').catch(() => ({ data: null })),
      ]);
      setSubmissions(subRes.data.submissions || []);
      setTotal(subRes.data.total || 0);
      setPages(subRes.data.pages || 1);
      setStats(statsRes.data);
    } catch {
      addToast(t('admin.kycReview.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, t]);

  // search bilinçli olarak dışarıda — arama debounce'u onSearch içinde load'u çağırır.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(filter, search, page); }, [filter, page, load]);

  const onSearch = (v) => {
    setSearch(v);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(filter, v, 1), 300);
  };

  const onFilter = (v) => {
    clearTimeout(searchTimer.current);
    setFilter(v);
    setPage(1);
  };

  async function openDetail(userId) {
    setSelected(userId);
    setDetailLoading(true);
    setShowReject(false);
    setRejectReason('');
    try {
      const { data } = await api.get(`/admin/kyc/submissions/${userId}`);
      setSelected(data.user);
      setDetailDocs(data.documents);
    } catch {
      addToast(t('admin.kycReview.detailLoadError'), 'error');
    } finally {
      setDetailLoading(false);
    }
  }

  async function approve() {
    if (!selected?._id) return;
    setActing(true);
    try {
      await api.post(`/admin/kyc/submissions/${selected._id}/approve`);
      addToast(t('admin.kycReview.approved'), 'success');
      setSelected(null);
      setDetailDocs(null);
      load(filter, search, page);
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.kycReview.approveFailed'), 'error');
    } finally {
      setActing(false);
    }
  }

  async function reject() {
    if (!selected?._id || !rejectReason.trim()) return;
    setActing(true);
    try {
      await api.post(`/admin/kyc/submissions/${selected._id}/reject`, { reason: rejectReason });
      addToast(t('admin.kycReview.rejected'), 'success');
      setSelected(null);
      setDetailDocs(null);
      setShowReject(false);
      setRejectReason('');
      load(filter, search, page);
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.kycReview.rejectFailed'), 'error');
    } finally {
      setActing(false);
    }
  }

  async function setUnderReview() {
    if (!selected?._id) return;
    setActing(true);
    try {
      await api.post(`/admin/kyc/submissions/${selected._id}/under-review`);
      addToast(t('admin.kycReview.markedUnderReview'), 'success');
      openDetail(selected._id);
      load(filter, search, page);
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.kycReview.actionFailed'), 'error');
    } finally {
      setActing(false);
    }
  }

  return (
    // Dış sarmalayıcı yok: Compliance.jsx'in max-w-[1400px] wrapper'ı tab içeriğini sarar
    <div>
      <p className="mb-6 text-sm text-text-3">{t('admin.kycReview.subtitle')}</p>

      {/* KPI şeridi */}
      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {stats.byStatus?.map(s => (
            <article key={s._id} className="min-w-0 rounded-xl border border-white/10 bg-bg-card p-3.5">
              {/* Eski/seed kullanıcılarda kycStatus eksikse _id:null grubu oluşur */}
              <div className="truncate text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">
                {STATUS_LABELS[s._id] ? t(STATUS_LABELS[s._id]) : (s._id ? s._id : t('admin.kycReview.statusUnknown'))}
              </div>
              <div className="mt-2 font-mono text-[22px] font-bold tabular-nums tracking-tight text-text-1">
                {Number(s.count || 0).toLocaleString(locale)}
              </div>
            </article>
          ))}
          <article className="min-w-0 rounded-xl border border-white/10 bg-bg-card p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.kycReview.todayApproved')}</div>
            <div className="mt-2 font-mono text-[22px] font-bold tabular-nums tracking-tight text-success">
              {Number(stats.approvedToday || 0).toLocaleString(locale)}
            </div>
          </article>
        </div>
      )}

      {/* Filtre + Arama */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[300px]">
          <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={t('admin.kycReview.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
        </label>
        <div className="flex max-w-full gap-1.5 overflow-x-auto">
          {STATUS_FILTERS.map(f => {
            const on = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => onFilter(f.value)}
                className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-bold transition ${
                  on
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : 'border-white/10 bg-bg-hover text-text-2 hover:text-text-1'
                }`}
              >
                {t(f.labelKey)}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-white/10 bg-bg-card px-2.5 text-xs font-bold text-text-3">
            {t('admin.kycReview.countLabel', { count: total.toLocaleString(locale) })}
          </span>
          <button
            type="button"
            onClick={() => { onSearch(''); onFilter(''); }}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-text-3 transition hover:text-text-1"
          >
            <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">close</span>
            {t('common.reset')}
          </button>
        </div>
      </div>

      {/* Başvuru Listesi */}
      <AdminTable
        loading={loading}
        empty={submissions.length === 0}
        emptyLabel={t('admin.kycReview.listEmpty')}
        columns={[
          { key: 'user', label: t('admin.kycReview.columnUser') },
          { key: 'email', label: t('admin.kycReview.columnEmail') },
          { key: 'status', label: t('admin.kycReview.columnStatus') },
          { key: 'pending', label: t('admin.kycReview.columnPending') },
          { key: 'submitted', label: t('admin.kycReview.columnSubmitted') },
          { key: 'actions', label: t('admin.kycReview.columnActions'), align: 'right' },
        ]}
      >
        {submissions.map(u => {
          const initials = (u.username || '?').slice(0, 2).toUpperCase();
          return (
            <AdminTableRow key={u._id} className="cursor-pointer" onClick={() => openDetail(u._id)}>
              <AdminTableCell>
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-text-1">{u.username}</div>
                    <div className="mt-0.5 font-mono text-xs text-text-3">USR-{String(u._id || '').slice(-6).toUpperCase()}</div>
                  </div>
                </div>
              </AdminTableCell>
              <AdminTableCell><span className="font-mono text-xs text-text-3">{u.email || '—'}</span></AdminTableCell>
              <AdminTableCell><StatusBadge status={u.kycStatus} /></AdminTableCell>
              <AdminTableCell>
                <span className="font-mono text-xs font-semibold tabular-nums text-text-2">
                  {u.docCounts ? (u.docCounts.pending || 0).toLocaleString(locale) : '—'}
                </span>
              </AdminTableCell>
              <AdminTableCell>
                <span className="font-mono text-xs text-text-3">
                  {u.kycSubmittedAt ? fmt.formatDate(u.kycSubmittedAt) : '—'}
                </span>
              </AdminTableCell>
              <AdminTableActionsCell>
                <button
                  type="button"
                  onClick={() => openDetail(u._id)}
                  title={t('admin.kycReview.title')}
                  aria-label={t('admin.kycReview.title')}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-text-3 transition hover:bg-bg-hover hover:text-text-1"
                >
                  <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">open_in_new</span>
                </button>
              </AdminTableActionsCell>
            </AdminTableRow>
          );
        })}
      </AdminTable>

      {/* Sayfalama */}
      {pages > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-bg-card px-4 py-3 text-[13px] text-text-3">
          <span>
            {t('admin.kycReview.countLabel', { count: total.toLocaleString(locale) })}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="grid h-8 min-w-8 place-items-center rounded-md border border-white/10 px-2 font-mono text-xs font-bold text-text-2 transition hover:bg-bg-hover disabled:opacity-30"
            >
              ‹
            </button>
            <span className="px-1 font-mono text-xs text-text-1">{page} / {pages}</span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="grid h-8 min-w-8 place-items-center rounded-md border border-white/10 px-2 font-mono text-xs font-bold text-text-2 transition hover:bg-bg-hover disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* Detay Modal */}
      <DetailDrawer
        open={!!selected}
        onClose={() => { setSelected(null); setDetailDocs(null); }}
        title={selected?.username}
        subtitle={selected?.email}
      >
        {selected && (
          <>
            {/* Durum */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-2">{t('admin.kycReview.statusLabel')}</span>
              <StatusBadge status={selected.kycStatus} />
            </div>

            {selected.kycSubmittedAt && (
              <div className="text-xs text-text-3">{t('admin.kycReview.submittedAt', { date: fmt.formatDate(selected.kycSubmittedAt) })}</div>
            )}
            {selected.kycRejectionReason && (
              <div className="text-xs text-danger">{t('admin.kycReview.rejectionReasonLabel', { reason: selected.kycRejectionReason })}</div>
            )}

            {/* Belgeler */}
            <div className="rounded-xl border border-white/10 bg-bg-card p-3.5">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                  <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">description</span>
                </span>
                <h3 className="text-sm font-extrabold text-text-1">{t('admin.kycReview.documents')}</h3>
                {!detailLoading && detailDocs?.length > 0 && (
                  <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">
                    {detailDocs.length.toLocaleString(locale)}
                  </span>
                )}
              </div>
              {detailLoading ? (
                <div className="py-4 text-center text-sm text-text-3">{t('common.loading')}</div>
              ) : detailDocs?.length > 0 ? (
                <div className="space-y-2">
                  {detailDocs.map(doc => (
                    <div key={doc._id} className="rounded-lg border border-white/5 bg-bg-hover p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="material-symbols-outlined !text-[18px] text-text-3" aria-hidden="true">{doc.mimeType === 'application/pdf' ? 'description' : 'image'}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs text-text-1">{doc.fileName}</div>
                          <div className="font-mono text-[10px] text-text-3">
                            {doc.documentType} · {fmt.formatNumber(Number((doc.fileSize / 1024).toFixed(1)))} KB
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase ${STATUS_BADGE[doc.status] || STATUS_BADGE.not_started}`}>
                          {STATUS_LABELS[doc.status] ? t(STATUS_LABELS[doc.status]) : doc.status}
                        </span>
                      </div>
                      {doc.fileUrl && (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-primary transition hover:underline"
                        >
                          <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">open_in_new</span>
                          {t('admin.kycReview.viewDocument')}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-white/5 bg-bg-deep px-4 py-8 text-center">
                  <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">draft</span>
                  <div className="mt-2 text-sm text-text-3">{t('admin.kycReview.docEmpty')}</div>
                </div>
              )}
            </div>

            {/* Aksiyonlar */}
            {(selected.kycStatus === 'pending' || selected.kycStatus === 'under_review' || selected.kycStatus === 'not_started') && (
              <div className="space-y-2 border-t border-white/10 pt-3">
                {selected.kycStatus === 'pending' && (
                  <button
                    onClick={setUnderReview}
                    disabled={acting}
                    className={`${ACTION_BASE} border-info/30 bg-info/15 text-info hover:bg-info/25`}
                  >
                    <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">visibility</span>
                    {t('admin.kycReview.markUnderReview')}
                  </button>
                )}
                <button
                  onClick={approve}
                  disabled={acting}
                  className={`${ACTION_BASE} border-success/30 bg-success/15 text-success hover:bg-success/25`}
                >
                  <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">check_circle</span>
                  {t('admin.kycReview.approve')}
                </button>
                {!showReject ? (
                  <button
                    onClick={() => setShowReject(true)}
                    className={`${ACTION_BASE} border-danger/30 bg-danger/10 text-danger hover:bg-danger/20`}
                  >
                    <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">cancel</span>
                    {t('admin.kycReview.reject')}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder={t('admin.kycReview.rejectPlaceholder')}
                      className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:border-white/25 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowReject(false); setRejectReason(''); }}
                        className={`${ADMIN_BTN} flex-1 justify-center`}
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={reject}
                        disabled={acting || !rejectReason.trim()}
                        className={`${ACTION_BASE} flex-1 border-transparent bg-danger text-white hover:brightness-110`}
                      >
                        <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">block</span>
                        {acting ? t('admin.kycReview.working') : t('admin.kycReview.reject')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DetailDrawer>
    </div>
  );
}
