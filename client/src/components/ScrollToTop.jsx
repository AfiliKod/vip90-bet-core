import { useState, useEffect } from 'react';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 400);
    };

    // Window scroll event'i (genel kullanım)
    window.addEventListener('scroll', onScroll, { passive: true });

    // Layout'ın scroll container'ı (flex-1 overflow-y-auto div)
    const scrollContainer = document.querySelector('.overflow-y-auto');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', () => {
        setVisible(scrollContainer.scrollTop > 400);
      }, { passive: true });

      return () => {
        window.removeEventListener('scroll', onScroll);
        scrollContainer.removeEventListener('scroll', onScroll);
      };
    }

    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollUp() {
    const scrollContainer = document.querySelector('.overflow-y-auto');
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <button
      onClick={scrollUp}
      aria-label="Yukarı çık"
      className={`fixed bottom-20 left-4 lg:bottom-6 lg:left-6 z-50 w-10 h-10 rounded-lg flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-110 active:scale-95 border border-white/20 ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      title="Yukarı çık"
    >
      ↑
    </button>
  );
}
