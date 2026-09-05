import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n';

export default function ScrollToTop() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const scrollContainer = document.querySelector('[data-scroll-container]');
    if (!scrollContainer) return;

    const onScroll = () => setVisible(scrollContainer.scrollTop > 400);
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // sayfa değişiminde mevcut scroll pozisyonunu hemen yansıt

    return () => scrollContainer.removeEventListener('scroll', onScroll);
  }, []);

  function scrollUp() {
    const scrollContainer = document.querySelector('[data-scroll-container]');
    if (!scrollContainer) return;
    if ('scrollTo' in scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Bazı sekme/render bağlamlarında (arka plana alınmış sekme vb.)
    // requestAnimationFrame planlanmıyor ve smooth scrollTo hiç ilerlemiyor.
    // Kısa bir süre sonra hâlâ en üstte değilsek anlık olarak sıfırla —
    // düğmenin her koşulda gerçekten işlevsel kalmasını garantiler.
    setTimeout(() => {
      if (scrollContainer.scrollTop > 0) scrollContainer.scrollTop = 0;
    }, 500);
  }

  return (
    <button
      onClick={scrollUp}
      aria-label={t('scrollToTop.label')}
      className={`fixed bottom-24 left-4 lg:left-6 z-[60] w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-110 active:scale-95 border border-white/20 bg-bg-card ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      title={t('scrollToTop.label')}
    >
      ↑
    </button>
  );
}
