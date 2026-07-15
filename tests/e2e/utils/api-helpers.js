const API_URL = process.env.E2E_API_URL || 'http://localhost:3000/api';

class ApiClient {
  constructor() {
    this.token = null;
    this.baseURL = API_URL;
  }

  setToken(token) {
    this.token = token;
  }

  async request(method, path, data = null, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const url = `${this.baseURL}${path}`;
    const config = { method, headers };

    if (data) {
      config.body = JSON.stringify(data);
    }

    if (options.withCredentials) {
      config.credentials = 'include';
    }

    const response = await fetch(url, config);
    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(responseData.error?.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = responseData;
      throw error;
    }

    return responseData;
  }

  get(path, options) { return this.request('GET', path, null, options); }
  post(path, data, options) { return this.request('POST', path, data, options); }
  put(path, data, options) { return this.request('PUT', path, data, options); }
  delete(path, options) { return this.request('DELETE', path, null, options); }

  // Auth
  async login(username, password) {
    const data = await this.post('/auth/login', { username, password });
    if (data.accessToken) this.setToken(data.accessToken);
    return data;
  }

  async register(userData) {
    return this.post('/auth/register', userData);
  }

  async refresh() {
    const data = await this.post('/auth/refresh', {}, { withCredentials: true });
    if (data.accessToken) this.setToken(data.accessToken);
    return data;
  }

  async logout() {
    await this.post('/auth/logout', {});
    this.token = null;
  }

  // Events
  async getEvents(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.get(`/events?${query}`);
  }

  async getEvent(id) {
    return this.get(`/events/${id}`);
  }

  // Bets
  async placeBet(selections, type, stake) {
    return this.post('/bets', { selections, type, stake });
  }

  async getBet(id) {
    return this.get(`/bets/${id}`);
  }

  async getMyBets(status = null) {
    const query = status ? `?status=${status}` : '';
    return this.get(`/users/me/bets${query}`);
  }

  // User
  async getMe() {
    return this.get('/users/me');
  }

  async getBalance() {
    const data = await this.get('/users/me');
    return data.user?.balance || 0;
  }

  // Admin (if available)
  async settleEvent(eventId, results) {
    return this.post(`/admin/events/${eventId}/settle`, { results });
  }

  async setEventStatus(eventId, status) {
    return this.post(`/admin/events/${eventId}/status`, { status });
  }
}

export const api = new ApiClient();

export async function loginUser(username, password) {
  return api.login(username, password);
}

export async function registerUser(userData) {
  return api.register(userData);
}

export async function getAuthToken(username, password) {
  const data = await api.login(username, password);
  return data.accessToken;
}

export function setApiToken(token) {
  api.setToken(token);
}