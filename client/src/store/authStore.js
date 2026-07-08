import { create } from 'zustand';
import api from '../services/api';
import { socket } from '../services/socket';

function connectUserSocket(userId) {
  if (!socket.connected) socket.connect();
  socket.emit('subscribe:user', { userId });
}

function disconnectUserSocket(userId) {
  if (userId) socket.emit('unsubscribe:user', { userId });
}

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem('accessToken'),
  isLoading: true,
  init: async () => {
    try {
      const { data } = await api.post('/auth/refresh');
      localStorage.setItem('accessToken', data.accessToken);
      set({ user: data.user, token: data.accessToken, isLoading: false });
      connectUserSocket(data.user._id || data.user.id);
    } catch { set({ user: null, token: null, isLoading: false }); }
  },
  login: async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('accessToken', data.accessToken);
    set({ user: data.user, token: data.accessToken });
    connectUserSocket(data.user._id || data.user.id);
    return data.user;
  },
  register: async (username, email, password, consents = {}, referredBy) => {
    const { data } = await api.post('/auth/register', {
      username, email, password,
      acceptedTerms: consents.acceptedTerms,
      acceptedKvkk: consents.acceptedKvkk,
      consentVersion: consents.consentVersion,
      ...(referredBy ? { referredBy } : {}),
    });
    localStorage.setItem('accessToken', data.accessToken);
    set({ user: data.user, token: data.accessToken });
    connectUserSocket(data.user._id || data.user.id);
    return data.user;
  },
  logout: async () => {
    const state = useAuthStore.getState();
    disconnectUserSocket(state.user?._id || state.user?.id);
    await api.post('/auth/logout');
    localStorage.removeItem('accessToken');
    set({ user: null, token: null });
  },
  setUser: (user) => set({ user }),
  updateBalance: (balance) => set(s => ({ user: s.user ? { ...s.user, balance } : null })),
  updateBonusBalance: (bonusBalance) => set(s => ({ user: s.user ? { ...s.user, bonusBalance } : null })),
}));
