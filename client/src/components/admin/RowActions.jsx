import { useState, useRef, useLayoutEffect, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../i18n';
import { computeMenuPosition, nextFocusIndex, toneClass, runItem } from './rowActionsLogic.js';

/**
 * Satır aksiyonları: tek "⋮" butonu + portal'lı `fixed` menü.
 * items: [{ key, label, icon?, tone?: 'danger'|'success', disabled?, onClick, hidden? }]
 * Menü body'ye portal edilir; overflow-x-auto kapsayıcılarında kırpılmaz.
 * Tıklamalar satıra yayılmaz (stopPropagation) — React portal olayları
 * React ağacı üzerinden bubble ettiği için menü kapsayıcısında da durdurulur.
 */
export default function RowActions({ items, label, disabled = false, className = '' }) {
  const { t } = useTranslation();
  const list = (items || []).filter(it => it && !it.hidden);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    setPos(null);
    if (restoreFocus) btnRef.current?.focus();
  }, []);

  // Konum: menü ölçülür, tetikleyiciye göre viewport içine yerleştirilir.
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return;
    const a = btnRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    setPos(computeMenuPosition(
      { left: a.left, right: a.right, top: a.top, bottom: a.bottom },
      { width: m.width, height: m.height },
      { width: window.innerWidth, height: window.innerHeight },
    ));
  }, [open]);

  // İlk uygun öğeye odak.
  useEffect(() => {
    if (!open || !pos) return;
    const first = nextFocusIndex(list, -1, 'Home');
    if (first >= 0) itemRefs.current[first]?.focus();
    // yalnız menü ilk konumlandığında
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos === null]);

  // Dışarı tıklama, scroll, resize.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close(false);
    };
    const onAway = () => close(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('resize', onAway);
    window.addEventListener('scroll', onAway, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('resize', onAway);
      window.removeEventListener('scroll', onAway, true);
    };
  }, [open, close]);

  if (list.length === 0) return null;

  const moreLabel = label || t('common.moreActions');

  const onButtonKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    }
  };

  const onMenuKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key === 'Tab') { close(false); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const cur = itemRefs.current.findIndex(el => el === document.activeElement);
      const next = nextFocusIndex(list, cur, e.key);
      if (next >= 0) itemRefs.current[next]?.focus();
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={moreLabel}
        title={moreLabel}
        onClick={(e) => { e.stopPropagation(); open ? close(false) : setOpen(true); }}
        onKeyDown={onButtonKeyDown}
        className={`inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 text-text-2 transition hover:bg-bg-hover hover:text-text-1 disabled:opacity-40 ${open ? 'bg-bg-hover text-text-1' : ''} ${className}`}
      >
        <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">more_vert</span>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={moreLabel}
          onKeyDown={onMenuKeyDown}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos ? pos.top : 0, left: pos ? pos.left : 0, visibility: pos ? 'visible' : 'hidden' }}
          className="z-[1000] min-w-[11rem] max-w-[calc(100vw-16px)] rounded-xl border border-white/10 bg-bg-card py-1 shadow-xl shadow-black/40"
        >
          {list.map((it, i) => (
            <button
              key={it.key ?? i}
              ref={el => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                if (it.disabled) return;
                // Odak önce tetikleyiciye döner; handler modal açıp odağı alabilir.
                close(true);
                runItem(it);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold outline-none transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClass(it.tone)}`}
            >
              {it.icon && <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">{it.icon}</span>}
              <span className="min-w-0 truncate">{it.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
