import { useNavigate } from 'react-router-dom';
import { useSiteSearch } from './useSiteSearch';
import SearchResults from './SearchResults';

/**
 * Navbar'daki arama ikonuna bağlı dropdown panel — sayfaya göre ayrı bir
 * "mod" YOK: oyun/sağlayıcı araması ile etkinlik araması her zaman BİRLİKTE
 * çalışır (hangi sayfada olursan ol). Bir oyun adıyla bir etkinlik adı
 * çakışmaz, bir etkinlik de zaten ya canlı ya yaklaşan durumda olur — bu
 * yüzden ayrıştırma gereksiz karmaşıklık. Etkinlik araması `status` VERMEDEN
 * `searchEvents()` çağırır (bkz. eventsStore.js / GET /events controller'ı):
 * status boşsa hem canlı hem yaklaşan etkinlikler birlikte döner.
 *
 * Arama mantığı ve sonuç markup'ı mobil tam ekran panel ile ortaktır
 * (bkz. useSiteSearch.js, SearchResults.jsx, MobileSearchPanel.jsx).
 */
export default function SearchOverlay({ onClose }) {
  const navigate = useNavigate();
  const state = useSiteSearch();
  const { t, query, setQuery, inputRef } = state;

  function go(to) {
    onClose();
    navigate(to);
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-[min(380px,90vw)] max-h-[70vh] overflow-y-auto no-scrollbar rounded-2xl shadow-2xl z-50 bg-bg-card border border-white/10 p-3 animate-fade-in">
      <input
        ref={inputRef}
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={t('nav.searchPlaceholder')}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:outline-none focus:border-primary/40"
      />
      <SearchResults state={state} onPick={go} />
    </div>
  );
}
