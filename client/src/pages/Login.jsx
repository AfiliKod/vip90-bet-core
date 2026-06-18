import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';

export default function Login() {
  const [tab, setTab] = useState('login');
  const { login, register: registerFn } = useAuthStore();
  const addToast = useToastStore(s => s.add);
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm();

  const onSubmit = async (data) => {
    try {
      if (tab === 'login') {
        const user = await login(data.username, data.password);
        navigate(user.role === 'admin' ? '/admin' : '/');
      } else {
        await registerFn(data.username, data.email, data.password);
        navigate('/');
      }
    } catch (e) {
      addToast(e.response?.data?.error?.message || 'Bir hata oluştu', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-bg-deep flex items-center justify-center px-4">
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
          <input {...register('password', { required: true })} type="password" placeholder="Şifre"
            className="w-full bg-bg-base border border-white/10 rounded-lg px-4 py-3 text-text-1 placeholder-text-3 focus:outline-none focus:border-primary transition" />
          <button type="submit" disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-primary to-accent text-bg-deep font-semibold py-3 rounded-lg hover:opacity-90 disabled:opacity-50 transition">
            {isSubmitting ? 'Bekleyin...' : (tab === 'login' ? 'Giriş Yap' : 'Kayıt Ol')}
          </button>
        </form>
      </div>
    </div>
  );
}
