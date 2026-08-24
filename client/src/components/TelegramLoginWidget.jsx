import { useEffect, useRef, useState } from 'react';
import api from '../services/api';

/**
 * P5 — Telegram Login Widget.
 *
 * Widget'ın `data-auth-url` modu kendiliğinden bir CSRF-state parametresi
 * eklemiyor — bu bileşen önce sunucudan taze bir state + bot kullanıcı adı
 * alır, sonra resmi Telegram script'ini bu state'i callback URL'sine
 * gömerek dinamik olarak DOM'a ekler. `botUsername` sunucuda
 * TELEGRAM_BOT_USERNAME tanımlı değilse hiçbir şey render edilmez —
 * kimlik bilgisi yapılandırılana kadar buton sessizce gizli kalır.
 */
export default function TelegramLoginWidget() {
  const containerRef = useRef(null);
  const [botUsername, setBotUsername] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/auth/telegram/widget-state').then(r => {
      if (cancelled || !r.data.botUsername) return;
      setBotUsername(r.data.botUsername);
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.async = true;
      script.setAttribute('data-telegram-login', r.data.botUsername);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-radius', '8');
      script.setAttribute('data-auth-url', `${window.location.origin}/api/auth/telegram/callback?state=${r.data.state}`);
      script.setAttribute('data-request-access', 'write');
      containerRef.current?.appendChild(script);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!botUsername) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
