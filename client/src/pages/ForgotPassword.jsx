import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Swal from 'sweetalert2';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Bir hata oluştu';
      Swal.fire({
        icon: 'error', title: 'Hata', text: msg,
        confirmButtonColor: '#00d4ff', background: '#0c1220', color: '#f0f4ff',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative" style={{ background: '#05080f' }}>
      <div className="absolute inset-0 bg-cover bg-center opacity-20 pointer-events-none" style={{ backgroundImage: 'url(/images/login-bg.png)' }} />
      <div className="w-full max-w-sm bg-bg-card border border-white/10 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔑</div>
          <h1 className="text-xl font-bold text-text-1">Şifre Sıfırlama</h1>
          <p className="text-text-2 text-sm mt-1">
            {sent ? 'E-posta gönderildi' : 'E-posta adresinizi girin, size sıfırlama bağlantısı gönderelim'}
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="p-4 rounded-lg text-sm" style={{ background: '#00d4ff11', border: '1px solid #00d4ff33', color: '#c8d8f0' }}>
              E-posta adresinize şifre sıfırlama bağlantısı gönderildi. Lütfen gelen kutunuzu kontrol edin.
            </div>
            <Link to="/login"
              className="inline-block px-6 py-3 rounded-xl text-sm font-bold text-black shadow-lg"
              style={{ background: 'linear-gradient(90deg, #00d4ff, #7c3aed)' }}
            >
              ← Girişe Dön
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="E-posta adresiniz" required
              className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition"
            />
            <button
              type="submit" disabled={submitting || !email}
              className="w-full bg-gradient-to-r from-primary to-accent text-bg-deep font-semibold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting ? 'Gönderiliyor...' : 'Sıfırlama Bağlantısı Gönder'}
            </button>
            <div className="text-center">
              <Link to="/login" className="text-xs underline" style={{ color: '#7c8aae' }}>
                ← Girişe Dön
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}