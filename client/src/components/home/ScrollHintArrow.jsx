import { useState, useEffect, useCallback } from 'react';
import { HOME_BG, HOME_CARD, HOME_BORDER } from '../../pages/home/homeTheme';

function ScrollButton({ side, onClick }) {
  const isLeft = side === 'left';
  return (
    <div
      className={`pointer-events-none absolute top-0 ${isLeft ? 'left-0 justify-start pl-1.5' : 'right-0 justify-end pr-1.5'} bottom-0 w-16 flex items-center`}
      style={{
        background: isLeft
          ? `linear-gradient(270deg, transparent 0%, ${HOME_BG}f2 60%)`
          : `linear-gradient(90deg, transparent 0%, ${HOME_BG}f2 60%)`,
      }}
      aria-hidden="true"
    >
      <button
        type="button"
        aria-label={isLeft ? 'Sola kaydır' : 'Sağa kaydır'}
        onClick={onClick}
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
          {isLeft ? 'chevron_left' : 'chevron_right'}
        </span>
      </button>
    </div>
  );
}

/**
 * Yatay-kaydırmalı bir satırın (`overflow-x-auto`) iki kenarına konan
 * GERÇEK kaydırma butonları — sağ buton satır sağa kaydırılabilirken,
 * sol buton (satır zaten sağa kaydırılıp solda oyun biriktiğinde) satır
 * başa dönene kadar görünür. `containerRef` çağıranın `overflow-x-auto`
 * elemanına bağlanır; bu component o elemanı SARMALAYAN `relative` div'in
 * içine, kardeş olarak konur (bkz. ProviderRow.jsx / HomePage.jsx kullanımı).
 */
export default function ScrollHintArrow({ containerRef }) {
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(maxScroll > 4 && el.scrollLeft < maxScroll - 4);
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

  function scroll(direction) {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' });
  }

  return (
    <>
      {canLeft && <ScrollButton side="left" onClick={() => scroll(-1)} />}
      {canRight && <ScrollButton side="right" onClick={() => scroll(1)} />}
    </>
  );
}
