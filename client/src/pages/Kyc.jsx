import { useEffect, useState, useRef } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { socket } from '../services/socket';
import { useTranslation } from '../i18n';

const STATUS_CONFIG = {
  not_started: { labelKey: 'kyc.status.notStarted', tone: 'text-text-3', bg: 'bg-white/5', border: 'border-white/10' },
  pending:     { labelKey: 'kyc.status.pending',     tone: 'text-warning', bg: 'bg-warning/15', border: 'border-warning/30' },
  under_review:{ labelKey: 'kyc.status.underReview', tone: 'text-warning', bg: 'bg-warning/15', border: 'border-warning/30' },
  approved:    { labelKey: 'kyc.status.approved',    tone: 'text-success', bg: 'bg-success/15', border: 'border-success/30' },
  rejected:    { labelKey: 'kyc.status.rejected',    tone: 'text-danger',  bg: 'bg-danger/20',  border: 'border-danger/30' },
  expired:     { labelKey: 'kyc.status.expired',     tone: 'text-text-3',  bg: 'bg-white/5',    border: 'border-white/10' },
};

const DOC_TYPES = [
  { value: 'identity_card', labelKey: 'kyc.docType.identityCard' },
  { value: 'passport', labelKey: 'kyc.docType.passport' },
  { value: 'drivers_license', labelKey: 'kyc.docType.driversLicense' },
  { value: 'utility_bill', labelKey: 'kyc.docType.utilityBill' },
  { value: 'bank_statement', labelKey: 'kyc.docType.bankStatement' },
  { value: 'selfie_with_id', labelKey: 'kyc.docType.selfieWithId' },
];

const DOC_STATUS_CLS = {
  approved: 'bg-success/15 text-success',
  rejected: 'bg-danger/20 text-danger',
};

const INPUT_CLS =
  'w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none';

const CTA_CLS =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-40';

export default function Kyc() {
  const { t, locale } = useTranslation();
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
      .catch(() => setNotice({ type: 'error', code: 'kyc.loadError' }))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadStatus(); }, []);

  useEffect(() => {
    function onKycStatus({ status: newStatus }) {
      setStatus(prev => prev ? { ...prev, kycStatus: newStatus } : prev);
      if (newStatus === 'approved') {
        setNotice({ type: 'ok', text: t('kyc.approvedNotice') });
      } else if (newStatus === 'rejected') {
        setNotice({ type: 'error', text: t('kyc.rejectedNotice') });
      }
    }
    socket.on('kyc:status', onKycStatus);
    return () => socket.off('kyc:status', onKycStatus);
  }, [t]);

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
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('kyc.startFailed') });
      setStarting(false);
    }
  }

  function initSumsub(token) {
    try {
      sdkRef.current = window.SumSub(token, 'sumsub-websdk-anchor', {
        lang: locale,
        onReady: () => setStarting(false),
        onComplete: () => {
          setNotice({ type: 'ok', text: t('kyc.completed') });
          loadStatus();
        },
        onError: (err) => {
          setNotice({ type: 'error', text: t('kyc.error', { error: err?.message || t('kyc.unknownError') }) });
          setStarting(false);
        },
      });
    } catch (e) {
      setNotice({ type: 'error', text: t('kyc.sdkLoadFailed') });
      setStarting(false);
    }
  }

  // ─── Lokal Belge Yükleme ──────────────────────────────────────────
  function handleFileSelect(e) {
    const selected = Array.from(e.target.files);
    if (files.length + selected.length > 6) {
      setNotice({ type: 'error', text: t('kyc.maxFiles') });
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
      setNotice({ type: 'error', text: t('kyc.selectAtLeastOne') });
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

      setNotice({ type: 'ok', text: t('kyc.uploaded', { count: files.length.toLocaleString(locale) }) });
      setFiles([]);
      setPreviews([]);
      loadStatus();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('kyc.uploadFailed') });
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
        <h1 className="text-2xl font-bold text-text-1 mb-6">{t('kyc.title')}</h1>
        <div className="rounded-xl border border-white/10 bg-bg-card p-6 text-center">
          <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">lock</span>
          <div className="mt-2 text-sm text-text-3">{t('kyc.disabled')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-6">{t('kyc.title')}</h1>

      {notice && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          notice.type === 'ok'
            ? 'border-success/30 bg-success/15 text-success'
            : 'border-danger/30 bg-danger/15 text-danger'
        }`}>
          {notice.code ? t(notice.code) : notice.text}
        </div>
      )}

      {/* Durum Kartı */}
      <div className={`rounded-xl border p-4 mb-4 ${cfg.bg} ${cfg.border}`}>
        <div className="flex items-center gap-3">
          <div className={`text-sm font-bold ${cfg.tone}`}>{t(cfg.labelKey)}</div>
          <div className="text-xs text-text-3">
            {t('kyc.providerLine', { provider: provider === 'sumsub' ? 'Sumsub' : t('kyc.provider.manual') })}
          </div>
        </div>
        {status?.kycSubmittedAt && (
          <div className="text-xs text-text-3 mt-2">
            {t('kyc.submittedAt', { date: new Date(status.kycSubmittedAt).toLocaleDateString(locale) })}
          </div>
        )}
        {status?.kycApprovedAt && (
          <div className="text-xs text-text-3 mt-1">
            {t('kyc.approvedAt', { date: new Date(status.kycApprovedAt).toLocaleDateString(locale) })}
          </div>
        )}
        {status?.kycRejectionReason && (
          <div className="text-xs text-danger mt-1">
            {t('kyc.rejectionReason', { reason: status.kycRejectionReason })}
          </div>
        )}
      </div>

      {/* Belge Listesi (varsa) */}
      {status?.documents?.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="text-xs font-bold text-text-2">{t('kyc.uploadedDocuments')}</div>
          {status.documents.map((doc, i) => (
            <div key={i} className="flex items-center justify-between bg-bg-card border border-white/10 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined !text-[18px] text-text-3" aria-hidden="true">
                  {doc.mimeType === 'application/pdf' ? 'description' : 'image'}
                </span>
                <div className="min-w-0">
                  <div className="text-xs text-text-1 truncate">{doc.fileName}</div>
                  <div className="text-[10px] text-text-3">
                    {t(DOC_TYPES.find(d => d.value === doc.documentType)?.labelKey || 'kyc.docType.identityCard')}
                  </div>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase ${
                DOC_STATUS_CLS[doc.status] || 'bg-warning/15 text-warning'
              }`}>
                {doc.status === 'approved' ? t('kyc.docStatus.approved')
                  : doc.status === 'rejected' ? t('kyc.docStatus.rejected')
                  : t('kyc.docStatus.pending')}
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
              className={CTA_CLS}
            >
              <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">verified_user</span>
              {starting ? t('kyc.starting') : t('kyc.startVerification')}
            </button>
          )}

          {/* Manuel Provider — Belge Yükleme */}
          {provider === 'manual' && (
            <div className="bg-bg-card border border-white/10 rounded-xl p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                  <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">upload_file</span>
                </span>
                <div className="text-sm font-bold text-text-1">{t('kyc.uploadCardTitle')}</div>
              </div>

              <div className="mb-3">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('kyc.documentType')}</label>
                <select
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                  className={INPUT_CLS}
                >
                  {DOC_TYPES.map(dt => (
                    <option key={dt.value} value={dt.value}>{t(dt.labelKey)}</option>
                  ))}
                </select>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFileSelect({ target: { files: e.dataTransfer.files } }); }}
                className="cursor-pointer rounded-xl border-2 border-dashed border-white/10 p-6 text-center transition hover:border-white/25"
              >
                <span className="material-symbols-outlined !text-[28px] text-text-3" aria-hidden="true">attach_file</span>
                <div className="mt-1 text-xs text-text-3">
                  {t('kyc.dropHint')}
                </div>
                <div className="mt-1 text-[10px] text-text-3/60">
                  {t('kyc.dropMeta')}
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
                        <span className="material-symbols-outlined !text-[20px] text-text-3" aria-hidden="true">description</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-text-1 truncate">{p.name}</div>
                        <div className="text-[10px] text-text-3">{p.size}</div>
                      </div>
                      <button
                        onClick={() => removeFile(i)}
                        aria-label={t('common.remove')}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-danger transition hover:bg-danger/15"
                      >
                        <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={uploadDocuments}
                disabled={uploading || files.length === 0}
                className={`${CTA_CLS} mt-3`}
              >
                <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">upload</span>
                {uploading ? t('kyc.uploading') : t('kyc.uploadButton', { count: files.length.toLocaleString(locale) })}
              </button>
            </div>
          )}

          <div id="sumsub-websdk-anchor" className="mt-4" />
        </>
      )}

      {/* Pending/Under Review */}
      {(st === 'pending' || st === 'under_review') && (
        <div className="rounded-xl border border-white/10 bg-bg-card p-4 text-center text-sm text-text-3">
          {t('kyc.reviewPending')}
        </div>
      )}

      {/* Approved */}
      {st === 'approved' && (
        <div className="rounded-xl border border-success/30 bg-success/15 p-4 text-center text-sm text-success">
          {t('kyc.approvedDone')}
        </div>
      )}
    </div>
  );
}
