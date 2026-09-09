import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { useToastStore } from '../../store/toastStore';
import { useFormatters } from '../../i18n/useFormatters.jsx';

const STATUS_FILTERS = [
  { value: '', label: 'Tümü' },
  { value: 'pending', label: 'Bekleyen' },
  { value: 'under_review', label: 'İncelenen' },
  { value: 'approved', label: 'Onaylanan' },
  { value: 'rejected', label: 'Reddedilen' },
];

const STATUS_BADGE = {
  not_started:  'bg-white/5 text-text-3 border-white/10',
  pending:      'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  under_review: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  approved:     'bg-green-500/20 text-green-300 border-green-500/30',
  rejected:     'bg-red-500/20 text-red-300 border-red-500/30',
  expired:      'bg-white/5 text-text-3 border-white/10',
};

const STATUS_LABELS = {
  not_started: 'Başlamadı', pending: 'Bekliyor', under_review: 'İnceleniyor',
  approved: 'Onaylandı', rejected: 'Reddedildi', expired: 'Süresi Doldu',
};

export default function AdminKycReview() {
  const fmt = useFormatters();
  const addToast = useToastStore(s => s.add);
  const [submissions, setSubmissions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailDocs, setDetailDocs] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [acting, setActing] = useState(false);
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (filter) params.set('status', filter);
      if (search) params.set('search', search);
      const [subRes, statsRes] = await Promise.all([
        api.get(`/admin/kyc/submissions?${params}`),
        api.get('/admin/kyc/stats').catch(() => ({ data: null })),
      ]);
      setSubmissions(subRes.data.submissions || []);
      setTotal(subRes.data.total || 0);
      setPages(subRes.data.pages || 1);
      setStats(statsRes.data);
    } catch {
      addToast('KYC başvuruları alınamadı.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, filter, search, addToast]);

  useEffect(() => { load(); }, [load]);

  async function openDetail(userId) {
    setSelected(userId);
    setDetailLoading(true);
    setShowReject(false);
    setRejectReason('');
    try {
      const { data } = await api.get(`/admin/kyc/submissions/${userId}`);
      setSelected(data.user);
      setDetailDocs(data.documents);
    } catch {
      addToast('Detay alınamadı.', 'error');
    } finally {
      setDetailLoading(false);
    }
  }

  async function approve() {
    if (!selected?._id) return;
    setActing(true);
    try {
      await api.post(`/admin/kyc/submissions/${selected._id}/approve`);
      addToast('KYC onaylandı.', 'success');
      setSelected(null);
      setDetailDocs(null);
      load();
    } catch (e) {
      addToast(e.response?.data?.error?.message || 'Onay başarısız.', 'error');
    } finally {
      setActing(false);
    }
  }

  async function reject() {
    if (!selected?._id || !rejectReason.trim()) return;
    setActing(true);
    try {
      await api.post(`/admin/kyc/submissions/${selected._id}/reject`, { reason: rejectReason });
      addToast('KYC reddedildi.', 'success');
      setSelected(null);
      setDetailDocs(null);
      setShowReject(false);
      setRejectReason('');
      load();
    } catch (e) {
      addToast(e.response?.data?.error?.message || 'Ret başarısız.', 'error');
    } finally {
      setActing(false);
    }
  }

  async function setUnderReview() {
    if (!selected?._id) return;
    setActing(true);
    try {
      await api.post(`/admin/kyc/submissions/${selected._id}/under-review`);
      addToast('İnceleniyor olarak işaretlendi.', 'success');
      openDetail(selected._id);
      load();
    } catch (e) {
      addToast(e.response?.data?.error?.message || 'İşlem başarısız.', 'error');
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">KYC İnceleme</h1>
        <p className="text-text-3 text-sm mt-1">
          Kullanıcı kimlik doğrulama başvurularını inceleyin, onaylayın veya reddedin.
        </p>
      </div>

      {/* İstatistikler */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {stats.byStatus?.map(s => (
            <div key={s._id} className="bg-bg-card border border-white/10 rounded-xl p-3">
              <div className="text-xs text-text-3">{STATUS_LABELS[s._id] || s._id}</div>
              <div className="text-lg font-bold text-text-1">{s.count}</div>
            </div>
          ))}
          <div className="bg-bg-card border border-white/10 rounded-xl p-3">
            <div className="text-xs text-text-3">Bugün Onaylanan</div>
            <div className="text-lg font-bold text-green-300">{stats.approvedToday || 0}</div>
          </div>
        </div>
      )}

      {/* Filtre + Arama */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 bg-bg-card border border-white/10 rounded-lg p-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setPage(1); }}
              className={`text-xs px-3 py-1.5 rounded transition ${filter === f.value ? 'bg-primary/20 text-primary' : 'text-text-3 hover:text-text-1'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Kullanıcı ara..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="bg-bg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:outline-none focus:border-white/25"
        />
        <div className="text-xs text-text-3 ml-auto">{total} başvuru</div>
      </div>

      {/* Başvuru Listesi */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-bg-card rounded-xl animate-pulse" />)}
        </div>
      ) : submissions.length === 0 ? (
        <div className="text-center text-text-3 text-sm py-12">Başvuru bulunamadı.</div>
      ) : (
        <div className="space-y-2">
          {submissions.map(u => (
            <button
              key={u._id}
              onClick={() => openDetail(u._id)}
              className="w-full flex items-center gap-4 p-3 bg-bg-card border border-white/10 rounded-xl hover:border-white/25 transition text-left"
            >
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-sm font-bold text-accent">
                {u.username?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-1">{u.username}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${STATUS_BADGE[u.kycStatus] || STATUS_BADGE.not_started}`}>
                    {STATUS_LABELS[u.kycStatus] || u.kycStatus}
                  </span>
                </div>
                <div className="text-xs text-text-3 truncate">{u.email}</div>
              </div>
              <div className="text-xs text-text-3">
                {u.docCounts ? `${u.docCounts.pending || 0} bekleyen` : ''}
              </div>
              <div className="text-xs text-text-3">
                {u.kycSubmittedAt ? fmt.formatDate(u.kycSubmittedAt) : '—'}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Sayfalama */}
      {pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="text-xs px-3 py-1.5 rounded border border-white/10 text-text-3 hover:text-text-1 disabled:opacity-40">
            Önceki
          </button>
          <span className="text-xs text-text-3 py-1.5">{page}/{pages}</span>
          <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
            className="text-xs px-3 py-1.5 rounded border border-white/10 text-text-3 hover:text-text-1 disabled:opacity-40">
            Sonraki
          </button>
        </div>
      )}

      {/* Detay Modal */}
      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => { setSelected(null); setDetailDocs(null); }} />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-bg-card border-l border-white/10 flex flex-col shadow-2xl overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div>
                <div className="font-bold text-text-1">{selected.username}</div>
                <div className="text-xs text-text-3">{selected.email}</div>
              </div>
              <button onClick={() => { setSelected(null); setDetailDocs(null); }} className="text-text-3 hover:text-text-1 text-2xl leading-none">&times;</button>
            </div>

            <div className="p-4 space-y-4">
              {/* Durum */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-2">Durum:</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[selected.kycStatus]}`}>
                  {STATUS_LABELS[selected.kycStatus]}
                </span>
              </div>

              {selected.kycSubmittedAt && (
                <div className="text-xs text-text-3">Başvuru: {fmt.formatDate(selected.kycSubmittedAt)}</div>
              )}
              {selected.kycRejectionReason && (
                <div className="text-xs text-red-300">Red sebebi: {selected.kycRejectionReason}</div>
              )}

              {/* Belgeler */}
              <div>
                <div className="text-xs font-medium text-text-2 mb-2">Belgeler</div>
                {detailLoading ? (
                  <div className="text-center text-text-3 text-sm py-4">Yükleniyor...</div>
                ) : detailDocs?.length > 0 ? (
                  <div className="space-y-2">
                    {detailDocs.map(doc => (
                      <div key={doc._id} className="bg-bg-hover rounded-xl p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{doc.mimeType === 'application/pdf' ? '📄' : '🖼️'}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-text-1 truncate">{doc.fileName}</div>
                            <div className="text-[10px] text-text-3">{doc.documentType} • {(doc.fileSize / 1024).toFixed(1)} KB</div>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${STATUS_BADGE[doc.status]}`}>
                            {STATUS_LABELS[doc.status] || doc.status}
                          </span>
                        </div>
                        {doc.fileUrl && (
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-accent hover:underline"
                          >
                            Belgeyi Görüntüle
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-text-3">Belge bulunamadı.</div>
                )}
              </div>

              {/* Aksiyonlar */}
              {(selected.kycStatus === 'pending' || selected.kycStatus === 'under_review' || selected.kycStatus === 'not_started') && (
                <div className="space-y-2 pt-2 border-t border-white/8">
                  {selected.kycStatus === 'pending' && (
                    <button
                      onClick={setUnderReview}
                      disabled={acting}
                      className="w-full py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 text-sm font-medium hover:bg-blue-500/30 transition disabled:opacity-40"
                    >
                      İnceleniyor Olarak İşaretle
                    </button>
                  )}
                  <button
                    onClick={approve}
                    disabled={acting}
                    className="w-full py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 text-sm font-medium hover:bg-green-500/30 transition disabled:opacity-40"
                  >
                    Onayla
                  </button>
                  {!showReject ? (
                    <button
                      onClick={() => setShowReject(true)}
                      className="w-full py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm font-medium hover:bg-red-500/30 transition"
                    >
                      Reddet
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <input
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="Red sebebi..."
                        className="w-full bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-white/25"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => { setShowReject(false); setRejectReason(''); }}
                          className="flex-1 py-2 rounded-lg border border-white/10 text-text-3 text-sm hover:bg-bg-hover transition">
                          İptal
                        </button>
                        <button onClick={reject} disabled={acting || !rejectReason.trim()}
                          className="flex-1 py-2 rounded-lg bg-red-500/80 text-white text-sm font-semibold hover:bg-red-500 transition disabled:opacity-40">
                          {acting ? 'İşleniyor...' : 'Reddet'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
