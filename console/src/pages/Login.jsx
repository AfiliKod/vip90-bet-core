import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatformAuthStore } from '../store/authStore.js';
import { authApi } from '../api/client.js';

export default function Login() {
  const navigate = useNavigate();
  const {
    requires2fa,
    challengeToken,
    handleLoginResponse,
    setLoading,
    loading,
    error,
    setError,
  } = usePlatformAuthStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [localError, setLocalError] = useState(null);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setError(null);
    setLoading(true);

    try {
      const data = await authApi.login({ username, password });
      handleLoginResponse(data);

      if (data.requires2faSetup) {
        navigate('/setup-2fa');
      } else if (data.accessToken) {
        navigate('/');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Please verify credentials.';
      setLocalError(msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handle2faSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setError(null);
    setLoading(true);

    try {
      const data = await authApi.challengeVerify({
        challengeToken,
        code: totpCode,
      });

      handleLoginResponse(data);
      if (data.accessToken) {
        navigate('/');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid two-factor authentication code.';
      setLocalError(msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
          Platform Console
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Platform Owner &amp; Staff Administration
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-800">
          {(localError || error) && (
            <div className="mb-4 p-3 bg-red-950/80 border border-red-800 text-red-200 text-sm rounded">
              {localError || error}
            </div>
          )}

          {!requires2fa ? (
            <form className="space-y-6" onSubmit={handlePasswordSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Staff Username
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-slate-700 rounded-md shadow-sm bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Password
                </label>
                <div className="mt-1">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-slate-700 rounded-md shadow-sm bg-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Authenticating...' : 'Sign In'}
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handle2faSubmit}>
              <div className="text-center">
                <span className="inline-block p-3 rounded-full bg-indigo-950 text-indigo-400 mb-2">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </span>
                <h3 className="text-lg font-medium text-white">Two-Factor Authentication</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Enter the 6-digit TOTP verification code from your authenticator app
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Authentication Code
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="123456"
                    maxLength={8}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-slate-700 rounded-md shadow-sm bg-slate-800 text-white placeholder-slate-500 text-center tracking-widest text-lg font-mono focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    usePlatformAuthStore.getState().reset();
                    setTotpCode('');
                  }}
                  className="flex-1 py-2 px-4 border border-slate-700 rounded-md text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || !totpCode}
                  className="flex-1 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
