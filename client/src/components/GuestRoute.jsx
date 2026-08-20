import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

function FullScreenMessage({ children }) {
  return (
    <div className="min-h-screen bg-bg-deep flex items-center justify-center text-text-2">
      {children}
    </div>
  );
}

/** Açık yönlendirme koruması: yalnızca site içi mutlak yollara izin ver. */
function safeRedirect(target) {
  if (!target || !target.startsWith('/') || target.startsWith('//')) return '/';
  return target;
}

/**
 * Yalnızca misafirlerin görebileceği sayfalar (giriş, kayıt, şifre sıfırlama talebi).
 *
 * endSession=true olan sayfalar e-postadaki tek kullanımlık bağlantılarla açılır.
 * Oturumu açık kullanıcıyı geri çevirmek yerine önce oturumunu kapatırız: meşru
 * kullanıcı akışı kesintisiz sürdürür, açık oturum ile token akışı hiçbir noktada
 * iç içe geçmez.
 */
export default function GuestRoute({ children, endSession = false }) {
  const { user, isLoading, logout, clearAuth } = useAuthStore();
  const location = useLocation();
  const ending = useRef(false);

  useEffect(() => {
    if (!endSession || !user || ending.current) return;
    ending.current = true;
    (async () => {
      try { await logout(); } catch { clearAuth(); }
    })();
  }, [endSession, user, logout, clearAuth]);

  if (isLoading) return <FullScreenMessage>Yükleniyor...</FullScreenMessage>;

  if (user) {
    if (endSession) return <FullScreenMessage>Oturumunuz kapatılıyor...</FullScreenMessage>;
    const target = new URLSearchParams(location.search).get('redirect');
    return <Navigate to={safeRedirect(target)} replace />;
  }

  return children;
}
