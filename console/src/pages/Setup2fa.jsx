import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { usePlatformAuthStore } from '../store/authStore.js';
import { authApi } from '../api/client.js';

export default function Setup2fa() {
  const navigate = useNavigate();
  const setupToken = usePlatformAuthStore((state) => state.setupToken);

  const [loading, setLoading] = useState(true);
  const [setupData, setSetupData] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [backupCodes, setBackupCodes] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!setupToken) {
      navigate('/login');
      return;
    }

    let isMounted = true;
    authApi
      .setup2fa(setupToken)
      .then((data) => {
        if (isMounted) {
          setSetupData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.response?.data?.message || 'Failed to initialize 2FA setup.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [setupToken, navigate]);

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await authApi.confirm2fa(
        { secret: setupData?.secret, token: code },
        setupToken
      );

      if (res.backupCodes) {
        setBackupCodes(res.backupCodes);
      } else {
        usePlatformAuthStore.getState().reset();
        navigate('/login');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to verify 2FA code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinish = () => {
    usePlatformAuthStore.getState().reset();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h2 className="text-3xl font-extrabold text-white">Setup Two-Factor Authentication</h2>
        <p className="mt-2 text-sm text-slate-400">
          Two-factor authentication is mandatory for all platform staff in multi-tenant mode.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900 py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-800">
          {error && (
            <div className="mb-4 p-3 bg-red-950/80 border border-red-800 text-red-200 text-sm rounded">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center text-slate-400 py-6">Initializing authenticator key...</div>
          ) : backupCodes ? (
            <div className="space-y-6">
              <div className="p-4 bg-emerald-950/60 border border-emerald-800 rounded-md">
                <h4 className="text-sm font-semibold text-emerald-300">2FA Enabled Successfully</h4>
                <p className="text-xs text-emerald-400 mt-1">
                  Save your backup recovery codes in a safe place. Each code can be used once if you lose access to your authenticator.
                </p>
              </div>

              <div className="bg-slate-950 p-3 rounded border border-slate-800 font-mono text-xs text-slate-300 grid grid-cols-2 gap-2">
                {backupCodes.map((c, i) => (
                  <span key={i} className="text-center bg-slate-900 py-1 rounded">
                    {c}
                  </span>
                ))}
              </div>

              <button
                type="button"
                onClick={handleFinish}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                Proceed to Sign In
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col items-center">
                <div className="p-3 bg-white rounded-lg shadow-inner">
                  {setupData?.qrDataUrl ? (
                    <img src={setupData.qrDataUrl} alt="2FA QR Code" className="w-48 h-48" />
                  ) : setupData?.otpauthUrl ? (
                    <QRCodeSVG value={setupData.otpauthUrl} size={192} />
                  ) : null}
                </div>

                <div className="mt-4 text-center">
                  <span className="text-xs text-slate-400 block mb-1">Manual setup key:</span>
                  <code className="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-indigo-300 select-all">
                    {setupData?.secret}
                  </code>
                </div>
              </div>

              <form onSubmit={handleConfirm} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300">
                    Enter Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-slate-700 rounded-md bg-slate-800 text-white placeholder-slate-500 font-mono text-center tracking-widest text-lg focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !code}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Verifying...' : 'Confirm & Activate'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
