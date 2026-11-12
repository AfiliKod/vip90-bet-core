import { create } from 'zustand';

function getStoredToken() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('platform_access_token');
  } catch {
    return null;
  }
}

function decodePayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function storeToken(token) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      localStorage.setItem('platform_access_token', token);
    } else {
      localStorage.removeItem('platform_access_token');
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

const storedToken = getStoredToken();
const initialDecoded = decodePayload(storedToken);

export const usePlatformAuthStore = create((set, get) => ({
  isAuthenticated: false,
  requires2fa: false,
  requires2faSetup: false,
  accessToken: storedToken,
  staff: initialDecoded ? { id: initialDecoded.sub, scope: initialDecoded.scp, scopeId: initialDecoded.sid } : null,
  challengeToken: null,
  setupToken: null,
  loading: false,
  error: null,

  handleLoginResponse: (data) => {
    if (data?.requires2faSetup) {
      set({
        requires2faSetup: true,
        setupToken: data.setupToken || null,
        requires2fa: false,
        challengeToken: null,
        isAuthenticated: false,
        error: null,
      });
      return;
    }

    if (data?.requires2fa) {
      set({
        requires2fa: true,
        challengeToken: data.challengeToken || null,
        requires2faSetup: false,
        setupToken: null,
        isAuthenticated: false,
        error: null,
      });
      return;
    }

    if (data?.accessToken) {
      storeToken(data.accessToken);
      const decoded = decodePayload(data.accessToken);
      let staff = data.staff ? { ...data.staff } : null;
      if (!staff && decoded) {
        staff = { id: decoded.sub, scope: decoded.scp, scopeId: decoded.sid };
      } else if (staff && decoded) {
        if (!staff.scope && decoded.scp) staff.scope = decoded.scp;
        if (!staff.scopeId && decoded.sid) staff.scopeId = decoded.sid;
      }

      set({
        isAuthenticated: true,
        accessToken: data.accessToken,
        staff,
        requires2fa: false,
        requires2faSetup: false,
        challengeToken: null,
        setupToken: null,
        error: null,
      });
    }
  },

  setAccessToken: (accessToken) => {
    storeToken(accessToken);
    const decoded = decodePayload(accessToken);
    set((state) => {
      let staff = state.staff ? { ...state.staff } : null;
      if (!staff && decoded) {
        staff = { id: decoded.sub, scope: decoded.scp, scopeId: decoded.sid };
      } else if (staff && decoded) {
        if (!staff.scope && decoded.scp) staff.scope = decoded.scp;
        if (!staff.scopeId && decoded.sid) staff.scopeId = decoded.sid;
      }
      return {
        accessToken,
        isAuthenticated: Boolean(accessToken),
        staff,
      };
    });
  },

  setStaff: (staff) => set((state) => ({
    staff: typeof staff === 'function' ? staff(state.staff) : staff,
  })),

  isPartnerScope: () => {
    const staff = get().staff;
    return staff?.scope === 'partner';
  },

  isPlatformScope: () => {
    const staff = get().staff;
    return staff?.scope === 'platform' || !staff?.scope;
  },

  setRequires2fa: (requires2fa, challengeToken = null) =>
    set({ requires2fa, challengeToken }),

  setRequires2faSetup: (requires2faSetup, setupToken = null) =>
    set({ requires2faSetup, setupToken }),

  setError: (error) => set({ error }),

  setLoading: (loading) => set({ loading }),

  logout: () => {
    storeToken(null);
    set({
      isAuthenticated: false,
      requires2fa: false,
      requires2faSetup: false,
      accessToken: null,
      staff: null,
      challengeToken: null,
      setupToken: null,
      loading: false,
      error: null,
    });
  },

  reset: () => {
    storeToken(null);
    set({
      isAuthenticated: false,
      requires2fa: false,
      requires2faSetup: false,
      accessToken: null,
      staff: null,
      challengeToken: null,
      setupToken: null,
      loading: false,
      error: null,
    });
  },
}));
