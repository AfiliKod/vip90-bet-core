import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import api from '../../../services/api';
import { useToastStore } from '../../../store/toastStore';
import { useTranslation } from '../../../i18n';
import { ADMIN_BTN_GHOST, ADMIN_BTN_PRIMARY } from '../../../components/admin/AdminPageHeader.jsx';
import BirthDatePicker from '../../../components/form/BirthDatePicker.jsx';
import PhoneInput from '../../../components/form/PhoneInput.jsx';

export default function CreateUserModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const { register, control, watch, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { role: 'user' }
  });
  const addToast = useToastStore(s => s.add);
  const role = watch('role');

  // Ek roller (yetkiler) yalnızca role='admin' seçiliyken anlamlı — ve yalnızca
  // istek sahibinin admin:roles:read izni varsa listelenebilir (yoksa API 403
  // döner, sessizce gizleniyor — UserSlideOver'daki desenle tutarlı).
  const [rolesList, setRolesList] = useState(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);

  useEffect(() => {
    if (role !== 'admin' || rolesList !== null) return;
    api.get('/admin/roles').then(r => setRolesList(r.data.roles)).catch(() => setRolesList([]));
  }, [role, rolesList]);

  const toggleRole = (roleId) => {
    setSelectedRoleIds(prev => prev.includes(roleId) ? prev.filter(id => id !== roleId) : [...prev, roleId]);
  };

  const onSubmit = async (data) => {
    try {
      await api.post('/admin/users', {
        ...data,
        roles: role === 'admin' ? selectedRoleIds : undefined,
      });
      addToast(t('admin.createUser.created'), 'success');
      onCreated();
      onClose();
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('common.error'), 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-card border border-white/10 rounded-2xl w-full max-w-md p-6 mx-4 max-h-[90vh] overflow-y-auto">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><span className="material-symbols-outlined !text-[16px]" aria-hidden="true">person_add</span></span>
            <h2 className="truncate text-base font-extrabold text-text-1">{t('admin.users.newUser')}</h2>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-bg-hover text-text-2 transition hover:text-text-1">
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.createUser.username')}</label>
            <input {...register('username', { required: true, minLength: 3 })}
              className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-primary/50 focus:outline-none" />
            {errors.username && <p className="text-danger text-xs mt-1">{t('admin.createUser.min3Chars')}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.users.email')}</label>
            <input type="email" {...register('email', { required: true })}
              className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-primary/50 focus:outline-none" />
            {errors.email && <p className="text-danger text-xs mt-1">{t('admin.createUser.validEmail')}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('auth.password')}</label>
            <input type="password" {...register('password', { required: true, minLength: 8 })}
              className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-primary/50 focus:outline-none" />
            {errors.password && <p className="text-danger text-xs mt-1">{t('admin.createUser.min8Chars')}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('auth.phone')}</label>
            <Controller name="phone" control={control} defaultValue=""
              render={({ field }) => <PhoneInput value={field.value} onChange={field.onChange} size="sm" />} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('auth.dateOfBirth')}</label>
            <Controller name="dateOfBirth" control={control} defaultValue=""
              render={({ field }) => <BirthDatePicker value={field.value} onChange={field.onChange} size="sm" />} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.userSlideOver.role')}</label>
            <select {...register('role')}
              className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-primary/50 focus:outline-none">
              <option value="user">{t('admin.userSlideOver.roleUser')}</option>
              <option value="admin">{t('admin.userSlideOver.roleAdmin')}</option>
            </select>
          </div>
          {role === 'admin' && rolesList && rolesList.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-bg-hover p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.userSlideOver.extraRoles')}</div>
              <div className="flex flex-wrap gap-2">
                {rolesList.map(r => {
                  const assigned = selectedRoleIds.includes(r._id);
                  return (
                    <button
                      key={r._id}
                      type="button"
                      onClick={() => toggleRole(r._id)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                        assigned
                          ? 'border-primary/40 bg-primary/15 text-primary'
                          : 'border-white/10 text-text-3 hover:border-white/25 hover:text-text-1'
                      }`}
                    >
                      {assigned && <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">check</span>}
                      {r.displayName}
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-text-3/70 mt-2 leading-snug">
                {t('admin.userSlideOver.extraRolesHelp')}
              </div>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.createUser.referredByLabel')}</label>
            <input {...register('referredBy')}
              className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-primary/50 focus:outline-none"
              placeholder={t('admin.createUser.referredByPlaceholder')} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className={`${ADMIN_BTN_GHOST} flex-1 justify-center`}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={isSubmitting}
              className={`${ADMIN_BTN_PRIMARY} flex-1 justify-center disabled:opacity-50`}>
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">person_add</span>
              {isSubmitting ? t('admin.createUser.creating') : t('admin.createUser.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
