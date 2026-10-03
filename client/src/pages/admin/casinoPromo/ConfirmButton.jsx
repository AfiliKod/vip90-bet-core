import { useEffect, useRef, useState } from 'react';

/**
 * İki adımlı onay düğmesi (window.confirm yerine). İlk tıkta "Onayla"ya
 * dönüşür ve `confirmText` gösterilir; 5 sn içinde ikinci tık onaylar, aksi
 * halde kendiliğinden sıfırlanır.
 */
export default function ConfirmButton({ label, confirmLabel, confirmText, onConfirm, disabled, className = '', icon, title, block = false }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (disabled) { clearTimeout(timer.current); setArmed(false); } }, [disabled]);

  function click(e) {
    e.stopPropagation();
    if (disabled) return;
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 5000);
      return;
    }
    clearTimeout(timer.current);
    setArmed(false);
    onConfirm();
  }

  return (
    <span className={block ? 'block' : 'inline-flex flex-col items-start gap-1.5'}>
      {armed && confirmText && (
        <span role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-bold text-warning">
          {confirmText}
        </span>
      )}
      <button
        type="button"
        onClick={click}
        disabled={disabled}
        title={title}
        className={`${className} ${armed ? '!bg-warning !text-black' : ''} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {icon && <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">{armed ? 'check' : icon}</span>}
        {armed ? confirmLabel : label}
      </button>
    </span>
  );
}
