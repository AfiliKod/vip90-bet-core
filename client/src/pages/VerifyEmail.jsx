import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Swal from 'sweetalert2';
import { useTranslation } from '../i18n';

export default function VerifyEmail() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [resendEmail, setResendEmail] = useState('');
  const [resendSubmitting, setResendSubmitting] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.post('/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  async function handleResend(e) {
    e.preventDefault();
    setResendSubmitting(true);
    try {
      await api.post('/auth/resend-verification', { email: resendEmail });
      setResendSent(true);
    } catch (err) {
      const msg = err.response?.data?.error?.message || t('common.error');
      Swal.fire({
        icon: 'error', title: t('common.errorTitle'), text: msg,
        confirmButtonColor: '#00d4ff', background: '#0c1220', color: '#f0f4ff',
      });
    } finally {
      setResendSubmitting(false);
    }
  }

  const isError = !token || status === 'error';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative" style={{ background: '#05080f' }}>
      <div className="absolute inset-0 bg-cover bg-center opacity-20 pointer-events-none" style={{ backgroundImage: 'url(/images/login-bg-v2.png)' }} />
      <div className="w-full max-w-sm bg-bg-card border border-white/10 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">{status === 'success' ? '✅' : isError ? '⚠️' : '⏳'}</div>
          <h1 className="text-xl font-bold text-text-1">{t('verifyEmail.title')}</h1>
        </div>

        {status === 'verifying' && token && (
          <p className="text-center text-sm" style={{ color: '#8899bb' }}>{t('verifyEmail.verifying')}</p>
        )}

        {status === 'success' && (
          <div className="text-center space-y-4">
            <div className="p-4 rounded-lg text-sm" style={{ background: '#00d4ff11', border: '1px solid #00d4ff33', color: '#c8d8f0' }}>
              {t('verifyEmail.success')}
            </div>
            <Link to="/login" className="inline-block px-6 py-3 rounded-xl text-sm font-bold text-black shadow-lg" style={{ background: 'linear-gradient(90deg, #00d4ff, #7c3aed)' }}>
              {t('verifyEmail.backToLogin')}
            </Link>
          </div>
        )}

        {isError && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#c8d8f0' }}>
              {t('verifyEmail.invalidOrExpired')}
            </div>
            {resendSent ? (
              <p className="text-center text-xs" style={{ color: '#8899bb' }}>{t('verifyEmail.resendSent')}</p>
            ) : (
              <form onSubmit={handleResend} className="space-y-3">
                <input
                  type="email" value={resendEmail} onChange={e => setResendEmail(e.target.value)}
                  placeholder={t('verifyEmail.emailPlaceholder')} required
                  className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition"
                />
                <button
                  type="submit" disabled={resendSubmitting || !resendEmail}
                  className="w-full bg-gradient-to-r from-primary to-accent text-bg-deep font-semibold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {resendSubmitting ? t('profile.sending') : t('verifyEmail.sendVerificationEmail')}
                </button>
              </form>
            )}
            <div className="text-center">
              <Link to="/login" className="text-xs underline" style={{ color: '#7c8aae' }}>← {t('verifyEmail.backToLogin')}</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
