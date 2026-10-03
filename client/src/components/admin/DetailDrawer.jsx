// client/src/components/admin/DetailDrawer.jsx
//
// UserSlideOver.jsx'in drawer iskeletinden (overlay + fixed right-0 panel)
// türetilmiş, generic sunum kabuğu. Veri çekme/iş mantığı YOK — sadece
// açma/kapama + header + içerik alanı. KycReview.jsx ve Agents.jsx bunu
// kullanır (bkz. Task 7/B3).
export default function DetailDrawer({ open, onClose, title, subtitle, headerActions, children }) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-bg-card border-l border-white/10 flex flex-col shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-white/10 gap-3">
          <div className="min-w-0">
            {title && <div className="font-bold text-text-1 truncate">{title}</div>}
            {subtitle && <div className="text-xs text-text-3 truncate">{subtitle}</div>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {headerActions}
            <button onClick={onClose} className="text-text-3 hover:text-text-1 text-2xl leading-none">&times;</button>
          </div>
        </div>
        <div className="p-4 space-y-4 flex-1">
          {children}
        </div>
      </div>
    </>
  );
}
