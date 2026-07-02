import { useState, useEffect } from 'react';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(true);

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
      className={`fixed bottom-20 left-4 lg:bottom-6 lg:left-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-110 active:scale-95 bg-cyan-500 text-white hover:bg-cyan-600 ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      title="Yukarı çık"
      disabled={!visible}
    >
      ⬆️
    </button>
  );
}
