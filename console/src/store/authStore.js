import { create } from 'zustand';

function getStoredToken() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('platform_access_token');
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

export const usePlatformAuthStore = create((set) => ({
  isAuthenticated: false,
  requires2fa: false,
  requires2faSetup: false,
  accessToken: getStoredToken(),
  staff: null,
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
      set({
        isAuthenticated: true,
        accessToken: data.accessToken,
        staff: data.staff || null,
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
    set({
      accessToken,
      isAuthenticated: Boolean(accessToken),
    });
  },

  setStaff: (staff) => set({ staff }),

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
