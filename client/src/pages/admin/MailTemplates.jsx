import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs, ADMIN_BTN, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableEmpty, AdminPager, AdminKpiCard } from '../../components/admin/AdminTable.jsx';
import DetailDrawer from '../../components/admin/DetailDrawer.jsx';

const CATEGORY_ACTION = 'action';
const CATEGORY_SCHEDULED = 'scheduled';
const AUDIENCE_TYPES = ['all', 'segments', 'users', 'inactive'];
const TRIGGER_KEYS = {
  action: 'admin.mailTemplates.triggerAction',
  manual: 'admin.mailTemplates.triggerManual',
  schedule: 'admin.mailTemplates.triggerSchedule',
};

const EMPTY_FORM = {
  event: '',
  name: '',
  subject: '',
  preheader: '',
  body: '',
  ctaLabel: '',
  ctaUrl: '',
  enabled: true,
  audience: { type: 'all', segmentIds: [], userIds: [], inactiveDays: 14 },
  schedule: { enabled: false, intervalHours: 168 },
};

const INPUT = 'w-full rounded-lg border border-white/10 bg-bg-hover px-3 py-2 text-sm text-text-1 outline-none transition focus:border-primary';
const LABEL = 'block text-xs font-bold text-text-3 mb-1';

/** Seçili kitle tipine göre alıcı tanımı (hem düzenleme hem gönderim modalında). */
function AudienceEditor({ value, onChange, segments, disabled = false }) {
  const { t } = useTranslation();
  const [userQuery, setUserQuery] = useState('');
  const [userHits, setUserHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);

  const patch = (p) => onChange({ ...value, ...p });

  const searchUsers = (q) => {
    setUserQuery(q);
    clearTimeout(timer.current);
    if (!q.trim()) { setUserHits([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get('/admin/users', { params: { search: q.trim(), limit: 8 } });
        setUserHits(res.data.users || []);
      } catch {
        setUserHits([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const addUser = (u) => {
    if (!value.userIds.includes(u._id)) patch({ userIds: [...value.userIds, u._id] });
    setUserQuery('');
    setUserHits([]);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-bg-deep/40 p-3 space-y-3">
      <div>
        <label className={LABEL}>{t('admin.mailTemplates.audienceType')}</label>
        <div className="flex flex-wrap gap-1.5">
          {AUDIENCE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              disabled={disabled}
              onClick={() => patch({ type })}
              className={`rounded-lg px-2.5 py-1.5 text-[11.5px] font-extrabold transition disabled:opacity-50 ${
                value.type === type
                  ? 'bg-primary/20 text-primary shadow-[0_0_0_1px_rgba(0,212,255,0.35)]'
                  : 'border border-white/10 bg-bg-hover text-text-3 hover:text-text-1'
              }`}
            >
              {t(`admin.mailTemplates.audience${type.charAt(0).toUpperCase()}${type.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      {value.type === 'segments' && (
        <div>
          <label className={LABEL}>{t('admin.mailTemplates.segmentsLabel')}</label>
          {segments.length === 0 ? (
            <p className="text-xs text-text-3">{t('admin.mailTemplates.noSegments')}</p>
          ) : (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {segments.map((seg) => {
                const on = value.segmentIds.includes(seg._id);
                return (
                  <button
                    key={seg._id}
                    type="button"
                    disabled={disabled}
                    onClick={() => patch({ segmentIds: on ? value.segmentIds.filter(id => id !== seg._id) : [...value.segmentIds, seg._id] })}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${
                      on ? 'bg-primary/20 text-primary' : 'border border-white/10 bg-bg-hover text-text-3 hover:text-text-1'
                    }`}
                  >
                    {seg.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {value.type === 'users' && (
        <div>
          <label className={LABEL}>{t('admin.mailTemplates.usersLabel')}</label>
          <input
            value={userQuery}
            onChange={(e) => searchUsers(e.target.value)}
            disabled={disabled}
            placeholder={t('admin.mailTemplates.userSearch')}
            className={INPUT}
          />
          {userHits.length > 0 && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-bg-card">
              {userHits.map((u) => (
                <button
                  key={u._id}
                  type="button"
                  disabled={disabled}
                  onClick={() => addUser(u)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition hover:bg-bg-hover disabled:opacity-50"
                >
                  <span className="truncate font-bold text-text-1">{u.username}</span>
                  <span className="truncate text-text-3">{u.email}</span>
                </button>
              ))}
            </div>
          )}
          {searching && <p className="mt-1 text-xs text-text-3">{t('common.loading')}</p>}
          {value.userIds.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {value.userIds.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 font-mono text-[10.5px] text-primary">
                  …{id.slice(-6)}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => patch({ userIds: value.userIds.filter(x => x !== id) })}
                    className="text-text-3 transition hover:text-danger disabled:opacity-50"
                    aria-label={t('common.delete')}
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {value.type === 'inactive' && (
        <div>
          <label className={LABEL}>{t('admin.mailTemplates.inactiveDays')}</label>
          <input
            type="number"
            min={1}
            max={720}
            disabled={disabled}
            value={value.inactiveDays ?? 14}
            onChange={(e) => patch({ inactiveDays: Number(e.target.value) })}
            className={`${INPUT} max-w-[140px]`}
          />
        </div>
      )}
    </div>
  );
}

export default function MailTemplates({ embedded = false }) {
  const { t, locale } = useTranslation();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [segments, setSegments] = useState([]);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');      // sorgu (debounce sonrası)
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [modal, setModal] = useState(null); // null | 'create' | şablon nesnesi
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const bodyRef = useRef(null);
  const searchTimer = useRef(null);

  const [sendDoc, setSendDoc] = useState(null);
  const [sendForm, setSendForm] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPages, setLogsPages] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);

  // Veri çeken saf fonksiyon — içinde setState yok, bu yüzden hem effect
  // içinde hem de kayıt/silme sonrası güvenle çağrılır
  // (react-hooks/set-state-in-effect kuralını ihlal etmez).
  const fetchList = useCallback(async () => {
    const params = { page, limit: 20 };
    if (search.trim()) params.search = search.trim();
    if (tab !== 'all') params.category = tab;
    const [listRes, statsRes] = await Promise.all([
      api.get('/admin/mail-templates', { params }),
      api.get('/admin/mail-templates/stats').catch(() => ({ data: null })),
    ]);
    return {
      items: listRes.data.templates || [],
      total: listRes.data.total ?? 0,
      pages: listRes.data.pages || 1,
      stats: statsRes.data || null,
    };
  }, [page, search, tab]);

  const applyList = useCallback((d) => {
    setItems(d.items);
    setTotal(d.total);
    setPages(d.pages);
    setStats(d.stats);
    setLoading(false);
  }, []);

  /** Kayıt/silme sonrası yenileme (olay tutamacından çağrılır). */
  const load = useCallback(async () => {
    try {
      applyList(await fetchList());
    } catch {
      setItems([]);
      setLoading(false);
    }
  }, [fetchList, applyList]);

  useEffect(() => {
    let alive = true;
    fetchList()
      .then((d) => { if (alive) applyList(d); })
      .catch(() => { if (alive) { setItems([]); setLoading(false); } });
    return () => { alive = false; };
  }, [fetchList, applyList]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get('/admin/mail-templates/events').catch(() => ({ data: { events: [] } })),
      api.get('/admin/segments', { params: { limit: 100, isActive: 'true' } }).catch(() => ({ data: { segments: [] } })),
    ]).then(([evRes, segRes]) => {
      if (!alive) return;
      setEvents(evRes.data.events || []);
      setSegments(segRes.data.segments || []);
    });
    return () => { alive = false; };
  }, []);

  const fetchLogs = useCallback(async () => {
    const res = await api.get('/admin/mail-templates/logs', { params: { page: logsPage, limit: 20 } });
    return { logs: res.data.logs || [], pages: res.data.pages || 1 };
  }, [logsPage]);

  useEffect(() => {
    if (!logsOpen) return undefined;
    let alive = true;
    fetchLogs()
      .then((d) => { if (alive) { setLogs(d.logs); setLogsPages(d.pages); setLogsLoading(false); } })
      .catch(() => { if (alive) { setLogs([]); setLogsLoading(false); } });
    return () => { alive = false; };
  }, [logsOpen, fetchLogs]);

  const onSearch = (v) => {
    setSearchInput(v);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  };

  const formFromTemplate = (tpl) => ({
    event: tpl.event,
    name: tpl.name || '',
    subject: tpl.subject || '',
    preheader: tpl.preheader || '',
    body: tpl.body || '',
    ctaLabel: tpl.ctaLabel || '',
    ctaUrl: tpl.ctaUrl || '',
    enabled: tpl.enabled !== false,
    audience: {
      type: tpl.audience?.type || 'all',
      segmentIds: tpl.audience?.segmentIds || [],
      userIds: tpl.audience?.userIds || [],
      inactiveDays: tpl.audience?.inactiveDays ?? 14,
    },
    schedule: {
      enabled: !!tpl.schedule?.enabled,
      intervalHours: tpl.schedule?.intervalHours || 168,
    },
  });

  function openCreate() {
    setForm({ ...EMPTY_FORM, audience: { ...EMPTY_FORM.audience }, schedule: { ...EMPTY_FORM.schedule } });
    setPreview(null);
    setModal('create');
  }

  function openEdit(tpl) {
    setForm(formFromTemplate(tpl));
    setPreview(null);
    setModal(tpl);
  }

  function insertVar(v) {
    const el = bodyRef.current;
    const token = `{{${v}}}`;
    if (!el) { setForm(f => ({ ...f, body: f.body + token })); return; }
    const start = el.selectionStart ?? form.body.length;
    const end = el.selectionEnd ?? start;
    const next = form.body.slice(0, start) + token + form.body.slice(end);
    setForm(f => ({ ...f, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function runPreview() {
    setPreviewing(true);
    setNotice(null);
    try {
      const res = await api.post('/admin/mail-templates/preview', {
        event: form.event || undefined,
        subject: form.subject,
        preheader: form.preheader,
        body: form.body,
        ctaLabel: form.ctaLabel,
        ctaUrl: form.ctaUrl,
      });
      setPreview(res.data);
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.mailTemplates.previewFailed') });
    } finally {
      setPreviewing(false);
    }
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const isCreate = modal === 'create';
      const body = {
        name: form.name,
        subject: form.subject,
        preheader: form.preheader,
        body: form.body,
        ctaLabel: form.ctaLabel,
        ctaUrl: form.ctaUrl,
        enabled: form.enabled,
        // Kitle/plan yalnızca scheduled'ta okunur; aksiyon şablonunda
        // saklansa bile gönderim motoru hiçbir zaman kullanmaz.
        audience: form.audience,
        schedule: form.schedule,
      };
      if (isCreate) {
        await api.post('/admin/mail-templates', { event: form.event, ...body });
      } else {
        await api.patch(`/admin/mail-templates/${modal._id}`, body);
      }
      setNotice({ type: 'ok', text: t('admin.mailTemplates.saved') });
      setModal(null);
      load();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.mailTemplates.saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm(t('admin.mailTemplates.confirmDelete'))) return;
    setNotice(null);
    try {
      await api.delete(`/admin/mail-templates/${id}`);
      setNotice({ type: 'ok', text: t('admin.mailTemplates.deleted') });
      load();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.mailTemplates.deleteFailed') });
    }
  }

  function openSend(tpl) {
    setSendForm({
      type: tpl.audience?.type || 'all',
      segmentIds: tpl.audience?.segmentIds || [],
      userIds: tpl.audience?.userIds || [],
      inactiveDays: tpl.audience?.inactiveDays ?? 14,
    });
    setSendResult(null);
    setSendDoc(tpl);
  }

  async function confirmSend() {
    setSending(true);
    setNotice(null);
    try {
      const res = await api.post(`/admin/mail-templates/${sendDoc._id}/send`, { audience: sendForm });
      setSendResult(res.data);
      load();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.mailTemplates.sendFailed') });
      setSendDoc(null);
    } finally {
      setSending(false);
    }
  }

  function eventCategoryOf(event) {
    return events.find(e => e.event === event)?.category || null;
  }

  function eventVars() {
    const list = events.find(e => e.event === form.event)?.variables || [];
    return list;
  }

  const editCategory = modal === 'create' ? eventCategoryOf(form.event) : modal?.category;
  const usableEvents = events.filter(e => !e.used || modal?.event === e.event);

  const tabItems = [
    { key: 'all', label: t('common.all'), count: stats?.total },
    { key: CATEGORY_ACTION, label: t('admin.mailTemplates.categoryAction'), count: stats?.action },
    { key: CATEGORY_SCHEDULED, label: t('admin.mailTemplates.categoryScheduled'), count: stats?.scheduled },
  ];

  return (
    <div className={embedded ? '' : 'mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6'}>
      <AdminPageHeader
        embedded={embedded}
        crumbs={[{ label: t('admin.nav.groupEngagement') }, { label: t('admin.mailTemplates.title') }]}
        title={t('admin.mailTemplates.title')}
        sub={t('admin.mailTemplates.countLine', { count: total.toLocaleString(locale), page, pages })}
        actions={(
          <>
            <button type="button" onClick={() => setLogsOpen(true)} className={ADMIN_BTN}>
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">history</span>
              {t('admin.mailTemplates.logs')}
            </button>
            <button type="button" onClick={openCreate} className={ADMIN_BTN_PRIMARY}>
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">add</span>
              {t('admin.mailTemplates.create')}
            </button>
          </>
        )}
      >
        <AdminTabs items={tabItems} value={tab} onChange={(key) => { setTab(key); setPage(1); }} />
      </AdminPageHeader>

      {notice && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          notice.type === 'ok' ? 'border-success/30 bg-success/15 text-success' : 'border-danger/30 bg-danger/15 text-danger'
        }`}>
          {notice.text}
        </div>
      )}

      {stats && (
        <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <AdminKpiCard label={t('admin.mailTemplates.statTotal')} value={String(stats.total ?? 0)} />
          <AdminKpiCard label={t('admin.mailTemplates.statAction')} value={String(stats.action ?? 0)} tone="text-primary" />
          <AdminKpiCard label={t('admin.mailTemplates.statScheduled')} value={String(stats.scheduled ?? 0)} tone="text-gold" />
          <AdminKpiCard label={t('admin.mailTemplates.statSent')} value={String(stats.sent ?? 0)} tone="text-success" />
        </section>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[320px]">
          <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
          <input
            value={searchInput}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t('admin.mailTemplates.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
        </label>
        <button
          type="button"
          onClick={() => { clearTimeout(searchTimer.current); setSearchInput(''); setSearch(''); setTab('all'); setPage(1); }}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-bold text-text-3 transition hover:text-text-1"
        >
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">close</span>
          {t('common.reset')}
        </button>
      </div>

      <AdminTable
        columns={[
          { key: 'name', label: t('admin.mailTemplates.columnName') },
          { key: 'category', label: t('admin.mailTemplates.columnCategory') },
          { key: 'event', label: t('admin.mailTemplates.columnEvent') },
          { key: 'status', label: t('admin.mailTemplates.columnStatus') },
          { key: 'sent', label: t('admin.mailTemplates.columnSent'), align: 'right' },
          { key: 'actions', label: t('admin.mailTemplates.columnActions'), align: 'right' },
        ]}
      >
        {loading ? (
          <AdminTableEmpty colSpan={6}>{t('common.loading')}</AdminTableEmpty>
        ) : items.length === 0 ? (
          <AdminTableEmpty colSpan={6}>{t('admin.mailTemplates.empty')}</AdminTableEmpty>
        ) : items.map(tpl => (
          <AdminTableRow key={tpl._id} className="cursor-pointer" onClick={() => openEdit(tpl)}>
            <AdminTableCell>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold text-text-1">{tpl.name}</span>
                  {tpl.isSystem && (
                    <span className="shrink-0 rounded-full bg-info/15 px-2 py-[2px] text-[10px] font-extrabold uppercase text-info">
                      {t('admin.mailTemplates.systemBadge')}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-text-3">{tpl.subject}</div>
              </div>
            </AdminTableCell>
            <AdminTableCell>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                tpl.category === CATEGORY_SCHEDULED ? 'bg-gold/15 text-gold' : 'bg-primary/15 text-primary'
              }`}>
                {t(`admin.mailTemplates.category${tpl.category === CATEGORY_SCHEDULED ? 'Scheduled' : 'Action'}`)}
              </span>
            </AdminTableCell>
            <AdminTableCell>
              <span className="font-mono text-xs text-text-2" title={tpl.event}>
                {t(`admin.mailTemplates.event.${tpl.event}`)}
              </span>
            </AdminTableCell>
            <AdminTableCell>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                tpl.enabled !== false ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
              }`}>
                {tpl.enabled !== false ? t('admin.mailTemplates.enabled') : t('admin.mailTemplates.disabled')}
              </span>
            </AdminTableCell>
            <AdminTableCell align="right">
              <span className="font-mono text-xs font-semibold tabular-nums text-text-2">
                {(tpl.stats?.sentCount ?? 0).toLocaleString(locale)}
              </span>
            </AdminTableCell>
            <AdminTableCell align="right">
              <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => openEdit(tpl)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-bg-hover px-2.5 text-xs font-bold text-text-2 transition hover:text-text-1"
                >
                  <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">edit</span>
                  {t('common.edit')}
                </button>
                {tpl.category === CATEGORY_SCHEDULED && (
                  <button
                    onClick={() => openSend(tpl)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 text-xs font-bold text-primary transition hover:bg-primary/20"
                  >
                    <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">send</span>
                    {t('admin.mailTemplates.send')}
                  </button>
                )}
                {!tpl.isSystem && (
                  <button
                    onClick={() => remove(tpl._id)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2.5 text-xs font-bold text-danger transition hover:bg-danger/20"
                  >
                    <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">delete</span>
                    {t('common.delete')}
                  </button>
                )}
              </div>
            </AdminTableCell>
          </AdminTableRow>
        ))}
      </AdminTable>

      <AdminPager
        page={page}
        pages={pages}
        onPage={setPage}
        totalLabel={t('admin.mailTemplates.countLine', { count: total.toLocaleString(locale), page, pages })}
      />

      {/* ── Düzenle / oluştur ─────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-white/10 bg-bg-card p-6">
            <h2 className="mb-1 text-lg font-bold text-text-1">
              {modal === 'create' ? t('admin.mailTemplates.createTitle') : t('admin.mailTemplates.editTitle')}
            </h2>
            <p className="mb-4 text-xs text-text-3">{t('admin.mailTemplates.editHint')}</p>

            {editCategory && (
              <div className={`mb-4 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${
                editCategory === CATEGORY_SCHEDULED
                  ? 'border-gold/30 bg-gold/10 text-gold'
                  : 'border-info/25 bg-info/10 text-info'
              }`}>
                {editCategory === CATEGORY_SCHEDULED
                  ? t('admin.mailTemplates.scheduledNotice')
                  : t('admin.mailTemplates.actionNotice')}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={LABEL}>{t('admin.mailTemplates.fieldName')}</label>
                <input value={form.name} maxLength={120} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className={INPUT} />
              </div>

              {modal === 'create' ? (
                <div className="md:col-span-2">
                  <label className={LABEL}>{t('admin.mailTemplates.fieldEvent')}</label>
                  <select
                    value={form.event}
                    onChange={(e) => setForm(f => ({ ...f, event: e.target.value }))}
                    className={INPUT}
                  >
                    <option value="">{t('admin.mailTemplates.eventPlaceholder')}</option>
                    {usableEvents.map((ev) => (
                      <option key={ev.event} value={ev.event}>
                        {t(`admin.mailTemplates.event.${ev.event}`)} — {t(`admin.mailTemplates.category${ev.category === CATEGORY_SCHEDULED ? 'Scheduled' : 'Action'}`)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-text-3">{t('admin.mailTemplates.fieldEventHint')}</p>
                </div>
              ) : (
                <div className="md:col-span-2">
                  <label className={LABEL}>{t('admin.mailTemplates.columnEvent')}</label>
                  <input value={form.event} disabled className={`${INPUT} opacity-60`} />
                </div>
              )}

              <div>
                <label className={LABEL}>{t('admin.mailTemplates.fieldSubject')}</label>
                <input value={form.subject} maxLength={300} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>{t('admin.mailTemplates.fieldPreheader')}</label>
                <input value={form.preheader} maxLength={300} onChange={(e) => setForm(f => ({ ...f, preheader: e.target.value }))} className={INPUT} />
              </div>

              <div className="md:col-span-2">
                <label className={LABEL}>{t('admin.mailTemplates.fieldBody')}</label>
                <textarea
                  ref={bodyRef}
                  value={form.body}
                  rows={12}
                  maxLength={20000}
                  onChange={(e) => setForm(f => ({ ...f, body: e.target.value }))}
                  className={`${INPUT} font-mono text-xs leading-relaxed`}
                />
                <div className="mt-2">
                  <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-text-3">
                    {t('admin.mailTemplates.variables')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {eventVars().map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVar(v)}
                        className="rounded-full border border-white/10 bg-bg-hover px-2 py-1 font-mono text-[10.5px] text-text-2 transition hover:border-primary/40 hover:text-primary"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className={LABEL}>{t('admin.mailTemplates.fieldCtaLabel')}</label>
                <input value={form.ctaLabel} maxLength={80} onChange={(e) => setForm(f => ({ ...f, ctaLabel: e.target.value }))} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>{t('admin.mailTemplates.fieldCtaUrl')}</label>
                <input value={form.ctaUrl} maxLength={500} placeholder="https://" onChange={(e) => setForm(f => ({ ...f, ctaUrl: e.target.value }))} className={INPUT} />
              </div>

              {editCategory === CATEGORY_SCHEDULED && (
                <>
                  <div className="md:col-span-2">
                    <label className={LABEL}>{t('admin.mailTemplates.audienceTitle')}</label>
                    <AudienceEditor value={form.audience} onChange={(a) => setForm(f => ({ ...f, audience: a }))} segments={segments} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={LABEL}>{t('admin.mailTemplates.scheduleTitle')}</label>
                    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-bg-deep/40 p-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-text-2">
                        <input
                          type="checkbox"
                          checked={form.schedule.enabled}
                          onChange={(e) => setForm(f => ({ ...f, schedule: { ...f.schedule, enabled: e.target.checked } }))}
                          className="rounded"
                        />
                        {t('admin.mailTemplates.scheduleEnabled')}
                      </label>
                      <div>
                        <label className={LABEL}>{t('admin.mailTemplates.scheduleInterval')}</label>
                        <input
                          type="number"
                          min={1}
                          max={8760}
                          value={form.schedule.intervalHours}
                          onChange={(e) => setForm(f => ({ ...f, schedule: { ...f.schedule, intervalHours: Number(e.target.value) } }))}
                          className={`${INPUT} max-w-[160px]`}
                        />
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-text-3">{t('admin.mailTemplates.scheduleHint')}</p>
                  </div>
                </>
              )}

              <label className="flex items-center gap-2 text-xs font-bold text-text-2">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm(f => ({ ...f, enabled: e.target.checked }))}
                  className="rounded"
                />
                {t('admin.mailTemplates.fieldEnabled')}
              </label>
            </div>

            {preview && (
              <div className="mt-4">
                <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-text-3">
                  {t('admin.mailTemplates.previewTitle')}
                </div>
                <div className="rounded-lg border border-white/10 bg-white p-2">
                  <div className="border-b border-black/10 pb-1 text-xs font-bold text-neutral-800">{preview.subject}</div>
                  <iframe title={t('admin.mailTemplates.previewTitle')} srcDoc={preview.html} className="h-72 w-full rounded bg-white" />
                </div>
                <p className="mt-1 text-[11px] text-text-3">{t('admin.mailTemplates.previewHint')}</p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setModal(null)} className={ADMIN_BTN}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={runPreview}
                disabled={previewing || !form.subject || !form.body}
                className={`${ADMIN_BTN} disabled:opacity-50`}
              >
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">visibility</span>
                {previewing ? t('common.loading') : t('admin.mailTemplates.preview')}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !form.name || !form.subject || !form.body || (modal === 'create' && !form.event)}
                className={`${ADMIN_BTN_PRIMARY} disabled:opacity-50`}
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Elle gönderim (yalnızca scheduled) ───────────────────────── */}
      {sendDoc && sendForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-bg-card p-6">
            <h2 className="mb-1 text-lg font-bold text-text-1">{t('admin.mailTemplates.sendTitle')}</h2>
            <p className="mb-4 text-xs text-text-3">{sendDoc.name}</p>

            <AudienceEditor value={sendForm} onChange={setSendForm} segments={segments} disabled={sending} />

            {sendResult && (
              <div className="mt-4 rounded-xl border border-success/30 bg-success/15 px-3 py-2.5 text-xs text-success">
                {t('admin.mailTemplates.sendResult', {
                  matched: (sendResult.matched ?? 0).toLocaleString(locale),
                  sent: (sendResult.sent ?? 0).toLocaleString(locale),
                  failed: (sendResult.failed ?? 0).toLocaleString(locale),
                })}
                {sendResult.truncated && (
                  <div className="mt-1 text-warning">{t('admin.mailTemplates.sendTruncated', { limit: sendResult.limit })}</div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setSendDoc(null)} className={ADMIN_BTN}>
                {sendResult ? t('common.close') : t('common.cancel')}
              </button>
              {!sendResult && (
                <button type="button" onClick={confirmSend} disabled={sending} className={`${ADMIN_BTN_PRIMARY} disabled:opacity-50`}>
                  <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">send</span>
                  {sending ? t('common.saving') : t('admin.mailTemplates.sendConfirm')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Gönderim geçmişi ─────────────────────────────────────────── */}
      <DetailDrawer
        open={logsOpen}
        onClose={() => setLogsOpen(false)}
        title={t('admin.mailTemplates.logsTitle')}
        subtitle={t('admin.mailTemplates.logsHint')}
      >
        {logsLoading ? (
          <p className="text-xs text-text-3">{t('common.loading')}</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-text-3">{t('admin.mailTemplates.logsEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log._id} className="rounded-lg border border-white/10 bg-bg-deep/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px] text-text-1">{log.to}</span>
                  <span className={`shrink-0 rounded-full px-2 py-[2px] text-[10px] font-extrabold uppercase ${
                    log.status === 'failed' ? 'bg-danger/20 text-danger'
                      : log.status === 'mock' ? 'bg-warning/20 text-warning'
                        : 'bg-success/15 text-success'
                  }`}>
                    {t(`admin.mailTemplates.status${log.status.charAt(0).toUpperCase()}${log.status.slice(1)}`)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-text-3">{log.subject}</div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-text-3">
                  <span>{t(TRIGGER_KEYS[log.trigger] || TRIGGER_KEYS.action)}</span>
                  <span>{log.sentAt ? new Date(log.sentAt).toLocaleString(locale) : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <AdminPager page={logsPage} pages={logsPages} onPage={setLogsPage} totalLabel={t('admin.mailTemplates.logsTitle')} />
      </DetailDrawer>
    </div>
  );
}
