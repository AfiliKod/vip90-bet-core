import { io } from 'socket.io-client';
import api from './api';

/**
 * `/chat` namespace'ine JWT-token auth ile bağlanır. Root `socket.js`
 * (cookie-auth) deseninden farklı — `/chat` sunucu tarafında token bekliyor,
 * bu yüzden `games/Crash.jsx`'teki `/crash` namespace bağlantı deseni
 * (auth token + connect_error üzerinde refresh retry) birebir taklit edilir.
 */
export function connectChatSocket(token, { onAuthFailed } = {}) {
  let refreshAttempted = false;
  const authToken = localStorage.getItem('accessToken') ?? token;
  // forceNew: root socket.js'in aynı origin'e "autoConnect:false" ile kurduğu
  // paylaşılan Manager'ı miras almasın diye — aksi halde /chat namespace'i
  // bağlı bir Manager bulana kadar (kullanıcı ana socket'e bağlanana kadar)
  // hiç connect/connect_error event'i tetiklemeden sessizce askıda kalıyordu.
  const sock = io('/chat', { auth: { token: authToken }, forceNew: true });

  sock.on('connect_error', async (err) => {
    if (err.message === 'auth' && !refreshAttempted) {
      refreshAttempted = true;
      try {
        const { data } = await api.post('/auth/refresh');
        localStorage.setItem('accessToken', data.accessToken);
        sock.auth.token = data.accessToken;
        sock.connect();
      } catch {
        onAuthFailed?.();
      }
    }
  });

  return sock;
}
