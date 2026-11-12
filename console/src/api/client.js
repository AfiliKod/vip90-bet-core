import axios from 'axios';
import { usePlatformAuthStore } from '../store/authStore.js';

let refreshPromise = null;

function getAccessToken() {
  const stateToken = usePlatformAuthStore.getState().accessToken;
  if (stateToken) return stateToken;
  if (typeof window !== 'undefined') {
    try {
      return localStorage.getItem('platform_access_token');
    } catch {
      return null;
    }
  }
  return null;
}

export const apiClient = axios.create({
  baseURL: '/api/platform',
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    const is401 = error.response?.status === 401;
    const isRefreshCall = originalRequest.url?.includes('/api/staff/auth/refresh');

    if (is401 && !originalRequest._retry && !isRefreshCall) {
      originalRequest._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post('/api/staff/auth/refresh', {}, { withCredentials: true })
            .then((res) => {
              const newToken = res.data?.accessToken;
              if (newToken) {
                usePlatformAuthStore.getState().setAccessToken(newToken);
                if (res.data?.staff) {
                  usePlatformAuthStore.getState().setStaff(res.data.staff);
                }
              }
              return newToken;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }

        const newToken = await refreshPromise;
        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshErr) {
        usePlatformAuthStore.getState().logout();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

// Staff authentication API endpoints (outside /api/platform base)
export const authApi = {
  login: async ({ username, password }) => {
    const res = await axios.post('/api/staff/auth/login', { username, password }, { withCredentials: true });
    return res.data;
  },
  challengeVerify: async ({ challengeToken, code }) => {
    const res = await axios.post(
      '/api/staff/auth/2fa/challenge-verify',
      { challengeToken, code },
      { withCredentials: true }
    );
    return res.data;
  },
  setup2fa: async (setupToken) => {
    const headers = setupToken ? { Authorization: `Bearer ${setupToken}` } : {};
    const res = await axios.post('/api/staff/auth/2fa/setup', {}, { headers, withCredentials: true });
    return res.data;
  },
  confirm2fa: async ({ secret, token }, setupToken) => {
    const headers = setupToken ? { Authorization: `Bearer ${setupToken}` } : {};
    const res = await axios.post(
      '/api/staff/auth/2fa/confirm',
      { secret, token },
      { headers, withCredentials: true }
    );
    return res.data;
  },
  refresh: async () => {
    const res = await axios.post('/api/staff/auth/refresh', {}, { withCredentials: true });
    return res.data;
  },
  me: async () => {
    const token = getAccessToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await axios.get('/api/staff/auth/me', { headers, withCredentials: true });
    return res.data;
  },
  logout: async () => {
    try {
      await axios.post('/api/staff/auth/logout', {}, { withCredentials: true });
    } finally {
      usePlatformAuthStore.getState().logout();
    }
  },
};

export default apiClient;
