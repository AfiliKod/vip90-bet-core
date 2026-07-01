import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import Swal from 'sweetalert2';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { LEGAL_VERSION } from '../data/legalContent';

export default function Login() {
  const [tab, setTab] = useState('login');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedKvkk, setAcceptedKvkk] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const { login, register: registerFn } = useAuthStore();
  const addToast = useToastStore(s => s.add);
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm();

  const canSubmitRegister = acceptedTerms && acceptedKvkk && ageConfirmed;

  const onSubmit = async (data) => {
    try {
      if (tab === 'login') {
        const user = await login(data.username, data.password);
        navigate(user.role === 'admin' ? '/admin' : '/');
      } else {
        if (!canSubmitRegister) {
          addToast('Devam etmek için tüm onayları tamamlamalısınız.', 'error');
          return;
        }
        await registerFn(data.username, data.email, data.password, {
          acceptedTerms,
          acceptedKvkk,
          ageConfirmed,
          consentVersion: LEGAL_VERSION,
        });
        navigate('/');
      }
    } catch (e) {
      const errData = e.response?.data?.error;
      const msg = errData?.message;
      const status = e.response?.status;
      if (status === 401) {
        addToast('Kullanıcı adı veya şifre hatalı.', 'error');
      } else if (status === 429) {
        addToast('Çok fazla deneme. Lütfen biraz bekleyin.', 'error');
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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative"
      style={{
        background: '#05080f',
      }}>
      <div className="absolute inset-0 bg-cover bg-center opacity-20 pointer-events-none"
        style={{ backgroundImage: 'url(/images/login-bg.png?v=2)' }} />
      <div className="w-full max-w-sm bg-bg-card border border-white/10 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">💎</div>
          <h1 className="text-2xl font-bold text-text-1">VIP90.bet</h1>
          <p className="text-text-2 text-sm mt-1">Spor Bahis Platformu</p>
        </div>
        <div className="flex mb-6 bg-bg-base rounded-lg p-1">
          {['login', 'register'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-accent text-white' : 'text-text-2 hover:text-text-1'}`}>
              {t === 'login' ? 'Giriş Yap' : 'Kayıt Ol'}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input {...register('username', { required: true })} placeholder="Kullanıcı adı"
            className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
          {tab === 'register' && (
            <input {...register('email', { required: true })} type="email" placeholder="E-posta"
              className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
          )}
          <div className="relative">
            <input {...register('password', { required: true })} type="password" placeholder="Şifre"
              className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
            {tab === 'login' && (
              <Link to="/forgot-password"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold underline transition"
                style={{ color: '#7c8aae' }}
                onMouseEnter={e => e.currentTarget.style.color = '#00d4ff'}
                onMouseLeave={e => e.currentTarget.style.color = '#7c8aae'}
              >
                Şifremi Unuttum
              </Link>
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
              <ConsentCheckbox
                checked={ageConfirmed}
                onChange={setAgeConfirmed}
                label="18 yaşından büyüğüm"
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
          <Link to="/legal/bonus-terms" target="_blank" className="underline" style={{ color: '#00d4ff' }}>
            Bonus Koşulları
          </Link>
          'nı da kabul etmiş sayılırsınız.
        </div>
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