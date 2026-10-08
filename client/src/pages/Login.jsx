import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import BirthDatePicker from '../components/form/BirthDatePicker.jsx';
import PhoneInput from '../components/form/PhoneInput.jsx';
import Swal from 'sweetalert2';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { useBrandingStore } from '../store/brandingStore';
import { LEGAL_VERSION } from '../data/legalContent';
import api from '../services/api';
import { useTranslation } from '../i18n';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import TelegramLoginWidget from '../components/TelegramLoginWidget';
import { useTurnstile } from '../components/TurnstileWidget';

export default function Login() {
  const { t } = useTranslation();
  const siteName = useBrandingStore(s => s.siteName) || 'VIP90.bet';
  const [searchParams] = useSearchParams();
  const refUsername = searchParams.get('ref');
  const [tab, setTab] = useState(searchParams.get('tab') === 'register' ? 'register' : 'login');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedKvkk, setAcceptedKvkk] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);
  const [resendStatus, setResendStatus] = useState('idle'); // idle | sending | sent
  const [devVerifyUrl, setDevVerifyUrl] = useState(null); // sadece dev: local'de SMTP yokken mail linkini göster
  const { login, register: registerFn, loginWithWallet } = useAuthStore();
  const [walletLoading, setWalletLoading] = useState(false);
  const addToast = useToastStore(s => s.add);
  const navigate = useNavigate();
  const { register, control, handleSubmit, formState: { isSubmitting } } = useForm();

  const turnstile = useTurnstile();

  const canSubmitRegister = acceptedTerms && acceptedKvkk;

  const onSubmit = async (data) => {
    try {
      if (tab === 'login') {
        const user = await login(data.username, data.password, turnstile.token);
        const redirect = searchParams.get('redirect');
        navigate(user.role === 'admin' ? '/admin' : (redirect || '/'));
      } else {
        if (!canSubmitRegister) {
          addToast(t('auth.acceptAllRequired'), 'error');
          return;
        }
        const result = await registerFn(data.username, data.email, data.password, {
          acceptedTerms,
          acceptedKvkk,
          consentVersion: LEGAL_VERSION,
        }, (data.referredBy?.trim() || refUsername || undefined), {
          phone: data.phone || undefined,
          dateOfBirth: data.dateOfBirth || undefined,
          turnstileToken: turnstile.token || undefined,
        });
        if (result.accessToken) {
          navigate('/');
        } else {
          // Task 1: register() artık doğrulanmadan oturum açmıyor — login ile aynı kart gösterilir.
          setUnverifiedEmail(data.email);
          if (import.meta.env.DEV && result.devVerifyUrl) setDevVerifyUrl(result.devVerifyUrl);
        }
      }
    } catch (e) {
      turnstile.reset(); // token tek kullanımlık
      const errData = e.response?.data?.error;
      const msg = errData?.message;
      const status = e.response?.status;
      if (status === 401) {
        addToast(t('auth.invalidCredentials'), 'error');
      } else if (status === 429) {
        addToast(t('auth.tooManyAttempts'), 'error');
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
            title: t('auth.invalidRegistrationInfo'),
            html: `<pre style="text-align:left;font-size:13px;line-height:1.6;color:#ccc;background:#111;padding:12px;border-radius:8px;white-space:pre-wrap">${lines}</pre>`,
            confirmButtonText: t('common.ok'),
            confirmButtonColor: '#00d4ff',
            background: '#0c1220',
            color: '#f0f4ff',

          });
          return;
        }
        addToast(msg || t('auth.invalidData'), 'error');
      } else if (tab === 'register') {
        Swal.fire({
          icon: 'error',
          title: t('auth.registerFailed'),
          text: errData?.code === 'PHONE_EXISTS' ? t('auth.phoneExists')
            : errData?.code === 'INVALID_PHONE' ? t('auth.invalidPhone')
            : (msg || t('auth.unknownError')),
          confirmButtonText: t('common.ok'),
          confirmButtonColor: '#00d4ff',
          background: '#0c1220',
          color: '#f0f4ff',
        });
      } else {
        addToast(msg || t('auth.loginFailed'), 'error');
      }
    }
  };

  async function handleWalletLogin() {
    setWalletLoading(true);
    try {
      const user = await loginWithWallet();
      navigate(user.role === 'admin' ? '/admin' : '/');
    } catch (e) {
      if (e.code === 'WALLET_NOT_FOUND') {
        addToast(t('auth.walletNotFound'), 'error');
      } else if (e.code === 4001) {
        // Kullanıcı MetaMask'ta isteği reddetti — sessizce geç.
      } else {
        addToast(e.response?.data?.error?.message || t('auth.walletLoginFailed'), 'error');
      }
    } finally {
      setWalletLoading(false);
    }
  }

  async function handleResendVerification() {
    setResendStatus('sending');
    try {
      const { data } = await api.post('/auth/resend-verification', { email: unverifiedEmail });
      setResendStatus('sent');
      if (import.meta.env.DEV && data.devVerifyUrl) setDevVerifyUrl(data.devVerifyUrl);
    } catch {
      setResendStatus('idle');
      addToast(t('auth.resendFailed'), 'error');
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
          <h1 className="text-2xl font-bold text-text-1">{siteName}</h1>
          <p className="text-text-2 text-sm mt-1">{t('auth.sportsBettingPlatform')}</p>
        </div>

        {unverifiedEmail ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#c8d8f0' }}>
              <strong style={{ color: '#f0f4ff' }}>{unverifiedEmail}</strong> {t('auth.emailNotVerified')}
            </div>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendStatus !== 'idle'}
              className="w-full bg-gradient-to-r from-primary to-accent text-bg-deep font-semibold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {resendStatus === 'sending' ? t('common.sending') : resendStatus === 'sent' ? t('common.sent') : t('auth.resendVerification')}
            </button>
            {devVerifyUrl && (
              <div className="p-3 rounded-lg text-xs break-all" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)', color: '#8ab4d8' }}>
                <strong style={{ color: '#00d4ff' }}>DEV:</strong> {t('auth.devNotice')} {' '}
                <a href={devVerifyUrl} className="underline" style={{ color: '#00d4ff' }}>{t('auth.devLink')}</a>
              </div>
            )}
            <div className="text-center">
              <button type="button"
                onClick={() => { setUnverifiedEmail(null); setResendStatus('idle'); }}
                className="text-xs underline"
                style={{ color: '#7c8aae' }}
              >
                {t('common.backToLogin')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex mb-6 bg-bg-base rounded-lg p-1">
              {['login', 'register'].map(tabId => (
                <button key={tabId} onClick={() => setTab(tabId)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === tabId ? 'bg-accent text-white' : 'text-text-2 hover:text-text-1'}`}
                  >{tabId === 'login' ? t('auth.login') : t('auth.register')}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <input {...register('username', { required: true })} placeholder={t('auth.username')}
                className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
              {tab === 'register' && refUsername && (
                <div className="bg-accent/10 border border-accent/30 rounded-lg px-3 py-2 text-xs text-text-2">
                  🎉 <strong className="text-accent">{refUsername}</strong> {t('auth.invitedYou')}
                </div>
              )}
              {tab === 'register' && (
                <input {...register('email', { required: true })} type="email" placeholder={t('auth.email')}
                  className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
              )}
              {tab === 'register' && (
                <input {...register('referredBy')} defaultValue={refUsername || ''} placeholder={t('auth.referredByPlaceholder')}
                  className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
              )}
              {tab === 'register' && (
                <div>
                  <label className="text-xs text-text-3 mb-1 block">{t('auth.phone')}</label>
                  <Controller name="phone" control={control} defaultValue=""
                    render={({ field }) => <PhoneInput value={field.value} onChange={field.onChange} />} />
                </div>
              )}
              {tab === 'register' && (
                <div>
                  <label className="text-xs text-text-3 mb-1 block">{t('auth.dateOfBirth')}</label>
                  <Controller name="dateOfBirth" control={control} defaultValue=""
                    render={({ field }) => <BirthDatePicker value={field.value} onChange={field.onChange} />} />
                </div>
              )}
              <div>
                <div className="relative">
                  <input {...register('password', { required: true })} type={showPassword ? 'text' : 'password'} placeholder={t('auth.password')}
                    className="w-full bg-bg-base border border-white/10 rounded-lg pl-4 pr-10 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
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
                      {t('auth.forgotPassword')}
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
                                      <Link to="/legal/terms" target="_blank" className="underline" style={{ color: '#00d4ff' }}>{t('auth.acceptTermsLink')}</Link>{' '}
                                      {t('auth.acceptTermsLabel')}
                                    </>
                                  }
                                />
                                <ConsentCheckbox
                                  checked={acceptedKvkk}
                                  onChange={setAcceptedKvkk}
                                  label={
                                    <>
                                      <Link to="/legal/kvkk" target="_blank" className="underline" style={{ color: '#00d4ff' }}>{t('auth.acceptKvkkLink')}</Link>{' '}
                                      {t('auth.acceptKvkkLabel')}
                                    </>
                                  }
                                />
                              </div>
                            )}

                            {turnstile.widget}

                            <button
                              type="submit"
                              disabled={isSubmitting || turnstile.blocked || (tab === 'register' && !canSubmitRegister)}
                              className="w-full bg-gradient-to-r from-primary to-accent text-bg-deep font-semibold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              {isSubmitting ? t('common.wait') : (tab === 'login' ? t('auth.login') : t('auth.register'))}
                            </button>
                          </form>

                          {/* Cüzdanla giriş (P6) */}
                          <div className="mt-4 flex items-center gap-3">
                            <div className="flex-1 h-px bg-white/10" />
                            <span className="text-[11px] text-text-3">{t('common.or')}</span>
                            <div className="flex-1 h-px bg-white/10" />
                          </div>
                          <button
                            type="button"
                            onClick={handleWalletLogin}
                            disabled={walletLoading}
                            className="w-full mt-4 flex items-center justify-center gap-2 border border-white/10 rounded-lg py-3 text-sm font-medium text-text-1 hover:border-primary/40 transition disabled:opacity-50"
                          >
                            🦊 {walletLoading ? t('common.wait') : t('auth.connectWallet')}
                          </button>

                          <a
                            href="/api/auth/google"
                            className="w-full mt-2 flex items-center justify-center gap-2 border border-white/10 rounded-lg py-3 text-sm font-medium text-text-1 hover:border-primary/40 transition"
                          >
                            <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C33.9 5.5 29.2 3.5 24 3.5 12.7 3.5 3.5 12.7 3.5 24S12.7 44.5 24 44.5 44.5 35.3 44.5 24c0-1.2-.1-2.4-.3-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C33.9 5.5 29.2 3.5 24 3.5c-7.5 0-14 4.2-17.3 10.3z"/><path fill="#4CAF50" d="M24 44.5c5.1 0 9.8-1.9 13.3-5.1l-6.2-5.2C29.2 35.9 26.7 37 24 37c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.9 40.2 16.4 44.5 24 44.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.9 36 44.5 30.5 44.5 24c0-1.2-.1-2.4-.3-3.5z"/></svg>
                            {t('auth.continueWithGoogle')}
                          </a>

                          <div className="mt-3">
                            <TelegramLoginWidget />
                          </div>

                          {/* Footer linkler */}
                          <div className="mt-6 pt-4 border-t border-white/[0.06] text-[10px] text-center" style={{ color: '#4a5a78' }}>
                            {t('auth.registerImplies')} {' '}
                            <Link to="/legal/user-agreement" target="_blank" className="underline" style={{ color: '#00d4ff' }}>
                              {t('auth.userAgreement')}
                            </Link>{' '}
                            {t('auth.acceptedByRegister')}
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
