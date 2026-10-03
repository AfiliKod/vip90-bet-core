import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { ADMIN_BTN, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableEmpty, AdminKpiCard, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

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
  const { t, locale } = useTranslation();
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
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupPlatform') }, { label: t('admin.roles.title') }]}
        title={t('admin.roles.title')}
        sub={t('admin.roles.subtitle')}
        actions={(
          <button onClick={openCreate} className={ADMIN_BTN_PRIMARY}>
            {t('admin.roles.newRole')}
          </button>
        )}
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <AdminTable
          columns={[
            { key: 'role', label: t('admin.roles.columnRole') },
            { key: 'perms', label: t('admin.roles.columnPermissions') },
            { key: 'priority', label: t('admin.roles.columnPriority'), align: 'right' },
            { key: 'actions', label: t('admin.roles.columnActions'), align: 'right' },
          ]}
        >
          <AdminTableEmpty colSpan={4}>{t('admin.roles.loading')}</AdminTableEmpty>
        </AdminTable>
      ) : (
        <>
          {/* Mini KPI */}
          <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
            {[
              { label: t('admin.roles.statRoles'), value: roles.length.toLocaleString(locale) },
              { label: t('admin.roles.statPerms'), value: permissions.length.toLocaleString(locale) },
              { label: t('admin.roles.statSystem'), value: roles.filter(r => r.isSystem).length.toLocaleString(locale) },
            ].map(k => <AdminKpiCard key={k.label} label={k.label} value={k.value} />)}
          </section>

          <AdminTable
            empty={roles.length === 0}
            emptyLabel={t('common.noData')}
            columns={[
              { key: 'role', label: t('admin.roles.columnRole') },
              { key: 'perms', label: t('admin.roles.columnPermissions') },
              { key: 'priority', label: t('admin.roles.columnPriority'), align: 'right' },
              { key: 'actions', label: t('admin.roles.columnActions'), align: 'right' },
            ]}
          >
            {roles.map(role => {
              const initials = (role.displayName || role.name || '?').slice(0, 2).toUpperCase();
              return (
                <AdminTableRow key={role._id} className="cursor-pointer" onClick={() => openEdit(role)}>
                  <AdminTableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-primary/15 text-[11px] font-extrabold text-primary">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-bold text-text-1">{role.displayName}</span>
                          {role.isSystem && (
                            <span className="shrink-0 rounded-full bg-gold/15 px-2 py-[3px] text-[10.5px] font-extrabold uppercase text-gold">
                              {t('admin.roles.systemBadge')}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-xs text-text-3">{role.description || '—'}</div>
                      </div>
                    </div>
                  </AdminTableCell>
                  <AdminTableCell>
                    <span className="rounded-full bg-info/15 px-2.5 py-1 font-mono text-[11px] font-extrabold text-info">
                      {t('admin.roles.permCount', { count: role.permissions.length })}
                    </span>
                  </AdminTableCell>
                  <AdminTableCell align="right">
                    <span className="font-mono text-xs tabular-nums text-text-2">{role.priority}</span>
                  </AdminTableCell>
                  <AdminTableActionsCell>
                    <RowActions
                      label={t('admin.roles.columnActions')}
                      items={[
                        { key: 'edit', label: t('common.edit'), icon: 'edit', onClick: () => openEdit(role) },
                        { key: 'delete', label: t('common.delete'), icon: 'delete', tone: 'danger', hidden: role.isSystem, onClick: () => remove(role._id) },
                      ]}
                    />
                  </AdminTableActionsCell>
                </AdminTableRow>
              );
            })}
          </AdminTable>
        </>
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

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setForm(null)} className={ADMIN_BTN}>
                {t('common.cancel')}
              </button>
              <button onClick={save} className={ADMIN_BTN_PRIMARY}>
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
