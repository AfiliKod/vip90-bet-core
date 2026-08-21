import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import UserSlideOver from './components/UserSlideOver.jsx';
import CreateUserModal from './components/CreateUserModal.jsx';
import { formatMoney } from '../../utils/money.js';

const STATUS_OPTS = [
  { value: 'all',       label: 'Tümü' },
  { value: 'active',    label: 'Aktif' },
  { value: 'suspended', label: 'Askıda' },
  { value: 'deleted',   label: 'Silinmiş' },
];

export default function AdminUsers() {
  const [users, setUsers]           = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pages, setPages]           = useState(1);
  const [search, setSearch]         = useState('');
  const [status, setStatus]         = useState('all');
  const [selected, setSelected]     = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const searchTimer = useRef(null);

  const load = useCallback((s, st, p) => {
    const params = new URLSearchParams({ search: s, status: st, page: p, limit: 20 });
    api.get(`/admin/users?${params}`).then(r => {
      setUsers(r.data.users);
      setTotal(r.data.total);
      setPages(r.data.pages);
    }).catch(() => {});
  }, []);

  useEffect(() => { load(search, status, page); }, [status, page]);

  const onSearch = (v) => {
    setSearch(v);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(v, status, 1), 300);
  };

  const onStatusChange = (v) => { setStatus(v); setPage(1); };

  const handleUpdated = () => {
    load(search, status, page);
    if (selected) {
      api.get(`/admin/users?search=${encodeURIComponent(selected.username)}&limit=1`)
        .then(r => { if (r.data.users[0]) setSelected(r.data.users[0]); })
        .catch(() => {});
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-text-1">Kullanıcı Yönetimi</h1>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-primary rounded-lg text-white text-sm font-semibold hover:bg-primary/90 transition">
          + Yeni Kullanıcı
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Kullanıcı adı veya e-posta ara…"
          className="flex-1 min-w-48 bg-bg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:border-primary/50"
        />
        <div className="flex gap-1 bg-bg-card border border-white/10 rounded-lg p-1">
          {STATUS_OPTS.map(o => (
            <button key={o.value} onClick={() => onStatusChange(o.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${status === o.value ? 'bg-primary text-white' : 'text-text-3 hover:text-text-1'}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tablo */}
      <div className="bg-bg-card border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10">
            <tr className="text-text-3 text-xs">
              <th className="text-left p-3 font-medium">Kullanıcı</th>
              <th className="text-left p-3 font-medium hidden sm:table-cell">E-posta</th>
              <th className="text-right p-3 font-medium">Bakiye</th>
              <th className="text-center p-3 font-medium">Durum</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u._id}
                onClick={() => setSelected(u)}
                className={`border-b border-white/5 hover:bg-bg-hover transition cursor-pointer last:border-0 ${u.deletedAt ? 'opacity-50' : ''}`}>
                <td className="p-3 text-text-1 font-medium">{u.username}</td>
                <td className="p-3 text-text-3 text-xs hidden sm:table-cell">{u.email}</td>
                <td className="p-3 text-right text-primary font-medium">{formatMoney(u.balance)}</td>
                <td className="p-3 text-center">
                  {u.deletedAt ? (
                    <span className="text-xs font-semibold text-danger/60">● Silindi</span>
                  ) : (
                    <span className={`text-xs font-semibold ${u.isActive ? 'text-success' : 'text-danger'}`}>
                      {u.isActive ? '● Aktif' : '● Askıda'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <div className="text-center text-text-3 py-8 text-sm">Kullanıcı bulunamadı</div>
        )}
      </div>

      {/* Sayfalama */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-text-3">Toplam {total} kullanıcı</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 rounded-lg border border-white/10 text-text-3 hover:bg-bg-hover disabled:opacity-30 transition">
              ‹ Önceki
            </button>
            <span className="px-3 py-1 text-text-2">{page} / {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
              className="px-3 py-1 rounded-lg border border-white/10 text-text-3 hover:bg-bg-hover disabled:opacity-30 transition">
              Sonraki ›
            </button>
          </div>
        </div>
      )}

      <UserSlideOver
        user={selected}
        onClose={() => setSelected(null)}
        onUpdated={handleUpdated}
      />
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => load(search, status, 1)}
        />
      )}
    </div>
  );
}
