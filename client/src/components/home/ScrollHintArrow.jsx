import { useState, useEffect, useCallback } from 'react';
import { HOME_BG, HOME_CARD, HOME_BORDER } from '../../pages/home/homeTheme';

/**
 * Yatay-kaydırmalı bir satırın (`overflow-x-auto`) sağ kenarına konan
 * GERÇEK bir kaydırma butonu — konteyner sağa kaydırılabilirken görünür,
 * sona gelince kaybolur. `containerRef` çağıranın `overflow-x-auto`
 * elemanına bağlanır; bu component o elemanı SARMALAYAN `relative` div'in
 * içine, kardeş olarak konur (bkz. ProviderRow.jsx / HomePage.jsx kullanımı).
 */
export default function ScrollHintArrow({ containerRef }) {
  const [visible, setVisible] = useState(false);

  const update = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setVisible(maxScroll > 4 && el.scrollLeft < maxScroll - 4);
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [containerRef, update]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute top-0 right-0 bottom-0 w-16 flex items-center justify-end pr-1.5"
      style={{ background: `linear-gradient(90deg, transparent 0%, ${HOME_BG}f2 60%)` }}
      aria-hidden="true"
    >
      <button
        type="button"
        aria-label="Sağa kaydır"
        onClick={() => {
          const el = containerRef.current;
          if (!el) return;
          el.scrollBy({ left: el.clientWidth * 0.85, behavior: 'smooth' });
        }}
        className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-200 hover:scale-110 active:scale-95"
        style={{ background: HOME_CARD, border: `1px solid ${HOME_BORDER}`, boxShadow: '0 2px 12px rgba(0,0,0,0.45)' }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'var(--color-primary)';
          e.currentTarget.querySelector('span').style.color = 'var(--color-primary)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = HOME_BORDER;
          e.currentTarget.querySelector('span').style.color = '#fff';
        }}
      >
        <span className="material-symbols-outlined !text-[24px] text-white transition-colors duration-200" aria-hidden="true">
          chevron_right
        </span>
      </button>
    </div>
  );
}
