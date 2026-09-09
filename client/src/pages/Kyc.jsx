import { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { socket } from '../services/socket';

const STATUS_CONFIG = {
  not_started: { label: 'Başlamadı', color: 'text-text-3', bg: 'bg-white/5', border: 'border-white/10' },
  pending:     { label: 'İnceleniyor', color: 'text-yellow-300', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  under_review: { label: 'İnceleniyor', color: 'text-yellow-300', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  approved:    { label: 'Onaylandı', color: 'text-green-300', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  rejected:    { label: 'Reddedildi', color: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/30' },
  expired:     { label: 'Süresi Dolmuş', color: 'text-text-3', bg: 'bg-white/5', border: 'border-white/10' },
};

const DOC_TYPES = [
  { value: 'identity_card', label: 'Kimlik Kartı' },
  { value: 'passport', label: 'Pasaport' },
  { value: 'drivers_license', label: 'Ehliyet' },
  { value: 'utility_bill', label: 'Fatura' },
  { value: 'bank_statement', label: 'Banka Özeti' },
  { value: 'selfie_with_id', label: 'Kimlikle Selfie' },
];

export default function Kyc() {
  const user = useAuthStore(s => s.user);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [provider, setProvider] = useState('manual');
  const [enabled, setEnabled] = useState(true);
  const sdkRef = useRef(null);

  // Lokal belge yükleme
  const [docType, setDocType] = useState('identity_card');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState([]);
  const fileInputRef = useRef(null);

  function loadStatus() {
    setLoading(true);
    api.get('/kyc/status')
      .then(r => {
        setStatus(r.data);
        setProvider(r.data.provider || 'manual');
        setEnabled(r.data.enabled !== false);
      })
      .catch(() => setNotice({ type: 'error', text: 'KYC durumu yüklenemedi.' }))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadStatus(); }, []);

  useEffect(() => {
    function onKycStatus({ status: newStatus }) {
      setStatus(prev => prev ? { ...prev, kycStatus: newStatus } : prev);
      if (newStatus === 'approved') {
        setNotice({ type: 'ok', text: 'KYC doğrulamanız onaylandı!' });
      } else if (newStatus === 'rejected') {
        setNotice({ type: 'error', text: 'KYC doğrulamanız reddedildi.' });
      }
    }
    socket.on('kyc:status', onKycStatus);
    return () => socket.off('kyc:status', onKycStatus);
  }, []);

  // ─── Sumsub Başlatma ──────────────────────────────────────────────
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
      setNotice({ type: 'error', text: e.response?.data?.error?.message || 'Doğrulama başlatılamadı.' });
      setStarting(false);
    }
  }

  function initSumsub(token) {
    try {
      sdkRef.current = window.SumSub(token, 'sumsub-websdk-anchor', {
        lang: 'tr',
        onReady: () => setStarting(false),
        onComplete: () => {
          setNotice({ type: 'ok', text: 'Doğrulama tamamlandı. Sonuç bekleniyor...' });
          loadStatus();
        },
        onError: (err) => {
          setNotice({ type: 'error', text: `Doğrulama hatası: ${err?.message || 'Bilinmeyen hata'}` });
          setStarting(false);
        },
      });
    } catch (e) {
      setNotice({ type: 'error', text: 'Sumsub SDK yüklenemedi.' });
      setStarting(false);
    }
  }

  // ─── Lokal Belge Yükleme ──────────────────────────────────────────
  function handleFileSelect(e) {
    const selected = Array.from(e.target.files);
    if (files.length + selected.length > 6) {
      setNotice({ type: 'error', text: 'En fazla 6 belge yükleyebilirsiniz.' });
      return;
    }
    const newFiles = [...files, ...selected];
    setFiles(newFiles);

    const newPreviews = selected.map(file => ({
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: file.type,
      url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
    setPreviews(prev => [...prev, ...newPreviews]);
  }

  function removeFile(index) {
    if (previews[index]?.url) URL.revokeObjectURL(previews[index].url);
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  }

  async function uploadDocuments() {
    if (files.length === 0) {
      setNotice({ type: 'error', text: 'En az bir belge seçin.' });
      return;
    }
    setUploading(true);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append('documentType', docType);
      files.forEach(f => formData.append('documents', f));

      await api.post('/kyc/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setNotice({ type: 'ok', text: `${files.length} belge yüklendi. İnceleniyor...` });
      setFiles([]);
      setPreviews([]);
      loadStatus();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || 'Belge yüklenemedi.' });
    } finally {
      setUploading(false);
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

  if (!enabled) {
    return (
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-text-1 mb-6">KYC Kimlik Doğrulama</h1>
        <div className="rounded-xl border border-white/10 bg-bg-card p-6 text-center">
          <div className="text-3xl mb-3">🔒</div>
          <div className="text-sm text-text-3">KYC doğrulama şu anda devre dışı.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-6">KYC Kimlik Doğrulama</h1>

      {notice && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm border ${
          notice.type === 'ok'
            ? 'border-green-500/30 bg-green-500/10 text-green-200'
            : 'border-red-500/30 bg-red-500/10 text-red-200'
        }`}>
          {notice.text}
        </div>
      )}

      {/* Durum Kartı */}
      <div className={`rounded-xl border p-4 mb-4 ${cfg.bg} ${cfg.border}`}>
        <div className="flex items-center gap-3">
          <div className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</div>
          <div className="text-xs text-text-3">
            {provider === 'sumsub' ? 'Sumsub' : 'Manuel'} provider
          </div>
        </div>
        {status?.kycSubmittedAt && (
          <div className="text-xs text-text-3 mt-2">
            Gönderim: {new Date(status.kycSubmittedAt).toLocaleDateString('tr-TR')}
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

      {/* Belge Listesi (varsa) */}
      {status?.documents?.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="text-xs font-medium text-text-2">Yüklenmiş Belgeler</div>
          {status.documents.map((doc, i) => (
            <div key={i} className="flex items-center justify-between bg-bg-card border border-white/10 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg">{doc.mimeType === 'application/pdf' ? '📄' : '🖼️'}</span>
                <div className="min-w-0">
                  <div className="text-xs text-text-1 truncate">{doc.fileName}</div>
                  <div className="text-[10px] text-text-3">{DOC_TYPES.find(d => d.value === doc.documentType)?.label || doc.documentType}</div>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                doc.status === 'approved' ? 'bg-green-500/20 text-green-300' :
                doc.status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                'bg-yellow-500/20 text-yellow-300'
              }`}>
                {doc.status === 'approved' ? 'Onaylandı' : doc.status === 'rejected' ? 'Reddedildi' : 'Bekliyor'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Aksiyon Bölümü */}
      {(st === 'not_started' || st === 'rejected') && (
        <>
          {/* Sumsub Provider */}
          {provider === 'sumsub' && (
            <button
              onClick={startVerification}
              disabled={starting}
              className="w-full py-3 rounded-xl text-sm font-medium bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 disabled:opacity-40 transition"
            >
              {starting ? 'Başlatılıyor...' : 'KYC Doğrulamasını Başlat'}
            </button>
          )}

          {/* Manuel Provider — Belge Yükleme */}
          {provider === 'manual' && (
            <div className="bg-bg-card border border-white/10 rounded-xl p-4">
              <div className="text-sm font-medium text-text-1 mb-3">Belge Yükle</div>

              <div className="mb-3">
                <label className="text-xs text-text-3 mb-1 block">Belge Tipi</label>
                <select
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                  className="w-full bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-white/25"
                >
                  {DOC_TYPES.map(dt => (
                    <option key={dt.value} value={dt.value}>{dt.label}</option>
                  ))}
                </select>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFileSelect({ target: { files: e.dataTransfer.files } }); }}
                className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-white/25 transition"
              >
                <div className="text-2xl mb-2">📎</div>
                <div className="text-xs text-text-3">
                  Dosyaları sürükleyin veya tıklayın
                </div>
                <div className="text-[10px] text-text-3/60 mt-1">
                  JPEG, PNG, WebP, PDF — Maks 10MB, en fazla 6 dosya
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Önizleme */}
              {previews.length > 0 && (
                <div className="mt-3 space-y-2">
                  {previews.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 bg-bg-deep rounded-lg px-3 py-2">
                      {p.url ? (
                        <img src={p.url} alt={p.name} className="w-10 h-10 rounded object-cover" />
                      ) : (
                        <span className="text-xl">📄</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-text-1 truncate">{p.name}</div>
                        <div className="text-[10px] text-text-3">{p.size}</div>
                      </div>
                      <button
                        onClick={() => removeFile(i)}
                        className="text-red-300 hover:text-red-200 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={uploadDocuments}
                disabled={uploading || files.length === 0}
                className="w-full mt-3 py-2.5 rounded-xl text-sm font-medium bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 disabled:opacity-40 transition"
              >
                {uploading ? 'Yükleniyor...' : `${files.length} Belge Yükle`}
              </button>
            </div>
          )}

          <div id="sumsub-websdk-anchor" className="mt-4" />
        </>
      )}

      {/* Pending/Under Review */}
      {(st === 'pending' || st === 'under_review') && (
        <div className="text-sm text-text-3 bg-bg-card border border-white/10 rounded-xl p-4 text-center">
          Belgeleriniz inceleniyor. Lütfen bekleyin.
        </div>
      )}

      {/* Approved */}
      {st === 'approved' && (
        <div className="text-sm text-green-300 bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
          KYC doğrulamanız tamamlandı. Teşekkürler!
        </div>
      )}
    </div>
  );
}
