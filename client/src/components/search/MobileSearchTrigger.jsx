import { useState } from 'react';
import { useTranslation } from '../../i18n';
import MobileSearchPanel from './MobileSearchPanel';

/**
 * Mobil arama tetikleyicisi — section başlığındaki (h2) sağ boşlukta durur:
 * metin solda, ikon sağda. Navbar'daki arama ikonu `hidden sm:flex` olduğu
 * için mobilde (sm altı) hiç görünmüyordu; bu bileşen tam o aralıkta devreye
 * girer (sm üstünde navbar ikonu zaten var → çift buton olmaz) ve üstten inen
 * tam ekran paneli açar.
 */
export default function MobileSearchTrigger({ className = '' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('nav.search')}
        className={`sm:hidden shrink-0 flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/10 px-3 py-2 text-xs font-bold text-text-2 active:scale-95 transition ${className}`}
      >
        <span className="material-symbols-outlined !text-[17px]" style={{ color: 'var(--color-primary)' }} aria-hidden="true">search</span>
        <span>{t('nav.search')}</span>
      </button>
      {open && <MobileSearchPanel onClose={() => setOpen(false)} />}
    </>
  );
}
