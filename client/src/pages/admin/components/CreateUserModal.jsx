import { useForm } from 'react-hook-form';
import api from '../../../services/api';
import { useToastStore } from '../../../store/toastStore';
import { useTranslation } from '../../../i18n';

export default function CreateUserModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { role: 'user' }
  });
  const addToast = useToastStore(s => s.add);

  const onSubmit = async (data) => {
    try {
      await api.post('/admin/users', data);
      addToast(t('admin.createUser.created'), 'success');
      onCreated();
      onClose();
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('common.error'), 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-card border border-white/10 rounded-2xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-text-1">{t('admin.users.newUser')}</h2>
          <button onClick={onClose} className="text-text-3 hover:text-text-1 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-xs text-text-3 mb-1 block">{t('admin.createUser.username')}</label>
            <input {...register('username', { required: true, minLength: 3 })}
              className="w-full bg-bg-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-primary/50" />
            {errors.username && <p className="text-danger text-xs mt-1">{t('admin.createUser.min3Chars')}</p>}
          </div>
          <div>
            <label className="text-xs text-text-3 mb-1 block">{t('admin.users.email')}</label>
            <input type="email" {...register('email', { required: true })}
              className="w-full bg-bg-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-primary/50" />
            {errors.email && <p className="text-danger text-xs mt-1">{t('admin.createUser.validEmail')}</p>}
          </div>
          <div>
            <label className="text-xs text-text-3 mb-1 block">{t('auth.password')}</label>
            <input type="password" {...register('password', { required: true, minLength: 8 })}
              className="w-full bg-bg-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-primary/50" />
            {errors.password && <p className="text-danger text-xs mt-1">{t('admin.createUser.min8Chars')}</p>}
          </div>
          <div>
            <label className="text-xs text-text-3 mb-1 block">{t('admin.userSlideOver.role')}</label>
            <select {...register('role')}
              className="w-full bg-bg-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-primary/50">
              <option value="user">{t('admin.userSlideOver.roleUser')}</option>
              <option value="admin">{t('admin.userSlideOver.roleAdmin')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-text-3 mb-1 block">{t('admin.createUser.referredByLabel')}</label>
            <input {...register('referredBy')}
              className="w-full bg-bg-hover border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 focus:outline-none focus:border-primary/50"
              placeholder={t('admin.createUser.referredByPlaceholder')} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-white/10 text-text-3 text-sm hover:bg-bg-hover transition">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50">
              {isSubmitting ? t('admin.createUser.creating') : t('admin.createUser.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
