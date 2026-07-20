import axios from 'axios';
import { useToastStore } from '../store/toastStore';
import { coordinatedRefresh } from './refreshCoordinator';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('accessToken');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  async err => {
    const isRefreshEndpoint = err.config?.url?.includes('/auth/refresh');
    if (err.response?.status === 401 && !err.config._retry && !isRefreshEndpoint) {
      // Login olmadan gezinme mümkün olduğu için (bkz. ProtectedRoute), misafir bir
      // kullanıcının auth gerektiren bir endpoint'e (örn. Casino'daki Palace çağrıları)
      // isteği de 401 dönebiliyor — bu bir "oturum sona erdi" durumu DEĞİL, hiç login
      // olunmamış demek. Sadece daha önce gerçek bir accessToken varsa (yani bir zamanlar
      // giriş yapılmışsa) session-expiry uyarısı/yönlendirmesi tetiklenmeli.
      const hadToken = !!localStorage.getItem('accessToken');
      err.config._retry = true;
      try {
        // Single-flight: eşzamanlı 401'ler tek bir /auth/refresh çağrısını paylaşır.
        // Aksi halde sunucunun tokenVersion rotasyonu, ikinci ve sonraki refresh'leri
        // "TOKEN_REVOKED" ile reddedip session geçerliyken spurious logout tetikliyordu.
        const { data } = await coordinatedRefresh(
          () => axios.post('/api/auth/refresh', {}, { withCredentials: true }),
        );
        localStorage.setItem('accessToken', data.accessToken);
        err.config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(err.config);
      } catch {
        localStorage.removeItem('accessToken');
        // authStore state'ini de temizle — route guard'ları ve menü user'a bağlı,
        // 1.5s'lik hard-reload'a güvenmek yerine anında logout durumunu yansıt.
        try {
          const { useAuthStore } = await import('../store/authStore');
          useAuthStore.getState().clearAuth();
        } catch { /* store yüklenememişse hard-reload zaten toparlar */ }
        if (hadToken && window.location.pathname !== '/login') {
          useToastStore.getState().add('Oturumunuz sona erdi, lütfen tekrar giriş yapın.', 'error');
          setTimeout(() => { window.location.href = '/login'; }, 1500);
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;
