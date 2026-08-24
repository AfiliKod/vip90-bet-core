import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useTranslation } from '../i18n';

/**
 * P5 — Google/Telegram OAuth redirect'inin indiği sayfa.
 *
 * Sunucu callback'i işleyip (kullanıcı bul/oluştur, refresh cookie set et)
 * accessToken'ı bu sayfaya query param olarak ekleyerek yönlendirir; burada
 * token localStorage'a yazılır ve authStore.init() (App.jsx'te zaten
 * çalışıyor) zenginleştirilmiş kullanıcı nesnesini /auth/refresh ile
 * tamamlar.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const addToast = useToastStore(s => s.add);
  const init = useAuthStore(s => s.init);

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      addToast(t('auth.walletLoginFailed'), 'error');
      navigate('/login', { replace: true });
      return;
    }
    if (token) {
      localStorage.setItem('accessToken', token);
      init().then(() => navigate('/', { replace: true }));
    } else {
      navigate('/login', { replace: true });
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#05080f' }}>
      <div className="text-text-2 text-sm">{t('common.wait')}…</div>
    </div>
  );
}
