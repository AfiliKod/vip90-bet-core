// client/src/pages/admin/communications/SegmentsPanel.jsx
//
// İletişim → Segments / Audiences: kampanya ve otomasyonların Hedeflemesi
// nerede tanımlanır sorusunun cevabı. İçerik ayrı sayfadan
// (`<Segments embedded />`) — burada yalnızca sayfanın bu bağlamdaki
// tanıtımı + mevcut segment component'i vardır (yeniden kodlanmaz).
import { useTranslation } from '../../../i18n';
import Segments from '../Segments.jsx';

export default function SegmentsPanel() {
  const { t } = useTranslation();
  return (
    <div>
      <p className="mb-4 max-w-3xl text-[13px] leading-relaxed text-text-3">
        {t('admin.communications.segments.hint')}
      </p>
      <Segments embedded />
    </div>
  );
}
