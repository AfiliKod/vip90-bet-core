import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import Swal from 'sweetalert2';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { LEGAL_VERSION } from '../data/legalContent';
import api from '../services/api';
import { useTranslation } from '../i18n/I18nProvider.jsx';
import LanguageSwitcher from '../i18n/LanguageSwitcher.jsx';

export default function Login() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const refUsername = searchParams.get('ref');
  const [tab, setTab] = useState(searchParams.get('tab') === 'register' ? 'register' : 'login');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedKvkk, setAcceptedKvkk] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [resendStatus, setResendStatus] = useState('idle'); // idle | sending | sent
  const [devVerifyUrl, setDevVerifyUrl] = useState(null); // sadece dev: local'de SMTP yokken mail linkini göster
  const { login, register: registerFn } = useAuthStore();
  const addToast = useToastStore(s => s.add);
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm();

  const canSubmitRegister = acceptedTerms && acceptedKvkk;

  const onSubmit = async (data) => {
    try {
      if (tab === 'login') {
        const user = await login(data.username, data.password);
        const redirect = searchParams.get('redirect');
        navigate(user.role === 'admin' ? '/admin' : (redirect || '/'));
      } else {
        if (!canSubmitRegister) {
          addToast('Devam etmek için tüm onayları tamamlamalısınız.', 'error');
          return;
        }
        const result = await registerFn(data.username, data.email, data.password, {
          acceptedTerms,
          acceptedKvkk,
          consentVersion: LEGAL_VERSION,
        }, (data.referredBy?.trim() || refUsername || undefined));
        if (result.accessToken) {
          navigate('/');
        } else {
          // Task 1: register() artık doğrulanmadan oturum açmıyor — login ile aynı kart gösterilir.
          setUnverifiedEmail(data.email);
          if (import.meta.env.DEV && result.devVerifyUrl) setDevVerifyUrl(result.devVerifyUrl);
        }
      }
    } catch (e) {
      const errData = e.response?.data?.error;
      const msg = errData?.message;
      const status = e.response?.status;
      if (status === 401) {
        addToast('Kullanıcı adı veya şifre hatalı.', 'error');
      } else if (status === 429) {
        addToast('Çok fazla deneme. Lütfen biraz bekleyin.', 'error');
      } else if (status === 403 && errData?.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(errData.details?.email || data.username);
      } else if (status === 400 && errData?.code === 'VALIDATION_ERROR' && errData?.details) {
        const fieldErrors = errData.details.fieldErrors || {};
        const issues = Object.entries(fieldErrors);
        if (!issues.length && errData.details.formErrors?.length) {
          issues.push(['form', errData.details.formErrors]);
        }
        if (issues.length) {
          const lines = issues
            .flatMap(([field, msgs]) => msgs.map(m => `• ${field === 'form' ? '' : field + ': '}${m}`))
            .join('\n');
          Swal.fire({
            icon: 'error',
            title: 'Kayıt Bilgileriniz Geçersiz',
            html: `<pre style="text-align:left;font-size:13px;line-height:1.6;color:#ccc;background:#111;padding:12px;border-radius:8px;white-space:pre-wrap">${lines}</pre>`,
            confirmButtonText: 'Tamam',
            confirmButtonColor: '#00d4ff',
            background: '#0c1220',
            color: '#f0f4ff',

          });
          return;
        }
        addToast(msg || 'Geçersiz veri', 'error');
      } else if (tab === 'register') {
        Swal.fire({
          icon: 'error',
          title: 'Kayıt Başarısız',
          text: msg || 'Bilinmeyen bir hata oluştu',
          confirmButtonText: 'Tamam',
          confirmButtonColor: '#00d4ff',
          background: '#0c1220',
          color: '#f0f4ff',
        });
      } else {
        addToast(msg || 'Giriş yapılamadı, lütfen tekrar deneyin.', 'error');
      }
    }
  };

  async function handleResendVerification() {
    setResendStatus('sending');
    try {
      const { data } = await api.post('/auth/resend-verification', { email: unverifiedEmail });
      setResendStatus('sent');
      if (import.meta.env.DEV && data.devVerifyUrl) setDevVerifyUrl(data.devVerifyUrl);
    } catch {
      setResendStatus('idle');
      addToast('Gönderilemedi, lütfen tekrar deneyin.', 'error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative"
      style={{
        background: '#05080f',
      }}>
      <div className="absolute inset-0 bg-cover bg-center opacity-20 pointer-events-none"
        style={{ backgroundImage: 'url(/images/login-bg-v2.png)' }} />
      <div className="w-full max-w-sm bg-bg-card border border-white/10 rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-end mb-2">
          <LanguageSwitcher />
        </div>
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💎</div>
          <h1 className="text-2xl font-bold text-text-1">VIP90.bet</h1>
          <p className="text-text-2 text-sm mt-1">Spor Bahis Platformu</p>
        </div>

        {unverifiedEmail ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#c8d8f0' }}>
              <strong style={{ color: '#f0f4ff' }}>{unverifiedEmail}</strong> adresini henüz doğrulamadınız. Giriş yapabilmek için email adresinizi doğrulamanız gerekiyor.
            </div>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendStatus !== 'idle'}
              className="w-full bg-gradient-to-r from-primary to-accent text-bg-deep font-semibold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {resendStatus === 'sending' ? 'Gönderiliyor...' : resendStatus === 'sent' ? 'Gönderildi ✓' : 'Doğrulama Emailini Tekrar Gönder'}
            </button>
            {devVerifyUrl && (
              <div className="p-3 rounded-lg text-xs break-all" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)', color: '#8ab4d8' }}>
                <strong style={{ color: '#00d4ff' }}>DEV:</strong> SMTP yapılandırılmadığı için mail gönderilmedi.{' '}
                <a href={devVerifyUrl} className="underline" style={{ color: '#00d4ff' }}>Doğrulama linkine git</a>
              </div>
            )}
            <div className="text-center">
              <button
                type="button"
                onClick={() => { setUnverifiedEmail(null); setResendStatus('idle'); }}
                className="text-xs underline"
                style={{ color: '#7c8aae' }}
              >
                ← Girişe Dön
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex mb-6 bg-bg-base rounded-lg p-1">
              {['login', 'register'].map(tabId => (
                <button key={tabId} onClick={() => setTab(tabId)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === tabId ? 'bg-accent text-white' : 'text-text-2 hover:text-text-1'}`}>
                  {tabId === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <input {...register('username', { required: true })} placeholder={t('auth.username')}
                className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
              {tab === 'register' && refUsername && (
                <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 text-xs text-text-2">
                  🎉 <strong className="text-accent">{refUsername}</strong> sizi davet etti
                </div>
              )}
              {tab === 'register' && (
                <input {...register('email', { required: true })} type="email" placeholder="E-posta"
                  className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
              )}
              {tab === 'register' && (
                <input {...register('referredBy')} defaultValue={refUsername || ''} placeholder="Referans kullanıcısı (opsiyonel)"
                  className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
              )}
              <div>
                <div className="relative">
                  <input {...register('password', { required: true })} type={showPassword ? 'text' : 'password'} placeholder="Şifre"
                    className="w-full bg-bg-base border border-white/10 rounded-lg pl-4 pr-10 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition"
                    style={{ color: '#7c8aae' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#00d4ff'}
                    onMouseLeave={e => e.currentTarget.style.color = '#7c8aae'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <path d="M1 1l22 22" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {tab === 'login' && (
                  <div className="flex justify-end mt-1.5">
                    <Link to="/forgot-password"
                      className="text-[11px] font-semibold underline transition"
                      style={{ color: '#7c8aae' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#00d4ff'}
                      onMouseLeave={e => e.currentTarget.style.color = '#7c8aae'}
                    >
                      Şifremi Unuttum
                    </Link>
                  </div>
                )}
              </div>

              {/* Kayıt onayları */}
              {tab === 'register' && (
                <div className="space-y-2 pt-2">
                  <ConsentCheckbox
                    checked={acceptedTerms}
                    onChange={setAcceptedTerms}
                    label={
                      <>
                        <Link to="/legal/terms" target="_blank" className="underline" style={{ color: '#00d4ff' }}>Kullanım Koşulları</Link>{' '}
                        ve{' '}
                        <Link to="/legal/privacy" target="_blank" className="underline" style={{ color: '#00d4ff' }}>Gizlilik Politikası</Link>'nı okudum, kabul ediyorum
                      </>
                    }
                  />
                  <ConsentCheckbox
                    checked={acceptedKvkk}
                    onChange={setAcceptedKvkk}
                    label={
                      <>
                        <Link to="/legal/kvkk" target="_blank" className="underline" style={{ color: '#00d4ff' }}>KVKK Aydınlatma Metni</Link>{' '}
                        kapsamında kişisel verilerimin işlenmesini kabul ediyorum
                      </>
                    }
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || (tab === 'register' && !canSubmitRegister)}
                className="w-full bg-gradient-to-r from-primary to-accent text-bg-deep font-semibold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isSubmitting ? 'Bekleyin...' : (tab === 'login' ? 'Giriş Yap' : 'Kayıt Ol')}
              </button>
            </form>

            {/* Footer linkler */}
            <div className="mt-6 pt-4 border-t border-white/[0.06] text-[10px] text-center" style={{ color: '#4a5a78' }}>
              Kayıt olarak{' '}
              <Link to="/legal/user-agreement" target="_blank" className="underline" style={{ color: '#00d4ff' }}>
                kullanıcı sözleşmemizi
              </Link>{' '}
              kabul etmiş sayılırsınız.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConsentCheckbox({ checked, onChange, label }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer group">
      <div className="pt-0.5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 rounded cursor-pointer accent-cyan-400"
        />
      </div>
      <div className="text-[11px] leading-relaxed" style={{ color: '#c8d8f0' }}>
        {label}
      </div>
    </label>
  );
}
