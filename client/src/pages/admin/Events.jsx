import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import { useToastStore } from '../../store/toastStore';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { AdminTabs } from '../../components/admin/AdminPageHeader.jsx';
import { AdminPager } from '../../components/admin/AdminTable.jsx';
import { sportCategoryOptions } from '../../constants/sportCategories.js';
import ConnectionSettingsLink from './components/ConnectionSettingsLink.jsx';
import OddsCategoriesSettings from './components/OddsCategoriesSettings.jsx';

const STATUS_BADGE = {
  live: 'bg-danger/20 text-danger',
  finished: 'bg-white/10 text-text-3',
  upcoming: 'bg-success/15 text-success',
  cancelled: 'bg-danger/10 text-danger',
};
const STATUS_LABEL_KEY = {
  live: 'admin.events.statusLive',
  finished: 'admin.events.statusFinished',
  upcoming: 'admin.events.statusUpcoming',
  cancelled: 'admin.events.statusCancelled',
};
// Durum metni çevrilir; API'den bilinmeyen bir status gelirse ham değeri
// göster (veri değeri — key'e çevrilemez).
function statusLabel(t, status) {
  return STATUS_LABEL_KEY[status] ? t(STATUS_LABEL_KEY[status]) : status;
}
// Çifte şans gibi marketlerde bir maç sonucunda AYNI ANDA birden fazla seçenek kazanabilir
// (örn. ev sahibi kazanınca hem "1X" hem "12"). Bu marketler tek seçim yerine çoklu işaretleme
// (checkbox) ile sonuçlandırılır — bkz. settlement.js'in array-tipli results desteği.
const MULTI_WINNER_MARKETS = ['çifte_şans'];

function SportFilterSelect({ value, onChange, allLabel }) {
  const { t, locale } = useTranslation();
  const options = sportCategoryOptions(locale || 'tr', allLabel || t('common.all'));
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={t('admin.events.sportFilterLabel')}
      className="h-9 bg-bg-card border border-white/10 rounded-lg px-3 text-sm text-text-1 focus:outline-none focus:border-primary/40"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function ActiveEvents() {
  const { t, locale } = useTranslation();
  const [events, setEvents] = useState([]);
  const [settling, setSettling] = useState(null);
  const [sportFilter, setSportFilter] = useState('all');
  const addToast = useToastStore(s => s.add);
  const { register, handleSubmit } = useForm();

  const load = () => api.get('/events?full=1').then(r => setEvents(r.data.events)).catch(() => {});
  useEffect(() => { load(); }, []);

  const filteredEvents = sportFilter === 'all'
    ? events
    : events.filter(e => e.sport === sportFilter);

  const onSettle = async (eventId, data) => {
    try {
      const results = {};
      const score = data._score;
      Object.entries(data).forEach(([k, v]) => {
        if (k === '_score') return;
        if (Array.isArray(v)) { if (v.length) results[k] = v; }
        else if (v) results[k] = v;
      });
      await api.post(`/admin/events/${eventId}/settle`, { results, score });
      addToast(t('admin.events.settled'), 'success');
      setSettling(null);
      load();
    } catch (e) { addToast(e.response?.data?.error?.message || t('common.error'), 'error'); }
  };

  return (
    <div className="space-y-3">
      <div className="mb-1 flex items-center gap-2">
        <SportFilterSelect value={sportFilter} onChange={setSportFilter} />
        <span className="inline-flex h-7 items-center rounded-full border border-white/10 bg-bg-card px-2.5 font-mono text-xs font-bold tabular-nums text-text-3">
          {filteredEvents.length}
        </span>
      </div>
      {filteredEvents.map(e => (
        <div key={e._id} className="rounded-xl border border-white/10 bg-bg-card p-4 transition hover:border-white/20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-text-1">{e.homeTeam.name} vs {e.awayTeam.name}</span>
                <span className={`rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase ${STATUS_BADGE[e.status] || STATUS_BADGE.finished}`}>
                  {statusLabel(t, e.status)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-3">
                <span>{e.leagueFlag} {e.league}</span>
                {e.startTime && (
                  <span className="font-mono">
                    {new Date(e.startTime).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                )}
              </div>
            </div>
            {e.status !== 'cancelled' && (
              <button
                onClick={() => setSettling(settling === e._id ? null : e._id)}
                aria-expanded={settling === e._id}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-warning/30 bg-warning/20 px-2.5 text-xs font-bold text-warning transition hover:bg-warning/30"
              >
                <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">how_to_reg</span>
                {t('admin.events.settle')}
              </button>
            )}
          </div>
          {settling === e._id && (
            <form onSubmit={handleSubmit(d => onSettle(e._id, d))} className="mt-4 space-y-2 rounded-[10px] border border-white/5 bg-bg-base p-3">
              <p className="text-xs text-text-3 mb-3">{t('admin.events.pickWinnerHint')}</p>
              {e.markets.map(m => (
                <div key={m.type} className="flex items-center gap-2">
                  <label className="text-xs text-text-2 w-36 shrink-0">{m.label}</label>
                  {MULTI_WINNER_MARKETS.includes(m.type) ? (
                    <div className="flex-1 flex flex-wrap gap-3">
                      {m.odds.map(o => (
                        <label key={o.id} className="flex items-center gap-1 text-xs text-text-1">
                          <input type="checkbox" value={o.id} {...register(m.type)} />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <select {...register(m.type)} className="flex-1 bg-bg-card border border-white/10 rounded px-2 py-1.5 text-xs text-text-1">
                      <option value="">{t('admin.events.selectEllipsis')}</option>
                      {m.odds.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  )}
                </div>
              ))}
              <input {...register('_score')} placeholder={t('admin.events.scorePlaceholder')} className="w-full bg-bg-card border border-white/10 rounded px-3 py-1.5 text-xs text-text-1 mt-2" />
              <button type="submit" className="w-full py-2 bg-warning text-bg-deep font-semibold rounded-lg text-xs hover:opacity-90 transition mt-2">
                {t('admin.events.confirmAndSettle')}
              </button>
            </form>
          )}
        </div>
      ))}
      {!filteredEvents.length && (
        <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
          <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">event_busy</span>
          <div className="mt-2 text-sm text-text-3">{t('admin.events.noneFound')}</div>
        </div>
      )}
    </div>
  );
}

function ArchivedEvents() {
  const { t, locale } = useTranslation();
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef(null);

  const load = async (p = 1, q = search, sport = sportFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 30 });
      if (q) params.set('search', q);
      if (sport && sport !== 'all') params.set('sport', sport);
      const r = await api.get(`/admin/events/archived?${params}`);
      setEvents(r.data.events);
      setTotal(r.data.total);
      setPages(r.data.pages);
      setPage(p);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(1, '', 'all'); }, []);

  // 300 ms debounce — Users/Segments/Agents ile aynı davranış (her tuşta
  // istek atmak yerine yazma durduğunda bir kez).
  const onSearch = (v) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(1, v, sportFilter), 300);
  };

  const handleSportChange = (sport) => {
    setSportFilter(sport);
    load(1, search, sport);
  };

  return (
    <div className="space-y-3">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[300px]">
          <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
          <input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder={t('bahis.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
        </label>
        <SportFilterSelect value={sportFilter} onChange={handleSportChange} />
        <button
          type="button"
          onClick={() => { clearTimeout(searchTimer.current); setSearch(''); load(1, '', 'all'); setSportFilter('all'); }}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-bold text-text-3 transition hover:text-text-1"
        >
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">close</span>
          {t('common.reset')}
        </button>
      </div>

      <p className="mb-3 text-xs font-semibold text-text-3">{t('admin.events.totalArchived', { count: total })}</p>

      {loading && (
        <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-8 text-center text-sm text-text-3">{t('common.loading')}</div>
      )}

      {!loading && events.map(e => (
        <div key={e._id} className="rounded-xl border border-white/5 bg-bg-card p-4 opacity-80 transition hover:border-white/15">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-text-1">{e.homeTeam.name} vs {e.awayTeam.name}</span>
                <span className="rounded-full bg-white/10 px-2 py-[3px] text-[10.5px] font-extrabold uppercase text-text-3">{statusLabel(t, e.status)}</span>
                {e.result?.score && (
                  <span className="rounded-full bg-primary/15 px-2 py-[3px] font-mono text-[11px] font-extrabold text-primary">
                    {t('admin.events.score')}: {e.result.score}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-text-3">{e.leagueFlag} {e.league}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-xs text-text-3">
                {new Date(e.startTime).toLocaleDateString(locale)}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-text-3/80">
                {t('admin.events.archived')}: {new Date(e.archivedAt).toLocaleDateString(locale)}
              </div>
            </div>
          </div>
        </div>
      ))}

      {!loading && !events.length && (
        <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center">
          <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">search_off</span>
          <div className="mt-2 text-sm text-text-3">{t('admin.events.noArchivedFound')}</div>
        </div>
      )}

      <AdminPager
        page={page}
        pages={pages}
        onPage={load}
        totalLabel={t('admin.events.countLine', {
          count: total.toLocaleString(locale),
          page,
          pages,
        })}
      />
    </div>
  );
}

const TAB_KEYS = ['active', 'archived', 'categories'];

export default function AdminEvents() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab') || 'active';
  const tab = TAB_KEYS.includes(rawTab) ? rawTab : 'active';
  const setTab = key => setParams(key === 'active' ? {} : { tab: key });

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupProducts') }, { label: t('admin.events.title') }]}
        title={t('admin.events.title')}
        actions={<ConnectionSettingsLink />}
      >
        <AdminTabs
          items={[
            { key: 'active', label: t('admin.events.activeEvents') },
            { key: 'archived', label: t('admin.events.archive') },
            { key: 'categories', label: t('admin.events.tabCategories') },
          ]}
          value={tab}
          onChange={setTab}
        />
      </AdminPageHeader>

      {tab === 'active' && <ActiveEvents />}
      {tab === 'archived' && <ArchivedEvents />}
      {tab === 'categories' && <OddsCategoriesSettings />}
    </div>
  );
}
