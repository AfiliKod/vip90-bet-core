import { create } from 'zustand';
import api from '../services/api';
import { socket } from '../services/socket';

// key: "Country > League" (country boşsa sadece "League")
export function groupByLeague(events) {
  const map = new Map();
  for (const ev of events) {
    if (!ev.league) continue;
    const key = ev.country ? `${ev.country} > ${ev.league}` : ev.league;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ev);
  }
  return map;
}

export function leagueKey(sport, country, league) {
  return `${sport}|${country || ''}|${league}`;
}

export const useEventsStore = create((set, get) => ({
  events: [],
  isLoading: false,
  sport: 'all',
  statusFilter: '',
  setSport: (sport) => set({ sport }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  selectedSport: 'all',
  selectedLeague: null,
  setSportFilter: (sport) => set({ selectedSport: sport, selectedLeague: null, statusFilter: '' }),
  setLeagueFilter: (sport, league) => set({ selectedSport: sport, selectedLeague: league, statusFilter: '' }),
  fetchEvents: async (sport, status) => {
    // Elimizde zaten event varsa (sayfaya ikinci girişte store hâlâ dolu) "Yükleniyor"
    // ekranı göstermeden arka planda sessizce güncelle — stale-while-revalidate.
    set({ isLoading: get().events.length === 0 });
    try {
      const params = new URLSearchParams({ limit: '2000' });
      if (sport && sport !== 'all') params.set('sport', sport);
      if (status) params.set('status', status);
      const { data } = await api.get(`/events?${params}`);
      set({ events: data.events, isLoading: false });
    } catch { set({ isLoading: false }); }
  },
  updateEventOdds: (eventId, markets) => set(s => {
    const patch = arr => arr?.map(e => e._id === eventId ? { ...e, markets } : e);
    const leagueEvents = new Map();
    for (const [k, v] of s.leagueEvents) leagueEvents.set(k, patch(v));
    return { events: patch(s.events), leagueEvents, searchResults: s.searchResults ? patch(s.searchResults) : s.searchResults };
  }),
  updateEventScore: (eventId, score) => set(s => {
    const patch = arr => arr?.map(e => e._id === eventId ? { ...e, liveScore: score, status: e.status === 'finished' ? 'finished' : 'live' } : e);
    const leagueEvents = new Map();
    for (const [k, v] of s.leagueEvents) leagueEvents.set(k, patch(v));
    return { events: patch(s.events), leagueEvents, searchResults: s.searchResults ? patch(s.searchResults) : s.searchResults };
  }),
  initSocket: () => {
    socket.connect();
    socket.on('odds:update', ({ eventId, markets }) => get().updateEventOdds(eventId, markets));
    socket.on('score:update', ({ eventId, score }) => get().updateEventScore(eventId, score));
  },
  cleanup: () => {
    socket.off('odds:update');
    socket.off('score:update');
    socket.disconnect();
  },

  // ─── Lazy summary + lig fetch ───────────────────────────────
  summary: null,
  summaryLoading: false,
  summaryError: false,
  leagueEvents: new Map(),   // leagueKey -> Event[]
  loadingLeagues: new Set(), // leagueKey (o an fetch edilenler)
  failedLeagues: new Set(),  // leagueKey (kalıcı hataya düşenler — sonsuz refetch guard'ı)
  searchResults: null,       // null = arama yok; [] = sonuç yok
  searchLoading: false,

  fetchSummary: async (status = 'upcoming') => {
    set({ summaryLoading: true, summaryError: false });
    try {
      const { data } = await api.get(`/events/summary?status=${encodeURIComponent(status)}`);
      set({ summary: data, summaryLoading: false });
    } catch { set({ summaryLoading: false, summaryError: true }); }
  },

  fetchLeague: async (sport, country, league, status = 'upcoming') => {
    const key = leagueKey(sport, country, league);
    const { leagueEvents, loadingLeagues, failedLeagues } = get();
    if (leagueEvents.has(key) || loadingLeagues.has(key) || failedLeagues.has(key)) return; // idempotent
    const nextLoading = new Set(loadingLeagues); nextLoading.add(key);
    set({ loadingLeagues: nextLoading });
    try {
      const params = new URLSearchParams({ status, sport, league });
      params.set('country', country || '');
      const { data } = await api.get(`/events?${params}`);
      const nextEvents = new Map(get().leagueEvents); nextEvents.set(key, data.events);
      const doneLoading = new Set(get().loadingLeagues); doneLoading.delete(key);
      const patch = { leagueEvents: nextEvents, loadingLeagues: doneLoading };
      if (get().failedLeagues.has(key)) {
        const nf = new Set(get().failedLeagues); nf.delete(key);
        patch.failedLeagues = nf;
      }
      set(patch);
    } catch {
      const doneLoading = new Set(get().loadingLeagues); doneLoading.delete(key);
      const nf = new Set(get().failedLeagues); nf.add(key);
      set({ failedLeagues: nf, loadingLeagues: doneLoading });
    }
  },

  retryLeague: (sport, country, league, status = 'upcoming') => {
    const key = leagueKey(sport, country, league);
    const nf = new Set(get().failedLeagues); nf.delete(key);
    set({ failedLeagues: nf });
    get().fetchLeague(sport, country, league, status);
  },

  searchEvents: async (query, status = 'upcoming') => {
    const q = query.trim();
    if (q.length < 2) { set({ searchResults: null, searchLoading: false }); return; }
    set({ searchLoading: true });
    try {
      const params = new URLSearchParams({ status, search: q });
      const { data } = await api.get(`/events?${params}`);
      set({ searchResults: data.events, searchLoading: false });
    } catch { set({ searchResults: [], searchLoading: false }); }
  },

  clearSearch: () => set({ searchResults: null, searchLoading: false }),
}));
