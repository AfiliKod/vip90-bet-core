import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import HomeSidebar from './home/HomeSidebar';
import Footer from './Footer';
import LiveHelp from './LiveHelp';
import ChatWidgetContainer from './chat/ChatWidgetContainer';
import CookieConsent from './CookieConsent';
import ScrollToTop from './ScrollToTop';

export default function Layout({ children }) {
  const { pathname } = useLocation();
  // Canlı Yardım'ın sabit sağ-alt İKONU kaldırıldı (kullanıcı isteği) ama
  // özelliğin kendisi durmuyor — Footer'daki "Canlı Yardım" linki hâlâ
  // onOpenHelp ile bu paneli açabiliyor.
  const [helpOpen, setHelpOpen] = useState(false);
  // Bahis/Live/EventDetail kendi bağlam-duyarlı HomeSidebar'ını içeride
  // kendisi render ediyor; Casino ve Anasayfa da kendi yerleşimini yönetiyor.
  // /legal/* kendi TOC (içindekiler) sidebar'ını (LegalLayout) korur — iki
  // sidebar üst üste binmesin diye burada HomeSidebar verilmiyor.
  // Kampanyalar/Hakkımızda/Kariyer/Basın/İletişim/Yardım Masası/Profil/
  // Bahislerim/Ayarlar kullanıcı isteğiyle sadeleştirildi: sol sidebar +
  // sağ ray yok, yalnızca üst menü + tek sütun içerik + footer.
  // Favoriler/Son Oynananlar bu sadeleştirmenin dışında, HomeSidebar'ı
  // korumaya devam ediyor.
  const SIMPLE_PATHS = ['/promotions', '/help', '/profile', '/my-bets', '/settings', '/about', '/career', '/press', '/contact'];
  const showSidebar = !pathname.startsWith('/casino') && !pathname.startsWith('/events/') && !pathname.startsWith('/legal') && pathname !== '/' && pathname !== '/bahis' && pathname !== '/canli' && !SIMPLE_PATHS.includes(pathname);

  return (
    <div className="pb-14 lg:pb-0 relative" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Sidebar + içerik TEK scroll konteynerinde birlikte akar — Footer bu
          konteynerin içinde ama flex satırının DIŞINDA, tam genişlikte durur.
          Eskiden Footer flex-1 (içerik) sütununun içindeydi: sidebar içerik
          sütunundan kısa kaldığında Footer yalnızca içerik sütunu genişliğinde
          görünüyor, solunda sidebar'ın altında boşluk kalıyordu. */}
      <div className="h-full overflow-y-auto relative" data-scroll-container>
        <div className="flex">
          {showSidebar && (
            <div className="hidden lg:block shrink-0 pl-5 pt-5">
              <HomeSidebar />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {children}
          </div>
        </div>
        <Footer onOpenHelp={() => setHelpOpen(true)} />
      </div>

      <LiveHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ChatWidgetContainer />
      <ScrollToTop />
      <CookieConsent />
    </div>
  );
}
