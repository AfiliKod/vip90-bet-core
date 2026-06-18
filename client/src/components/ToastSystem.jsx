import { useToastStore } from '../store/toastStore';
const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
const colors = {
  success: 'border-success/30 bg-success/10',
  error: 'border-danger/30 bg-danger/10',
  info: 'border-primary/30 bg-primary/10',
  warning: 'border-warning/30 bg-warning/10',
};
export default function ToastSystem() {
  const toasts = useToastStore(s => s.toasts);
  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm text-text-1 shadow-lg animate-fade-in ${colors[t.type] || colors.info}`}>
          <span>{icons[t.type] || icons.info}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
