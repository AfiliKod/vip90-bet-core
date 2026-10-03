// client/src/components/admin/AdminLayout.jsx
//
// Variant-C admin shell: masaüstü 240px kalıcı sidebar + 56px üst bar;
// mobilde hamburger + drawer (navigasyonda otomatik kapanır). Global
// müşteri Navbar/BottomNav bu rotalarda gizlenir (App.jsx SiteChrome).
import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AdminSidebar from './AdminSidebar.jsx';
import AdminTopbar from './AdminTopbar.jsx';

export default function AdminLayout() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Rota değişince drawer kapalı kalsın (back/forward dahil) — render sırasında
  // ayarlanan state (React: "adjusting state when a prop changes").
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setMobileOpen(false);
  }

  // Sayfa uzun scroll'daysa yeni sayfa eski pozisyonda açılmasın.
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="flex min-h-screen bg-bg-deep">
      {/* Masaüstü: kalıcı sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/10 bg-bg-base lg:flex">
        <AdminSidebar />
      </aside>

      {/* İçerik + üst bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar onMenuOpen={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      {/* Mobil: drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-white/10 bg-bg-base shadow-2xl lg:hidden">
            <AdminSidebar onClose={() => setMobileOpen(false)} />
          </aside>
        </>
      )}
    </div>
  );
}
