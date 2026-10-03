import { useEffect, useState } from 'react';
import api from '../../services/api';
import { DEFAULT_SECTION_ORDER, getSectionLabel, resolveSectionOrder, resolveBanners } from '../home/pageContent';
import { getPromoSlides, getHeroNavSlides } from '../home/promoSlides';
import { useTranslation } from '../../i18n';
import { ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';

const SLIDE_IMAGE_MAX_BYTES = 500_000;

// Kullanıcıya slayt id'sinden daha okunur bir başlık göstermek için —
// resolveBanners()'ın kendi mantığına dokunmaz, salt UI etiketi.
function slideLabelKey(id) {
  return {
    welcome: 'admin.pages.slideLabels.welcome',
    sports: 'admin.pages.slideLabels.sports',
    live: 'admin.pages.slideLabels.live',
    casino: 'admin.pages.slideLabels.casino',
    'deneme-bonusu': 'admin.pages.slideLabels.trialBonus',
    'hosgeldin-bonusu': 'admin.pages.slideLabels.welcomeBonus',
    'arkadasini-getir': 'admin.pages.slideLabels.referFriend',
  }[id];
}

function move(list, index, dir) {
  const to = index + dir;
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Slider Düzenleme Aracı (A4, genişletilmiş): ana sayfanın 8 bölümünü
 * sırala/gizle, hero slider'ın TÜM slaytlarını (4 gezinme + 3 kampanya)
 * sırala/gizle/başlık-açıklama-buton metnini VE GÖRSELİNİ değiştir.
 * HomePage.jsx (PromoHeroSlider.jsx) aynı DEFAULT_SECTION_ORDER +
 * getPromoSlides()/getHeroNavSlides()'i kullanır — burada değiştirilen her
 * şey GET /api/pages/home üzerinden doğrudan canlı slider'a yansır.
 *
 * Görsel yükleme: Branding.jsx'teki AYNI desen — dosya tarayıcıda data: URL'e
 * çevrilip PATCH gövdesinde taşınır, sunucu dosya sistemine hiç dokunulmaz
 * (bkz. server/src/app.js'teki /api/admin/pages için 6mb body limiti).
 */
export default function AdminPages() {
  const { t } = useTranslation();
  const ALL_SLIDES = [...getPromoSlides(t), ...getHeroNavSlides(t)];
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [sectionOrder, setSectionOrder] = useState(DEFAULT_SECTION_ORDER);
  const [banners, setBanners] = useState(ALL_SLIDES.map(b => ({ id: b.id, title: b.title, desc: b.desc, cta: b.cta, image: b.image })));

  function load() {
    setLoading(true);
    api.get('/admin/pages/home')
      .then(({ data }) => {
        const content = data?.content;
        setSectionOrder(resolveSectionOrder(content?.sectionOrder));
        const resolved = resolveBanners(ALL_SLIDES, content?.banners);
        setBanners(resolved.map(b => ({ id: b.id, title: b.title, desc: b.desc, cta: b.cta, image: b.image })));
      })
      .catch(() => setNotice({ type: 'error', text: t('admin.pages.loadError') }))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function toggleSection(id) {
    setSectionOrder(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function moveSection(index, dir) {
    setSectionOrder(prev => move(prev, index, dir));
  }

  function toggleBanner(id) {
    const allIds = ALL_SLIDES.map(b => b.id);
    setBanners(prev => {
      if (prev.some(b => b.id === id)) return prev.filter(b => b.id !== id);
      const base = ALL_SLIDES.find(b => b.id === id);
      const added = [...prev, { id: base.id, title: base.title, desc: base.desc, cta: base.cta, image: base.image }];
      // Görünürlük dışı kalan orijinal sıralamayı olabildiğince koru.
      return added.sort((a, b) => allIds.indexOf(a.id) - allIds.indexOf(b.id));
    });
  }

  function moveBanner(index, dir) {
    setBanners(prev => move(prev, index, dir));
  }

  function updateBannerText(id, field, value) {
    setBanners(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  }

  async function onImageChange(id, e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // aynı dosyayı tekrar seçebilmek için
    if (!file) return;
    if (!/^image\//.test(file.type || '')) {
      setNotice({ type: 'error', text: t('admin.pages.imageMustBeImage') });
      return;
    }
    if (file.size > SLIDE_IMAGE_MAX_BYTES) {
      setNotice({ type: 'error', text: t('admin.pages.imageTooLarge', { maxKb: Math.round(SLIDE_IMAGE_MAX_BYTES / 1024) }) });
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      updateBannerText(id, 'image', dataUrl);
      setNotice(null);
    } catch {
      setNotice({ type: 'error', text: t('admin.pages.imageReadError') });
    }
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await api.patch('/admin/pages/home', { sectionOrder, banners });
      setNotice({ type: 'ok', text: t('admin.pages.saved') });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.pages.saveError') });
    } finally {
      setSaving(false);
    }
  }

  const hiddenSections = DEFAULT_SECTION_ORDER.filter(id => !sectionOrder.includes(id));
  const hiddenBanners = ALL_SLIDES.filter(b => !banners.some(x => x.id === b.id));

  return (
    <div className="max-w-3xl">
      <p className="text-text-3 text-sm mb-6">{t('admin.pages.subtitle')}</p>

      {notice && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${notice.type === 'ok' ? 'border-success/30 bg-success/15 text-success' : 'border-danger/30 bg-danger/15 text-danger'}`}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-bg-card border border-white/10 rounded-xl p-4 h-16 animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><span className="material-symbols-outlined !text-[16px]" aria-hidden="true">view_list</span></span>
            <h3 className="text-sm font-extrabold text-text-1">{t('admin.pages.sectionOrder')}</h3>
            <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">{sectionOrder.length}</span>
          </div>
          <div className="space-y-2 mb-8">
            {sectionOrder.map((id, i) => (
              <div key={id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-bg-card p-3">
                <span className="material-symbols-outlined !text-[16px] text-text-3/70" aria-hidden="true">drag_indicator</span>
                <span className="min-w-0 flex-1 truncate text-sm text-text-1">{getSectionLabel(t, id)}</span>
                <button onClick={() => moveSection(i, -1)} disabled={i === 0} aria-label={t('common.moveUp')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-bg-hover text-text-2 transition hover:text-text-1 disabled:opacity-30"><span className="material-symbols-outlined !text-[15px]" aria-hidden="true">arrow_upward</span></button>
                <button onClick={() => moveSection(i, 1)} disabled={i === sectionOrder.length - 1} aria-label={t('common.moveDown')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-bg-hover text-text-2 transition hover:text-text-1 disabled:opacity-30"><span className="material-symbols-outlined !text-[15px]" aria-hidden="true">arrow_downward</span></button>
                <button onClick={() => toggleSection(id)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2.5 text-xs font-bold text-danger transition hover:bg-danger/20"><span className="material-symbols-outlined !text-[14px]" aria-hidden="true">visibility_off</span>{t('admin.pages.hide')}</button>
              </div>
            ))}
          </div>
          {hiddenSections.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8 -mt-6">
              {hiddenSections.map(id => (
                <button
                  key={id}
                  onClick={() => toggleSection(id)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-text-3 transition hover:text-text-1"
                >
                  <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">add</span>
                  {getSectionLabel(t, id)}
                </button>
              ))}
            </div>
          )}

          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><span className="material-symbols-outlined !text-[16px]" aria-hidden="true">campaign</span></span>
            <h3 className="text-sm font-extrabold text-text-1">{t('admin.pages.heroSlides')}</h3>
            <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">{banners.length}</span>
          </div>
          <div className="space-y-3 mb-4">
            {banners.map((b, i) => (
              <div key={b.id} className="bg-bg-card border border-white/10 rounded-xl p-4">
                <div className="mb-3 flex items-center gap-3">
                  <span className="material-symbols-outlined !text-[16px] text-text-3/70" aria-hidden="true">drag_indicator</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-text-1">{slideLabelKey(b.id) ? t(slideLabelKey(b.id)) : b.id}</span>
                  <button onClick={() => moveBanner(i, -1)} disabled={i === 0} aria-label={t('common.moveUp')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-bg-hover text-text-2 transition hover:text-text-1 disabled:opacity-30"><span className="material-symbols-outlined !text-[15px]" aria-hidden="true">arrow_upward</span></button>
                  <button onClick={() => moveBanner(i, 1)} disabled={i === banners.length - 1} aria-label={t('common.moveDown')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-bg-hover text-text-2 transition hover:text-text-1 disabled:opacity-30"><span className="material-symbols-outlined !text-[15px]" aria-hidden="true">arrow_downward</span></button>
                  <button onClick={() => toggleBanner(b.id)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2.5 text-xs font-bold text-danger transition hover:bg-danger/20"><span className="material-symbols-outlined !text-[14px]" aria-hidden="true">visibility_off</span>{t('admin.pages.hide')}</button>
                </div>
                <div className="flex gap-3">
                  <div className="shrink-0">
                    {b.image && <img src={b.image} alt="" className="w-24 h-16 rounded-lg object-cover bg-white/5 border border-white/10 mb-1.5" />}
                    <label className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-white/10 bg-bg-card px-2 text-[11.5px] font-bold text-text-2 transition hover:bg-bg-hover hover:text-text-1">
                      {t('admin.pages.selectImage')}
                      <input type="file" accept="image/*" onChange={e => onImageChange(b.id, e)} className="hidden" />
                    </label>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2 flex-1">
                    <input value={b.title} onChange={e => updateBannerText(b.id, 'title', e.target.value)} placeholder={t('admin.pages.titlePlaceholder')} className="bg-bg-base border border-white/10 rounded-lg px-2 py-1.5 text-sm text-text-1" />
                    <input value={b.desc} onChange={e => updateBannerText(b.id, 'desc', e.target.value)} placeholder={t('admin.pages.descPlaceholder')} className="bg-bg-base border border-white/10 rounded-lg px-2 py-1.5 text-sm text-text-1 sm:col-span-1" />
                    <input value={b.cta} onChange={e => updateBannerText(b.id, 'cta', e.target.value)} placeholder={t('admin.pages.ctaPlaceholder')} className="bg-bg-base border border-white/10 rounded-lg px-2 py-1.5 text-sm text-text-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {hiddenBanners.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {hiddenBanners.map(b => (
                <button
                  key={b.id}
                  onClick={() => toggleBanner(b.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-text-3 transition hover:text-text-1"
                >
                  <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">add</span>
                  {slideLabelKey(b.id) ? t(slideLabelKey(b.id)) : b.id}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <button
        onClick={save}
        disabled={saving || loading}
        className={ADMIN_BTN_PRIMARY}
      >
        <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">save</span>
        {saving ? t('common.saving') : t('common.save')}
      </button>
    </div>
  );
}
