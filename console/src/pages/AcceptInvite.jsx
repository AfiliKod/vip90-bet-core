import React, { useState, useEffect } from 'react';
import axios from 'axios';

const h = React.createElement;

export function validatePassword(password, confirmPassword) {
  if (!password || password.length < 12) {
    return 'Şifre en az 12 karakter uzunluğunda olmalıdır.';
  }
  if (password !== confirmPassword) {
    return 'Şifreler birbiriyle eşleşmiyor.';
  }
  return null;
}

export default function AcceptInvite() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('token');
      if (t) {
        setToken(t);
      } else {
        setError('Geçersiz veya eksik davet bağlantısı (token bulunamadı).');
      }
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Geçerli bir davet belirteci (token) bulunamadı.');
      return;
    }

    const validationError = validatePassword(password, confirmPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await axios.post('/api/staff/auth/accept-invite', {
        token,
        password,
      });
      setSuccess(true);
    } catch (err) {
      const backendMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Davet kabul edilirken bir hata oluştu. Bağlantı geçersiz veya süresi dolmuş olabilir.';
      setError(backendMessage);
    } finally {
      setLoading(false);
    }
  };

  return h(
    'div',
    { className: 'min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8' },
    h(
      'div',
      { className: 'sm:mx-auto sm:w-full sm:max-w-md text-center' },
      h('h1', { className: 'text-2xl font-bold tracking-tight text-white mb-2' }, 'Platform Yönetim Konsolu'),
      h('h2', { className: 'text-lg font-medium text-slate-300' }, 'Yönetici Davetini Kabul Et')
    ),
    h(
      'div',
      { className: 'mt-8 sm:mx-auto sm:w-full sm:max-w-md' },
      h(
        'div',
        { className: 'bg-slate-800 py-8 px-4 shadow-xl border border-slate-700 sm:rounded-lg sm:px-10' },
        success
          ? h(
              'div',
              { className: 'space-y-6 text-center' },
              h(
                'div',
                { className: 'p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-md' },
                h('p', { className: 'text-sm font-medium text-emerald-300' }, 'Hesabınız başarıyla aktifleştirildi!'),
                h('p', { className: 'text-xs text-slate-300 mt-1' }, 'Artık yeni şifrenizle giriş yapabilirsiniz.')
              ),
              h(
                'a',
                {
                  href: '/console/login',
                  className:
                    'w-full inline-flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors',
                },
                'Giriş Sayfasına Git'
              )
            )
          : h(
              'form',
              { onSubmit: handleSubmit, className: 'space-y-5' },
              error &&
                h(
                  'div',
                  { className: 'p-3 bg-rose-950/60 border border-rose-500/40 rounded-md text-sm text-rose-300' },
                  error
                ),
              h(
                'div',
                null,
                h('label', { className: 'block text-sm font-medium text-slate-300' }, 'Yeni Şifre'),
                h('input', {
                  type: 'password',
                  required: true,
                  value: password,
                  onChange: (e) => setPassword(e.target.value),
                  placeholder: 'En az 12 karakter',
                  className:
                    'mt-1 block w-full px-3 py-2 border border-slate-700 rounded-md bg-slate-900 text-white placeholder-slate-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm',
                }),
                h('p', { className: 'text-xs text-slate-400 mt-1' }, 'Şifreniz en az 12 karakter olmalıdır.')
              ),
              h(
                'div',
                null,
                h('label', { className: 'block text-sm font-medium text-slate-300' }, 'Yeni Şifre (Tekrar)'),
                h('input', {
                  type: 'password',
                  required: true,
                  value: confirmPassword,
                  onChange: (e) => setConfirmPassword(e.target.value),
                  placeholder: 'Şifrenizi tekrar girin',
                  className:
                    'mt-1 block w-full px-3 py-2 border border-slate-700 rounded-md bg-slate-900 text-white placeholder-slate-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm',
                })
              ),
              h(
                'button',
                {
                  type: 'submit',
                  disabled: loading || !token,
                  className:
                    'w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors',
                },
                loading ? 'İşleniyor...' : 'Şifreyi Belirle ve Aktifleştir'
              )
            )
      )
    )
  );
}
