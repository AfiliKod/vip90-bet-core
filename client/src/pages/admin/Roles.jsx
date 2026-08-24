import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';

/**
 * O4 — Kademeli yönetici yetkileri.
 *
 * services/permissions.js zaten tam yazılmıştı (rol/izin CRUD, izin
 * kontrolü) — bu sayfa eksik olan admin arayüzünü sağlıyor. Not: bu
 * roller şu an yalnızca veri katmanında tutuluyor; hiçbir mevcut route
 * henüz granüler izin kontrolü (requirePermission) uygulamıyor —
 * router-seviyesindeki requireAdmin hâlâ role==='admin' şartı arıyor.
 * Bu sayfa rol/izin TANIMLAMA ve kullanıcıya ATAMA'yı sağlıyor (bkz.
 * UserSlideOver.jsx'teki "Ek Roller" bölümü); gerçek erişim kısıtlaması
 * ayrı, daha büyük bir route-bazlı denetim turu gerektiriyor.
 */
export default function AdminRoles() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null); // null = kapalı, {} = yeni rol formu

  function load() {
    setError('');
    Promise.all([api.get('/admin/roles'), api.get('/admin/permissions')])
      .then(([r1, r2]) => { setRoles(r1.data.roles); setPermissions(r2.data.permissions); })
      .catch(() => setError(t('admin.roles.loadError')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const byCategory = permissions.reduce((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  function openCreate() {
    setForm({ name: '', displayName: '', description: '', priority: 10, permissions: [] });
  }

  function openEdit(role) {
    setForm({
      _id: role._id,
      displayName: role.displayName,
      description: role.description ?? '',
      priority: role.priority,
      permissions: role.permissions.map(p => p._id),
    });
  }

  function togglePerm(id) {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(id) ? f.permissions.filter(p => p !== id) : [...f.permissions, id],
    }));
  }

  async function save() {
    setError('');
    try {
      if (form._id) {
        await api.put(`/admin/roles/${form._id}`, {
          displayName: form.displayName, description: form.description,
          priority: Number(form.priority), permissions: form.permissions,
        });
      } else {
        await api.post('/admin/roles', {
          name: form.name, displayName: form.displayName, description: form.description,
          priority: Number(form.priority), permissions: form.permissions,
        });
      }
      setForm(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.roles.saveError'));
    }
  }

  async function remove(roleId) {
    setError('');
    try {
      await api.delete(`/admin/roles/${roleId}`);
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.roles.deleteError'));
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">{t('admin.roles.title')}</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium"
        >
          {t('admin.roles.newRole')}
        </button>
      </div>
      <p className="text-text-3 text-sm mb-6">{t('admin.roles.subtitle')}</p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-text-3">{t('admin.roles.loading')}</div>
      ) : (
        <div className="space-y-3">
          {roles.map(role => (
            <div key={role._id} className="bg-bg-card border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {role.displayName}
                    {role.isSystem && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-text-3 border border-white/10">
                        {t('admin.roles.systemBadge')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-3 mt-0.5">
                    {role.description} · {t('admin.roles.permCount', { count: role.permissions.length })}
                  </div>
                </div>
                {!role.isSystem && (
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(role)} className="px-3 py-1.5 rounded-lg text-xs border border-white/10 text-text-2 hover:text-text-1">
                      {t('common.edit')}
                    </button>
                    <button onClick={() => remove(role._id)} className="px-3 py-1.5 rounded-lg text-xs border border-red-500/20 text-red-300 hover:bg-red-500/10">
                      {t('common.delete')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setForm(null)}>
          <div className="bg-bg-card border border-white/10 rounded-xl p-5 max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold mb-4">{form._id ? t('admin.roles.editRole') : t('admin.roles.newRole')}</h2>

            {!form._id && (
              <label className="block text-xs text-text-3 mb-3">
                {t('admin.roles.nameField')}
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="casino_manager"
                  className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1"
                />
              </label>
            )}
            <label className="block text-xs text-text-3 mb-3">
              {t('admin.roles.displayNameField')}
              <input
                value={form.displayName}
                onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1"
              />
            </label>
            <label className="block text-xs text-text-3 mb-3">
              {t('admin.roles.descriptionField')}
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1"
              />
            </label>
            <label className="block text-xs text-text-3 mb-4">
              {t('admin.roles.priorityField')}
              <input
                type="number" min="0" max="99"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="mt-1 w-full h-9 rounded-lg bg-bg-base border border-white/10 px-3 text-sm text-text-1"
              />
            </label>

            <div className="text-xs text-text-3 mb-2">{t('admin.roles.permissionsField')}</div>
            <div className="space-y-3 mb-4">
              {Object.entries(byCategory).map(([cat, perms]) => (
                <div key={cat}>
                  <div className="text-[11px] uppercase tracking-wide text-text-3/70 mb-1">{cat}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {perms.map(p => (
                      <button
                        key={p._id}
                        type="button"
                        onClick={() => togglePerm(p._id)}
                        className={`px-2 py-1 rounded text-[11px] border transition ${
                          form.permissions.includes(p._id)
                            ? 'bg-primary/20 text-primary border-primary/30'
                            : 'border-white/10 text-text-3 hover:text-text-1'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={save} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium">
                {t('common.save')}
              </button>
              <button onClick={() => setForm(null)} className="px-4 py-2 rounded-lg border border-white/10 text-text-2 text-sm">
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
