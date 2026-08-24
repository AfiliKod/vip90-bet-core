import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Footer from './Footer';
import LiveHelp from './LiveHelp';
import ChatWidgetContainer from './chat/ChatWidgetContainer';
import CookieConsent from './CookieConsent';
import ScrollToTop from './ScrollToTop';
import { useTranslation } from '../i18n';

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const showSidebar = !pathname.startsWith('/casino') && pathname !== '/';
  const [helpOpen, setHelpOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="flex pb-14 lg:pb-0" style={{ height: 'calc(100vh - 56px)' }}>
      {showSidebar && <Sidebar />}
      <div className="flex-1 overflow-y-auto min-w-0 relative" data-scroll-container>
        {children}
        <Footer onOpenHelp={() => setHelpOpen(true)} />

        {/* Live Help floating button */}
        <button
          onClick={() => setHelpOpen(o => !o)}
          className={`fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all ${
            helpOpen
              ? 'bg-bg-card border border-white/20 text-text-1 rotate-90'
              : 'bg-primary text-bg-deep hover:bg-primary/90'
          }`}
          title={t('layout.liveHelp')}
        >
          {helpOpen ? '✕' : '💬'}
        </button>

        <LiveHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
        <ChatWidgetContainer />
        <ScrollToTop />
        <CookieConsent />
      </div>
    </div>
  );
}
