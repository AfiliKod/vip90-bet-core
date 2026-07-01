import { useState, useEffect } from 'react';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollUp() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <button
      onClick={scrollUp}
      aria-label="Yukarı çık"
      className={`fixed bottom-20 left-4 lg:bottom-6 lg:left-6 z-[60] w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
        visible
          ? 'opacity-100 scale-100'
          : 'opacity-0 scale-75 pointer-events-none'
      } bg-primary text-bg-deep hover:bg-primary/90 active:scale-95`}
      title="Yukarı çık"
    >
      <span className="material-symbols-outlined text-xl">arrow_upward</span>
    </button>
  );
}
