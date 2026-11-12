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

export const partnerClient = axios.create({
  baseURL: '/api/partner',
  withCredentials: true,
});

function attachAuthInterceptors(instance) {
  instance.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  instance.interceptors.response.use(
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
            return instance(originalRequest);
          }
        } catch (refreshErr) {
          usePlatformAuthStore.getState().logout();
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.href = '/console/login';
          }
          return Promise.reject(refreshErr);
        }
      }

      return Promise.reject(error);
    }
  );
}

attachAuthInterceptors(apiClient);
attachAuthInterceptors(partnerClient);

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

export const partnerApi = {
  me: async () => {
    const res = await partnerClient.get('/me');
    return res.data;
  },
  listTenants: async () => {
    const res = await partnerClient.get('/tenants');
    return res.data;
  },
  getTenant: async (id) => {
    const res = await partnerClient.get(`/tenants/${id}`);
    return res.data;
  },
  provisionTenant: async (data) => {
    const res = await partnerClient.post('/tenants', data);
    return res.data;
  },
  changeTenantStatus: async (id, status, reason) => {
    const res = await partnerClient.patch(`/tenants/${id}/status`, { status, reason });
    return res.data;
  },
  reissueOwnerInvite: async (id) => {
    const res = await partnerClient.post(`/tenants/${id}/owner-invite`);
    return res.data;
  },
  getPortfolioMetrics: async (params) => {
    const res = await partnerClient.get('/metrics', { params });
    return res.data;
  },
  getTenantMetrics: async (id, params) => {
    const res = await partnerClient.get(`/tenants/${id}/metrics`, { params });
    return res.data;
  },
  updateIntegrations: async (id, data) => {
    const res = await partnerClient.put(`/tenants/${id}/integrations`, data);
    return res.data;
  },
  listStaff: async () => {
    const res = await partnerClient.get('/staff');
    return res.data;
  },
  inviteStaff: async (data) => {
    const res = await partnerClient.post('/staff', data);
    return res.data;
  },
  suspendStaff: async (id) => {
    const res = await partnerClient.patch(`/staff/${id}/suspend`);
    return res.data;
  },
};

export const partnersApi = {
  list: async () => {
    const res = await apiClient.get('/partners');
    return res.data;
  },
  get: async (id) => {
    const res = await apiClient.get(`/partners/${id}`);
    return res.data;
  },
  create: async (data) => {
    const res = await apiClient.post('/partners', data);
    return res.data;
  },
  update: async (id, data) => {
    const res = await apiClient.patch(`/partners/${id}`, data);
    return res.data;
  },
};

export default apiClient;
