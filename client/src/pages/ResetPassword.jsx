import { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Swal from 'sweetalert2';
import { useTranslation } from '../i18n';

export default function ResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) {
      Swal.fire({ icon: 'error', title: t('common.error'), text: t('resetPassword.mismatch'), confirmButtonColor: '#00d4ff', background: '#0c1220', color: '#f0f4ff' });
      return;
    }
    if (password.length < 8) {
      Swal.fire({ icon: 'error', title: t('common.error'), text: t('resetPassword.minLength'), confirmButtonColor: '#00d4ff', background: '#0c1220', color: '#f0f4ff' });
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      Swal.fire({ icon: 'success', title: t('resetPassword.changedTitle'), text: t('resetPassword.changedText'), confirmButtonColor: '#00d4ff', background: '#0c1220', color: '#f0f4ff' })
        .then(() => navigate('/login'));
    } catch (err) {
      const msg = err.response?.data?.error?.message || t('resetPassword.genericError');
      Swal.fire({ icon: 'error', title: t('common.error'), text: msg, confirmButtonColor: '#00d4ff', background: '#0c1220', color: '#f0f4ff' });
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#05080f' }}>
        <div className="text-center text-text-2">
          <div className="text-4xl mb-3">⚠️</div>
          <p>{t('resetPassword.invalidLink')}</p>
          <Link to="/forgot-password" className="text-sm underline mt-2 inline-block" style={{ color: '#00d4ff' }}>{t('resetPassword.tryAgain')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative" style={{ background: '#05080f' }}>
      <div className="absolute inset-0 bg-cover bg-center opacity-20 pointer-events-none" style={{ backgroundImage: 'url(/images/login-bg-v2.png)' }} />
      <div className="w-full max-w-sm bg-bg-card border border-white/10 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🔐</div>
          <h1 className="text-xl font-bold text-text-1">{t('resetPassword.title')}</h1>
          <p className="text-text-2 text-sm mt-1">{t('resetPassword.subtitle')}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder={t('resetPassword.newPassword')} required minLength={8}
            className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder={t('resetPassword.repeatPassword')} required
            className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
          <button type="submit" disabled={submitting || !password || !confirm}
            className="w-full bg-gradient-to-r from-primary to-accent text-bg-deep font-semibold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition">
            {submitting ? t('resetPassword.changing') : t('resetPassword.changeButton')}
          </button>
        </form>
      </div>
    </div>
  );
}
