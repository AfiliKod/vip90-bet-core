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
    set({ isLoading: true });
    try {
      const params = new URLSearchParams({ limit: '2000' });
      if (sport && sport !== 'all') params.set('sport', sport);
      if (status) params.set('status', status);
      const { data } = await api.get(`/events?${params}`);
      set({ events: data.events, isLoading: false });
    } catch { set({ isLoading: false }); }
  },
  updateEventOdds: (eventId, markets) => set(s => ({
    events: s.events.map(e => e._id === eventId ? { ...e, markets } : e)
  })),
  updateEventScore: (eventId, score) => set(s => ({
    events: s.events.map(e => e._id === eventId ? { ...e, liveScore: score, status: e.status === 'finished' ? 'finished' : 'live' } : e)
  })),
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
}));
