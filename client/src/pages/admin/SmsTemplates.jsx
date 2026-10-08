/**
 * SMS mesaj şablonları — CRUD + gönderim.
 *
 * İki tür şablon tek listede yönetilir ama davranışları farklıdır:
 *
 *   type='action'    Sistem mesajı. Bir olaya bağlıdır (kayıt, bahis sonucu,
 *                    casino oturum kar/zararı, yatırım, çekim, "we miss you").
 *                    PANELDEN GÖNDERİLEMEZ — tetikleyen domain kodudur.
 *   type='scheduled' Zamana duyarlı / kampanya mesajı (bonus, turuva, duyuru).
 *                    Panelden "Gönder" ile tek kullanıcıya, tüm kullanıcılara
 *                    veya bir segmente gönderilebilir. Ayrıca "Otomatik
 *                    Gönderim" açıksa 15 dakikalık iş `audience` kitleye
 *                    vadesi gelince otomatik gönderir (e-posta modeliyle aynı).
 *
 * Sağlayıcı kimlik bilgileri BURADA değil, Modüller → SMS Gateway kartındadır
 * (Modül açık/kapalı anahtarı da oradan yönetilir).
 *
 * Saf (DOM/React bağımsız) mantık `smsTemplateLogic.js` içinde — test edilebilir
 * olsun diye buradan ayrıldı (bkz. kpiTone.js deseni).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs, ADMIN_BTN, ADMIN_BTN_PRIMARY, ADMIN_BTN_GHOST } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableEmpty, AdminKpiCard, ActiveSwitch } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';
import AdminSmsSenders from './SmsSenders.jsx';
import { toKeySegment } from '../../utils/smsSenderLogic.js';
import { smsCharInfo, unknownPlaceholders, apiErrorMessage, TYPE_FILTERS, CATEGORIES, AUDIENCE_TYPES } from './smsTemplateLogic.js';

const EMPTY_FORM = {
  title: '', type: 'scheduled', eventKey: '', category: 'system', content: '', isActive: true,
  // Otomatik gönderim (yalnız scheduled): kitle + aralık. Elle gönderimde
  // seçilen kitle bu alanlara yazılmaz; buradaki değer job'un vadesi gelince
  // kime gideceğini belirler.
  audience: { type: 'all', segmentId: null, userIds: [] },
  schedule: { enabled: false, intervalHours: 168 },
};

export default function AdminSmsTemplates({ embedded = false }) {
  const { t, locale } = useTranslation();

  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') || 'templates';
  // Gömülü modda (İletişim → SMS) logs/sendres ayrı panellerdedir — dahili
  // şerit gizlenir, yalnız şablon listesi gösterilir. Normal modda main'in
  // senders sekmesi de korunur.
  const tab = embedded ? 'templates' : (['logs', 'senders'].includes(rawTab) ? rawTab : 'templates');

  const [data, setData] = useState(null);
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [formSegments, setFormSegments] = useState([]);
  const [send, setSend] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer.current);
  }, [search]);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data: res } = await api.get('/admin/sms/templates', { params: { search: debounced } });
      setData(res);
    } catch (e) {
      setError(apiErrorMessage(t, e));
    } finally {
      setLoading(false);
    }
  }, [debounced, t]);

  const loadLogs = useCallback(async () => {
    setError('');
    try {
      const { data: res } = await api.get('/admin/sms/logs', { params: { limit: 50 } });
      setLogs(res);
    } catch (e) {
      setError(apiErrorMessage(t, e));
    }
  }, [t]);

  // Tek effect: şablonlar her filtre değişiminde, günlük yalnız sekme açıkken
  // çekilir. İki ayrı effect yazmak aynı uyarı ailesini iki kez tetikler.
  useEffect(() => {
    load();
    if (tab === 'logs') loadLogs();
  }, [load, loadLogs, tab]);

  const events = data?.events ?? { action: [], scheduled: [] };
  const categories = data?.categories ?? CATEGORIES;

  const rows = useMemo(() => {
    const list = data?.templates ?? [];
    if (typeFilter === 'all') return list;
    return list.filter(tpl => tpl.type === typeFilter);
  }, [data, typeFilter]);

  function openCreate() {
    setError('');
    setNotice('');
    setForm({ ...EMPTY_FORM });
  }

  function openEdit(tpl) {
    setError('');
    setNotice('');
    setForm({
      _id: tpl._id, key: tpl.key, title: tpl.title, type: tpl.type,
      eventKey: tpl.eventKey ?? '', category: tpl.category, content: tpl.content, isActive: tpl.isActive,
      audience: {
        type: tpl.audience?.type ?? 'all',
        segmentId: tpl.audience?.segmentId ?? null,
        userIds: tpl.audience?.userIds ?? [],
      },
      schedule: {
        enabled: !!tpl.schedule?.enabled,
        intervalHours: tpl.schedule?.intervalHours ?? 168,
      },
    });
  }

  // Formdaki segment seçici için: scheduled + segment kitle açıldığında yükle.
  // İzlenen değerler extract edildi — exhaustive-deps `form`'u istememeli,
  // her tuş vuruşunda segment listesi yeniden çekilmemeli.
  const formType = form?.type;
  const formAudienceType = form?.audience?.type;
  useEffect(() => {
    if (formType !== 'scheduled' || formAudienceType !== 'segment') return;
    let alive = true;
    api.get('/admin/segments', { params: { limit: 100 } })
      .then(({ data }) => { if (alive) setFormSegments(data?.segments ?? []); })
      .catch(() => { if (alive) setFormSegments([]); });
    return () => { alive = false; };
  }, [formType, formAudienceType]);

  function eventOptions(type) {
    return type === 'action' ? events.action : events.scheduled;
  }

  function eventVariables(type, eventKey) {
    return eventOptions(type).find(e => e.key === eventKey)?.variables ?? [];
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title,
        type: form.type,
        eventKey: form.eventKey || null,
        category: form.category,
        content: form.content,
        isActive: form.isActive,
        // Otomatik gönderim kitle + vadesi yalnız scheduled şablonlarda yazılır;
        // aksiyon şablonlarına servis yine de reddeder (kapı çift taraflı).
        ...(form.type === 'scheduled' ? {
          audience: {
            type: form.audience?.type === 'segment' ? 'segment' : 'all',
            segmentId: form.audience?.type === 'segment' ? (form.audience?.segmentId || null) : null,
            userIds: [],
          },
          schedule: {
            enabled: !!form.schedule?.enabled,
            intervalHours: Math.max(1, Math.min(24 * 365, Number(form.schedule?.intervalHours) || 168)),
          },
        } : {}),
      };
      if (form._id) await api.patch(`/admin/sms/templates/${form._id}`, payload);
      else await api.post('/admin/sms/templates', payload);
      setForm(null);
      setNotice(t('admin.smsTemplates.saved'));
      load();
    } catch (e) {
      setError(apiErrorMessage(t, e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(tpl, next) {
    setError('');
    try {
      await api.patch(`/admin/sms/templates/${tpl._id}`, { isActive: next });
      load();
    } catch (e) {
      setError(apiErrorMessage(t, e));
    }
  }

  async function remove(tpl) {
    setError('');
    setNotice('');
    if (!window.confirm(t('admin.smsTemplates.deleteConfirm', { title: tpl.title }))) return;
    try {
      await api.delete(`/admin/sms/templates/${tpl._id}`);
      setNotice(t('admin.smsTemplates.deleted'));
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.smsTemplates.deleteError'));
    }
  }

  function openSend(tpl) {
    setError('');
    setNotice('');
    setSend({ tpl, audienceType: 'users', userIds: [], segmentId: '', variables: {}, userSearch: '', users: [], segments: [], sending: false });
    api.get('/admin/segments', { params: { limit: 100 } })
      .then(({ data }) => setSend(s => (s ? { ...s, segments: data?.segments ?? [] } : s)))
      .catch(() => {});
  }

  async function searchUsers(term) {
    if (!send) return;
    setSend(s => ({ ...s, userSearch: term }));
    if (term.trim().length < 2) {
      setSend(s => ({ ...s, users: [] }));
      return;
    }
    try {
      const { data: res } = await api.get('/admin/users', { params: { search: term.trim(), status: 'active', limit: 10 } });
      setSend(s => (s ? { ...s, users: res.users ?? [] } : s));
    } catch {
      setSend(s => (s ? { ...s, users: [] } : s));
    }
  }

  function toggleUser(userId) {
    setSend(s => ({
      ...s,
      userIds: s.userIds.includes(userId) ? s.userIds.filter(id => id !== userId) : [...s.userIds, userId],
    }));
  }

  async function submitSend() {
    if (!send) return;
    setSend(s => ({ ...s, sending: true }));
    setError('');
    try {
      const { data: res } = await api.post(`/admin/sms/templates/${send.tpl._id}/send`, {
        audienceType: send.audienceType,
        segmentId: send.segmentId || undefined,
        userIds: send.userIds,
        variables: send.variables,
      });
      setNotice(t('admin.smsTemplates.sendResult', {
        sent: res.sent, failed: res.failed, skipped: res.skipped, total: res.total,
      }));
      if (res.missing?.length) {
        setError(t('admin.smsTemplates.sendMissing', { vars: res.missing.join(', ') }));
      }
      if (res.skipReasons && Object.keys(res.skipReasons).length) {
        setNotice(t('admin.smsTemplates.sentWithSkips', {
          detail: Object.entries(res.skipReasons).map(([code, n]) => `${t(`admin.smsSenders.reason.${toKeySegment(code)}`)}: ${n}`).join(' · '),
        }));
      }
      setSend(null);
      load();
      if (tab === 'logs') loadLogs();
    } catch (e) {
      setError(apiErrorMessage(t, e));
      setSend(s => (s ? { ...s, sending: false } : s));
    }
  }

  const summary = data?.summary ?? { all: 0, active: 0, action: 0, scheduled: 0 };

  return (
    <div className={embedded ? '' : 'mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6'}>
      <AdminPageHeader
        embedded={embedded}
        crumbs={[{ label: t('admin.nav.groupEngagement') }, { label: t('admin.smsTemplates.title') }]}
        title={t('admin.smsTemplates.title')}
        sub={t('admin.smsTemplates.subtitle')}
        actions={(
          <button onClick={openCreate} className={ADMIN_BTN_PRIMARY}>
            <span className="material-symbols-outlined !text-[17px]" aria-hidden="true">add</span>
            {t('admin.smsTemplates.newTemplate')}
          </button>
        )}
      >
        {!embedded && (
          <AdminTabs
            value={tab}
            onChange={key => setParams({ tab: key })}
            items={[
              { key: 'templates', label: t('admin.smsTemplates.tabTemplates') },
              { key: 'senders', label: t('admin.smsTemplates.tabSenders') },
              { key: 'logs', label: t('admin.smsTemplates.tabLogs') },
            ]}
          />
        )}
      </AdminPageHeader>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">{error}</div>
      )}
      {notice && !error && (
        <div className="mb-4 p-3 rounded-lg bg-success/10 border border-success/30 text-sm text-success">{notice}</div>
      )}

      {tab === 'templates' && (
        <>
          <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: t('admin.smsTemplates.statTotal'), value: summary.all },
              { label: t('admin.smsTemplates.statActive'), value: summary.active },
              { label: t('admin.smsTemplates.statAction'), value: summary.action },
              { label: t('admin.smsTemplates.statScheduled'), value: summary.scheduled },
            ].map(k => (
              <AdminKpiCard key={k.label} label={k.label} value={k.value.toLocaleString(locale)} />
            ))}
          </section>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('admin.smsTemplates.searchPlaceholder')}
              className="h-[34px] flex-1 min-w-[220px] rounded-lg border border-white/10 bg-bg-card px-3 text-[13px] text-text-1 placeholder:text-text-3/60"
            />
            {TYPE_FILTERS.map(tp => (
              <button
                key={tp}
                onClick={() => setTypeFilter(tp)}
                className={`h-[34px] px-3 rounded-lg border text-[13px] font-bold transition ${
                  typeFilter === tp
                    ? 'border-primary/40 bg-primary/20 text-primary'
                    : 'border-white/10 bg-bg-card text-text-2 hover:bg-bg-hover'
                }`}
              >
                {t(`admin.smsTemplates.type.${tp === 'all' ? 'all' : tp}`)}
              </button>
            ))}
            {search && (
              <button onClick={() => setSearch('')} className={ADMIN_BTN_GHOST}>
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">close</span>
                {t('admin.smsTemplates.clearSearch')}
              </button>
            )}
          </div>

          {loading ? (
            <div className="rounded-xl border border-white/10 bg-bg-card p-4 text-sm text-text-3">{t('admin.smsTemplates.loading')}</div>
          ) : (
            <AdminTable
              columns={[
                { key: 'title', label: t('admin.smsTemplates.columnTemplate') },
                { key: 'type', label: t('admin.smsTemplates.columnType') },
                { key: 'event', label: t('admin.smsTemplates.columnEvent') },
                { key: 'content', label: t('admin.smsTemplates.columnContent') },
                { key: 'status', label: t('admin.smsTemplates.columnStatus') },
                { key: 'sent', label: t('admin.smsTemplates.columnSent'), align: 'right' },
                { key: 'actions', label: t('admin.smsTemplates.columnActions'), align: 'right' },
              ]}
            >
              {rows.length === 0 ? (
                <AdminTableEmpty colSpan={7}>{t('admin.smsTemplates.empty')}</AdminTableEmpty>
              ) : rows.map(tpl => {
                const info = smsCharInfo(tpl.content);
                const eventLabel = tpl.eventKey ? t(`admin.smsTemplates.event.${tpl.eventKey}`) : '—';
                return (
                  <AdminTableRow key={tpl._id} dimmed={!tpl.isActive}>
                    <AdminTableCell>
                      <div className="min-w-0">
                        <div className="truncate font-bold text-text-1">{tpl.title}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-text-3">{tpl.key}</div>
                      </div>
                    </AdminTableCell>
                    <AdminTableCell>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                        tpl.type === 'action'
                          ? 'border-info/30 bg-info/15 text-info'
                          : 'border-gold/30 bg-gold/15 text-gold'
                      }`}>
                        {t(`admin.smsTemplates.type.${tpl.type}`)}
                      </span>
                    </AdminTableCell>
                    <AdminTableCell>
                      <div className="text-xs text-text-2">{eventLabel}</div>
                      <div className="mt-0.5 text-[11px] text-text-3">{t(`admin.smsTemplates.category.${tpl.category}`)}</div>
                    </AdminTableCell>
                    <AdminTableCell>
                      <div className="max-w-[280px] truncate text-xs text-text-2">{tpl.content}</div>
                      <div className={`mt-0.5 text-[11px] ${info.overLimit ? 'text-warning' : 'text-text-3'}`}>
                        {t('admin.smsTemplates.charInfo', { segments: info.segments, chars: info.chars })}
                      </div>
                    </AdminTableCell>
                    <AdminTableCell>
                      <ActiveSwitch checked={tpl.isActive} onChange={next => toggleActive(tpl, next)} label={t('admin.smsTemplates.columnStatus')} />
                    </AdminTableCell>
                    <AdminTableCell align="right">
                      <div className="font-mono text-[13px] font-bold tabular-nums text-text-1">
                        {(tpl.sentCount ?? 0).toLocaleString(locale)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-text-3">
                        {tpl.lastSentAt ? new Date(tpl.lastSentAt).toLocaleString(locale) : t('admin.smsTemplates.neverSent')}
                      </div>
                    </AdminTableCell>
                    <AdminTableCell align="right">
                      {/* Satır aksiyonları repo standardı olan portal'lı
                          "⋮" menüsüne (RowActions) taşındı — tablonun
                          overflow-x-auto kapsayıcısında kesilmesin diye. */}
                      <div className="flex justify-end">
                        <RowActions items={[
                          {
                            key: 'send',
                            label: t('admin.smsTemplates.send'),
                            icon: 'send',
                            tone: 'success',
                            hidden: tpl.type !== 'scheduled',
                            onClick: () => openSend(tpl),
                          },
                          { key: 'edit', label: t('common.edit'), icon: 'edit', onClick: () => openEdit(tpl) },
                          { key: 'delete', label: t('common.delete'), icon: 'delete', tone: 'danger', onClick: () => remove(tpl) },
                        ]} />
                      </div>
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
            </AdminTable>
          )}
        </>
      )}

      {tab === 'senders' && <AdminSmsSenders embedded />}

      {tab === 'logs' && (
        <>
          <section className="mb-4 grid grid-cols-3 gap-3">
            {[
              { label: t('admin.smsTemplates.logSent'), value: logs?.summary?.sent ?? 0, tone: 'text-success' },
              { label: t('admin.smsTemplates.logFailed'), value: logs?.summary?.failed ?? 0, tone: 'text-danger' },
              { label: t('admin.smsTemplates.logSkipped'), value: logs?.summary?.skipped ?? 0, tone: 'text-text-3' },
            ].map(k => (
              <AdminKpiCard key={k.label} label={k.label} value={k.value.toLocaleString(locale)} tone={k.tone} />
            ))}
          </section>

          <AdminTable
            columns={[
              { key: 'time', label: t('admin.smsTemplates.columnTime') },
              { key: 'template', label: t('admin.smsTemplates.columnTemplate') },
              { key: 'recipient', label: t('admin.smsTemplates.columnRecipient') },
              { key: 'status', label: t('admin.smsTemplates.columnStatus') },
              { key: 'body', label: t('admin.smsTemplates.columnContent') },
            ]}
          >
            {(logs?.logs ?? []).length === 0 ? (
              <AdminTableEmpty colSpan={5}>{t('admin.smsTemplates.logEmpty')}</AdminTableEmpty>
            ) : (logs?.logs ?? []).map(log => (
              <AdminTableRow key={log._id}>
                <AdminTableCell>
                  <div className="font-mono text-xs text-text-2">{new Date(log.createdAt).toLocaleString(locale)}</div>
                </AdminTableCell>
                <AdminTableCell>
                  <div className="font-mono text-xs text-text-2">{log.templateKey ?? '—'}</div>
                </AdminTableCell>
                <AdminTableCell>
                  <div className="text-xs text-text-1">{log.username ?? '—'}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-text-3">{log.phone ?? '—'}</div>
                </AdminTableCell>
                <AdminTableCell>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                    log.status === 'sent' ? 'border-success/30 bg-success/15 text-success'
                      : log.status === 'failed' ? 'border-danger/30 bg-danger/15 text-danger'
                      : 'border-white/10 bg-white/5 text-text-3'
                  }`}>
                    {t(`admin.smsTemplates.sendStatus.${log.status}`)}
                  </span>
                  {log.skipReason && (
                    <div className="mt-0.5 max-w-[220px] text-[11px] text-warning">
                      {t(`admin.smsSenders.reason.${toKeySegment(log.skipReason)}`)}
                    </div>
                  )}
                  {log.errorMeaning && (
                    <div className="mt-0.5 max-w-[240px] text-[11px] text-danger">
                      {t(`admin.smsSenders.twilioError.${toKeySegment(log.errorMeaning)}`)}
                    </div>
                  )}
                  {log.twilioCode ? (
                    <div className="mt-0.5 font-mono text-[10px] text-text-3">Twilio {log.twilioCode}</div>
                  ) : log.error ? (
                    <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-danger">{log.error}</div>
                  ) : null}
                </AdminTableCell>
                <AdminTableCell>
                  <div className="max-w-[320px] truncate text-xs text-text-2">{log.body}</div>
                </AdminTableCell>
              </AdminTableRow>
            ))}
          </AdminTable>
        </>
      )}

      {/* ── Şablon formu ── */}
      {form && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setForm(null)}>
          <div className="bg-bg-card border border-white/10 rounded-xl p-5 max-w-lg w-full my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-primary/15 text-primary">
                <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">sms</span>
              </span>
              <div>
                <h2 className="text-sm font-extrabold text-text-1">
                  {form._id ? t('admin.smsTemplates.editTemplate') : t('admin.smsTemplates.newTemplate')}
                </h2>
                {form.key && <div className="mt-0.5 font-mono text-[11px] text-text-3">{form.key}</div>}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-[11px] uppercase font-bold text-text-3">
                {t('admin.smsTemplates.fieldTitle')}
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1 normal-case tracking-normal font-normal"
                />
              </label>

              <div>
                <div className="text-[11px] uppercase font-bold text-text-3 mb-1.5">{t('admin.smsTemplates.fieldType')}</div>
                <div className="flex gap-2">
                  {['action', 'scheduled'].map(tp => (
                    <label
                      key={tp}
                      className={`flex-1 flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 ${
                        form.type === tp ? 'border-primary/50 bg-primary/10' : 'border-white/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="smsType"
                        checked={form.type === tp}
                        onChange={() => setForm(f => ({ ...f, type: tp }))}
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-xs text-text-2">{t(`admin.smsTemplates.type.${tp}`)}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-text-3">{t(`admin.smsTemplates.typeHelp.${form.type}`)}</p>
              </div>

              <label className="block text-[11px] uppercase font-bold text-text-3">
                {t('admin.smsTemplates.fieldEvent')}
                <select
                  value={form.eventKey}
                  onChange={e => setForm(f => ({ ...f, eventKey: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1 normal-case tracking-normal font-normal"
                >
                  <option value="">{t('admin.smsTemplates.eventNone')}</option>
                  {eventOptions(form.type).map(ev => (
                    <option key={ev.key} value={ev.key}>{t(`admin.smsTemplates.event.${ev.key}`)}</option>
                  ))}
                </select>
              </label>

              <label className="block text-[11px] uppercase font-bold text-text-3">
                {t('admin.smsTemplates.fieldCategory')}
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1 normal-case tracking-normal font-normal"
                >
                  {categories.map(c => (
                    <option key={c} value={c}>{t(`admin.smsTemplates.category.${c}`)}</option>
                  ))}
                </select>
              </label>

              <div>
                <label className="block text-[11px] uppercase font-bold text-text-3">
                  {t('admin.smsTemplates.fieldContent')}
                  <textarea
                    rows={4}
                    value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder={t('admin.smsTemplates.contentPlaceholder')}
                    className="mt-1 w-full rounded-lg bg-bg-deep border border-white/10 px-3 py-2 text-sm text-text-1 normal-case tracking-normal font-normal leading-relaxed"
                  />
                </label>
                {(() => {
                  const info = smsCharInfo(form.content);
                  return (
                    <div className={`mt-1 text-[11px] ${info.overLimit ? 'text-warning' : 'text-text-3'}`}>
                      {t('admin.smsTemplates.charInfo', { segments: info.segments, chars: info.chars })}
                    </div>
                  );
                })()}
              </div>

              {unknownPlaceholders(form.content, eventVariables(form.type, form.eventKey)).length > 0 && (
                <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/30 text-[11px] text-warning">
                  {t('admin.smsTemplates.unknownVars', { vars: unknownPlaceholders(form.content, eventVariables(form.type, form.eventKey)).join(', ') })}
                </div>
              )}

              <div>
                <div className="text-[11px] uppercase font-bold text-text-3 mb-1.5">{t('admin.smsTemplates.availableVars')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {eventVariables(form.type, form.eventKey).length === 0 && (
                    <span className="text-[11px] text-text-3">{t('admin.smsTemplates.noVars')}</span>
                  )}
                  {eventVariables(form.type, form.eventKey).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, content: `${f.content}{{${v}}}` }))}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-text-2 hover:border-primary/40 hover:text-primary transition"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Otomatik gönderim (yalnız scheduled) ── */}
              {form.type === 'scheduled' && (
                <div className="rounded-xl border border-white/10 bg-bg-deep/40 p-3 space-y-3">
                  <div className="text-[11px] uppercase font-bold text-text-3">{t('admin.smsTemplates.autoSection')}</div>
                  <div className="flex items-center gap-2">
                    <ActiveSwitch
                      checked={!!form.schedule?.enabled}
                      onChange={next => setForm(f => ({ ...f, schedule: { ...f.schedule, enabled: next } }))}
                      label={t('admin.smsTemplates.autoEnabled')}
                    />
                    <span className="text-xs text-text-2">{t('admin.smsTemplates.autoEnabled')}</span>
                  </div>
                  {!!form.schedule?.enabled && (
                    <label className="block text-[11px] uppercase font-bold text-text-3">
                      {t('admin.smsTemplates.autoInterval')}
                      <input
                        type="number"
                        min={1}
                        max={24 * 365}
                        value={form.schedule?.intervalHours ?? 168}
                        onChange={e => setForm(f => ({
                          ...f,
                          schedule: { ...f.schedule, intervalHours: Math.max(1, Math.min(24 * 365, Number(e.target.value) || 168)) },
                        }))}
                        className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1 normal-case tracking-normal font-normal"
                      />
                    </label>
                  )}
                  <div>
                    <div className="text-[11px] uppercase font-bold text-text-3 mb-1.5">{t('admin.smsTemplates.audience')}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {['all', 'segment'].map(at => (
                        <button
                          key={at}
                          type="button"
                          onClick={() => setForm(f => ({
                            ...f,
                            audience: { ...f.audience, type: at, segmentId: at === 'segment' ? (f.audience?.segmentId ?? null) : null },
                          }))}
                          className={`rounded-lg px-2.5 py-1.5 text-[11.5px] font-extrabold transition ${
                            form.audience?.type === at
                              ? 'bg-primary/20 text-primary shadow-[0_0_0_1px_rgba(0,212,255,0.35)]'
                              : 'border border-white/10 bg-bg-hover text-text-3 hover:text-text-1'
                          }`}
                        >
                          {t(`admin.smsTemplates.audienceType.${at}`)}
                        </button>
                      ))}
                    </div>
                    {form.audience?.type === 'segment' && (
                      <select
                        value={form.audience?.segmentId || ''}
                        onChange={e => setForm(f => ({ ...f, audience: { ...f.audience, segmentId: e.target.value || null } }))}
                        className="mt-2 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1 normal-case tracking-normal font-normal"
                      >
                        <option value="">{t('admin.smsTemplates.segmentNone')}</option>
                        {formSegments.map(seg => (
                          <option key={seg._id} value={seg._id}>{seg.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <p className="text-[11px] text-text-3">{t('admin.smsTemplates.autoHint')}</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <ActiveSwitch checked={form.isActive} onChange={next => setForm(f => ({ ...f, isActive: next }))} label={t('admin.smsTemplates.fieldActive')} />
                <span className="text-xs text-text-2">{t('admin.smsTemplates.fieldActive')}</span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setForm(null)} className={ADMIN_BTN}>{t('common.cancel')}</button>
              <button onClick={save} disabled={saving} className={ADMIN_BTN_PRIMARY}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Gönderim ── */}
      {send && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => !send.sending && setSend(null)}>
          <div className="bg-bg-card border border-white/10 rounded-xl p-5 max-w-lg w-full my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-success/15 text-success">
                <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">send</span>
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-extrabold text-text-1">{t('admin.smsTemplates.sendTitle')}</h2>
                <div className="mt-0.5 truncate text-xs text-text-3">{send.tpl.title}</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-[11px] uppercase font-bold text-text-3 mb-1.5">{t('admin.smsTemplates.audience')}</div>
                <div className="grid gap-2">
                  {AUDIENCE_TYPES.map(at => (
                    <label
                      key={at}
                      className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 ${
                        send.audienceType === at ? 'border-primary/50 bg-primary/10' : 'border-white/10'
                      }`}
                    >
                      <input
                        type="radio"
                        name="audienceType"
                        checked={send.audienceType === at}
                        onChange={() => setSend(s => ({ ...s, audienceType: at }))}
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-xs text-text-2">{t(`admin.smsTemplates.audienceType.${at}`)}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-text-3">{t('admin.smsTemplates.audienceHint', { max: data?.maxRecipients ?? 0 })}</p>
              </div>

              {send.audienceType === 'users' && (
                <div>
                  <div className="text-[11px] uppercase font-bold text-text-3 mb-1.5">
                    {t('admin.smsTemplates.pickUsers', { n: send.userIds.length })}
                  </div>
                  <input
                    value={send.userSearch}
                    onChange={e => searchUsers(e.target.value)}
                    placeholder={t('admin.smsTemplates.userSearchPlaceholder')}
                    className="w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1"
                  />
                  {send.users.length > 0 && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-white/10 p-1">
                      {send.users.map(u => (
                        <label key={u._id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={send.userIds.includes(u._id)}
                            onChange={() => toggleUser(u._id)}
                            className="accent-primary"
                          />
                          <span className="text-xs text-text-1 truncate">{u.username}</span>
                          <span className="ml-auto font-mono text-[11px] text-text-3 truncate">
                            {u.phone || t('admin.smsTemplates.noPhone')}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {send.audienceType === 'segment' && (
                <div>
                  <div className="text-[11px] uppercase font-bold text-text-3 mb-1.5">{t('admin.smsTemplates.pickSegment')}</div>
                  <select
                    value={send.segmentId}
                    onChange={e => setSend(s => ({ ...s, segmentId: e.target.value }))}
                    className="w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1"
                  >
                    <option value="">{t('admin.smsTemplates.segmentNone')}</option>
                    {send.segments.map(seg => (
                      <option key={seg._id} value={seg._id}>
                        {seg.name} ({seg.stats?.playerCount ?? 0})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(() => {
                const vars = eventVariables(send.tpl.type, send.tpl.eventKey).filter(v => v !== 'username');
                if (!vars.length) return null;
                return (
                  <div>
                    <div className="text-[11px] uppercase font-bold text-text-3 mb-1.5">{t('admin.smsTemplates.variables')}</div>
                    <div className="space-y-2">
                      {vars.map(v => (
                        // `normal-case`: placeholder küçük harf duyarlı —
                        // {{amount}} ile {{AMOUNT}} farklı değişkenler.
                        <label key={v} className="block text-[11px] uppercase font-bold text-text-3">
                          <span className="font-mono normal-case tracking-normal">{`{{${v}}}`}</span>
                          <input
                            value={send.variables[v] ?? ''}
                            onChange={e => setSend(s => ({ ...s, variables: { ...s.variables, [v]: e.target.value } }))}
                            className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1 normal-case tracking-normal font-normal"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setSend(null)} disabled={send.sending} className={ADMIN_BTN}>{t('common.cancel')}</button>
              <button
                onClick={submitSend}
                disabled={send.sending || (send.audienceType === 'users' && !send.userIds.length) || (send.audienceType === 'segment' && !send.segmentId)}
                className={ADMIN_BTN_PRIMARY}
              >
                {send.sending ? t('admin.smsTemplates.sending') : t('admin.smsTemplates.send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}