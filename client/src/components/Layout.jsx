import { useLocation } from 'react-router-dom';
import HomeSidebar from './home/HomeSidebar';
import Footer from './Footer';
import ChatWidgetContainer from './chat/ChatWidgetContainer';
import CookieConsent from './CookieConsent';
import ScrollToTop from './ScrollToTop';

export default function Layout({ children }) {
  const { pathname } = useLocation();
  // Bahis/Live/EventDetail kendi bağlam-duyarlı HomeSidebar'ını içeride
  // kendisi render ediyor; Casino ve Anasayfa da kendi yerleşimini yönetiyor.
  // /legal/* kendi TOC (içindekiler) sidebar'ını (LegalLayout) korur — iki
  // sidebar üst üste binmesin diye burada HomeSidebar verilmiyor.
  // Geri kalan tüm sayfalar (Kampanyalar, Profil, Ayarlar, Favoriler,
  // Bahislerim, Son Oynananlar, Hakkımızda/Kariyer/Basın/İletişim, Yardım
  // Merkezi vb.) burada genel HomeSidebar kabuğunu alır — eskiden burada
  // spor-filtre ağacı (Sidebar.jsx) gösteriliyordu, bu sayfalarla hiç ilgisi
  // olmayan bir "Futbol/Basketbol/Tenis" listesiydi.
  const showSidebar = !pathname.startsWith('/casino') && !pathname.startsWith('/events/') && !pathname.startsWith('/legal') && pathname !== '/' && pathname !== '/bahis' && pathname !== '/canli';

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
        <Footer />
      </div>

      <ChatWidgetContainer />
      <ScrollToTop />
      <CookieConsent />
    </div>
  );
}
