import { create } from 'zustand';
import api from '../services/api';
import { socket } from '../services/socket';

function connectUserSocket(userId, role) {
  if (!socket.connected) socket.connect();
  socket.emit('subscribe:user', { userId });
  if (role === 'admin') socket.emit('subscribe:admin', { userId });
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
      connectUserSocket(data.user._id || data.user.id, data.user.role);
    } catch {
      // Depolama ile state ayrışmasın: refresh reddedildiyse elde kalan accessToken
      // artık bir oturumu temsil etmiyor.
      localStorage.removeItem('accessToken');
      set({ user: null, token: null, isLoading: false });
    }
  },
  login: async (username, password, turnstileToken) => {
    const { data } = await api.post('/auth/login', {
      username, password,
      ...(turnstileToken ? { turnstileToken } : {}),
    });
    localStorage.setItem('accessToken', data.accessToken);
    set({ user: data.user, token: data.accessToken });
    connectUserSocket(data.user._id || data.user.id, data.user.role);
    return data.user;
  },
  // P6 — cüzdanla giriş. window.ethereum (MetaMask vb.) üzerinden adres alır,
  // sunucudan tek kullanımlık nonce ister, mesajı imzalatır, imzayı doğrular.
  loginWithWallet: async () => {
    if (!window.ethereum) {
      const err = new Error('WALLET_NOT_FOUND');
      err.code = 'WALLET_NOT_FOUND';
      throw err;
    }
    const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const { data: nonceData } = await api.post('/auth/wallet/nonce', { address });
    const message = nonceData.message;
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, address],
    });
    const { data } = await api.post('/auth/wallet/login', {
      address, signature, message, walletType: 'metamask',
    });
    localStorage.setItem('accessToken', data.accessToken);
    set({ user: data.user, token: data.accessToken });
    connectUserSocket(data.user._id || data.user.id, data.user.role);
    return data.user;
  },
  register: async (username, email, password, consents = {}, referredBy, extraFields = {}) => {
    const { data } = await api.post('/auth/register', {
      username, email, password,
      acceptedTerms: consents.acceptedTerms,
      acceptedKvkk: consents.acceptedKvkk,
      consentVersion: consents.consentVersion,
      ...(referredBy ? { referredBy } : {}),
      ...(extraFields.phone ? { phone: extraFields.phone } : {}),
      ...(extraFields.dateOfBirth ? { dateOfBirth: extraFields.dateOfBirth } : {}),
      ...(extraFields.turnstileToken ? { turnstileToken: extraFields.turnstileToken } : {}),
    });
    // Task 1: register() artık doğrulanmamış kullanıcı için accessToken döndürmüyor —
    // sadece varsa (ileride backend davranışı değişirse diye login() ile simetrik kalınır) oturum açılır.
    if (data.accessToken) {
      localStorage.setItem('accessToken', data.accessToken);
      set({ user: data.user, token: data.accessToken });
      connectUserSocket(data.user._id || data.user.id, data.user.role);
    }
    return data;
  },
  logout: async () => {
    const state = useAuthStore.getState();
    disconnectUserSocket(state.user?._id || state.user?.id);
    await api.post('/auth/logout');
    localStorage.removeItem('accessToken');
    set({ user: null, token: null });
  },
  // Sunucuya /auth/logout ÇAĞIRMADAN yerel oturum durumunu temizler.
  // 401 interceptor'ı kullanır: sunucu zaten session'ı reddetti, tek yapılacak
  // istemci state'ini (guard'ların/menünün baktığı user) anında sıfırlamak.
  clearAuth: () => {
    const state = useAuthStore.getState();
    disconnectUserSocket(state.user?._id || state.user?.id);
    localStorage.removeItem('accessToken');
    set({ user: null, token: null });
  },
  setUser: (user) => set({ user }),
  updateBalance: (balance) => set(s => ({ user: s.user ? { ...s.user, balance } : null })),
  updateBonusBalance: (bonusBalance) => set(s => ({ user: s.user ? { ...s.user, bonusBalance } : null })),
}));
