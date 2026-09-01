import { useState, useEffect, useCallback } from 'react';
import { HOME_BG } from '../../pages/home/homeTheme';

/**
 * Yatay-kaydırmalı bir satırın (`overflow-x-auto`) sağ kenarına konan
 * "daha var" ipucu — konteyner GERÇEKTEN sağa kaydırılabilirken görünür,
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
      className="pointer-events-none absolute top-0 right-0 bottom-0 w-12 flex items-center justify-end pr-1"
      style={{ background: `linear-gradient(90deg, transparent 0%, ${HOME_BG}ee 70%)` }}
      aria-hidden="true"
    >
      <span className="material-symbols-outlined !text-[20px] text-white/70 animate-pulse">chevron_right</span>
    </div>
  );
}
