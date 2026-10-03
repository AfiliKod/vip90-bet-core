import axios from 'axios';
import { useToastStore } from '../store/toastStore';
import { coordinatedRefresh } from './refreshCoordinator';
import { createI18nCore, dictionaries, DEFAULT_LOCALE } from '../i18n';

// React dışı (axios interceptor) bağlamda çeviri — useTranslation() burada
// kullanılamaz, I18nProvider'ın kullandığı aynı locale okuma mantığını
// (localStorage) tekrarlayan hafif bir yardımcı.
function tOutsideReact(key) {
  let locale = DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem('locale');
    if (stored && dictionaries[stored]) locale = stored;
  } catch { /* localStorage yoksa varsayılan dille devam */ }
  return createI18nCore({ dictionaries, defaultLocale: locale, fallbackLocale: DEFAULT_LOCALE }).t(key);
}

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Misafir uçları kimlik doğrulamaz ve sunucuda guestOnly ile korunur: localStorage'da
// kalmış eski bir accessToken buraya sızarsa, oturumu olmayan kullanıcı kendi giriş/
// şifre sıfırlama isteğini 403 ALREADY_AUTHENTICATED'e düşürür.
const GUEST_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password'];

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('accessToken');
  const isGuestEndpoint = GUEST_ENDPOINTS.some(path => cfg.url?.startsWith(path));
  if (token && !isGuestEndpoint) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  async err => {
    const isRefreshEndpoint = err.config?.url?.includes('/auth/refresh');
    if (err.response?.status === 401 && !err.config._retry && !isRefreshEndpoint) {
      // Login olmadan gezinme mümkün olduğu için (bkz. ProtectedRoute), misafir bir
      // kullanıcının auth gerektiren bir endpoint'e (örn. Casino'daki Igames çağrıları)
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
          useToastStore.getState().add(tOutsideReact('common.sessionExpired'), 'error');
          setTimeout(() => { window.location.href = '/login'; }, 1500);
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;
