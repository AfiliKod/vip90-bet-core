import { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { socket } from '../services/socket';

const STATUS_CONFIG = {
  not_started: { label: 'Baslamadi', color: 'text-text-3', bg: 'bg-white/5', border: 'border-white/10' },
  pending:     { label: 'Inceleniyor', color: 'text-yellow-300', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  under_review: { label: 'Inceleniyor', color: 'text-yellow-300', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  approved:    { label: 'Onaylandi', color: 'text-green-300', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  rejected:    { label: 'Reddedildi', color: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  expired:     { label: 'Suresi Dolmus', color: 'text-text-3', bg: 'bg-white/5', border: 'border-white/10' },
};

export default function Kyc() {
  const user = useAuthStore(s => s.user);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState(null);
  const sdkRef = useRef(null);

  function loadStatus() {
    setLoading(true);
    api.get('/kyc/status')
      .then(r => setStatus(r.data))
      .catch(() => setNotice({ type: 'error', text: 'KYC durumu yuklenemedi.' }))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    function onKycStatus({ status: newStatus }) {
      setStatus(prev => prev ? { ...prev, kycStatus: newStatus } : prev);
      if (newStatus === 'approved') {
        setNotice({ type: 'ok', text: 'KYC dogrulamaniz onaylandi!' });
      } else if (newStatus === 'rejected') {
        setNotice({ type: 'error', text: 'KYC dogrulamaniz reddedildi.' });
      }
    }
    socket.on('kyc:status', onKycStatus);
    return () => socket.off('kyc:status', onKycStatus);
  }, []);

  async function startVerification() {
    setStarting(true);
    setNotice(null);
    try {
      const r = await api.post('/kyc/init-session');
      const { token } = r.data;

      if (!window.SumSub) {
        const script = document.createElement('script');
        script.src = 'https://cdn.sumsub.com/websdk/resources/sumsub-websdk.js';
        script.onload = () => initSumsub(token);
        document.head.appendChild(script);
      } else {
        initSumsub(token);
      }
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || 'Dogrulama baslatilamadi.' });
      setStarting(false);
    }
  }

  function initSumsub(token) {
    try {
      sdkRef.current = window.SumSub(token, 'sumsub-websdk-anchor', {
        lang: 'tr',
        onReady: () => setStarting(false),
        onComplete: () => {
          setNotice({ type: 'ok', text: 'Dogrulama tamamlandi. Sonuc bekleniyor...' });
          loadStatus();
        },
        onError: (err) => {
          setNotice({ type: 'error', text: `Dogrulama hatasi: ${err?.message || 'Bilinmeyen hata'}` });
          setStarting(false);
        },
      });
    } catch (e) {
      setNotice({ type: 'error', text: 'Sumsub SDK yuklenemedi.' });
      setStarting(false);
    }
  }

  const st = status?.kycStatus || 'not_started';
  const cfg = STATUS_CONFIG[st] || STATUS_CONFIG.not_started;

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="h-40 bg-bg-card rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-6">KYC Kimlik Dogrulama</h1>

      {notice && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm border ${
          notice.type === 'ok'
            ? 'border-green-500/30 bg-green-500/10 text-green-200'
            : 'border-red-500/30 bg-red-500/10 text-red-200'
        }`}>
          {notice.text}
        </div>
      )}

      <div className={`rounded-xl border p-4 mb-4 ${cfg.bg} ${cfg.border}`}>
        <div className="flex items-center gap-3">
          <div className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</div>
        </div>
        {status?.kycSubmittedAt && (
          <div className="text-xs text-text-3 mt-2">
            Gonderim: {new Date(status.kycSubmittedAt).toLocaleDateString('tr-TR')}
          </div>
        )}
        {status?.kycApprovedAt && (
          <div className="text-xs text-text-3 mt-1">
            Onay: {new Date(status.kycApprovedAt).toLocaleDateString('tr-TR')}
          </div>
        )}
        {status?.kycRejectionReason && (
          <div className="text-xs text-red-300 mt-1">
            Red sebebi: {status.kycRejectionReason}
          </div>
        )}
      </div>

      {(st === 'not_started' || st === 'rejected') && status?.provider !== 'manual' && (
        <button
          onClick={startVerification}
          disabled={starting}
          className="w-full py-3 rounded-xl text-sm font-medium bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 disabled:opacity-40 transition"
        >
          {starting ? 'Baslatiliyor...' : 'KYC Dogrulamasini Baslat'}
        </button>
      )}

      {(st === 'not_started' || st === 'rejected') && status?.provider === 'manual' && (
        <div className="text-sm text-text-3 bg-bg-card border border-white/10 rounded-xl p-4">
          Manuel KYC aktif. Belgelerinizi destek ekibine gonderin.
        </div>
      )}

      <div id="sumsub-websdk-anchor" className="mt-4" />
    </div>
  );
}
