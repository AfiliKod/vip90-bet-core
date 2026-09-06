import { useEffect, useState } from 'react';
import api from '../../services/api';
import { DEFAULT_SECTION_ORDER, SECTION_LABELS, resolveSectionOrder, resolveBanners } from '../home/pageContent';
import { getPromoSlides, getHeroNavSlides } from '../home/promoSlides';
import { useTranslation } from '../../i18n';

const SLIDE_IMAGE_MAX_BYTES = 500_000;

// Kullanıcıya slayt id'sinden daha okunur bir başlık göstermek için —
// resolveBanners()'ın kendi mantığına dokunmaz, salt UI etiketi.
const SLIDE_LABELS = {
  welcome: 'Hoş Geldiniz (gezinme)',
  sports: 'Spor Bahisleri (gezinme)',
  live: 'Canlı Bahis (gezinme)',
  casino: 'Casino (gezinme)',
  'deneme-bonusu': 'Deneme Bonusu (kampanya)',
  'hosgeldin-bonusu': 'Hoşgeldin Bonusu (kampanya)',
  'arkadasini-getir': 'Arkadaşını Getir (kampanya)',
};

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
      .catch(() => setNotice({ type: 'error', text: 'Sayfa içeriği yüklenemedi' }))
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
      setNotice({ type: 'error', text: 'Görsel dosyası olmalı (PNG, JPG, WEBP…)' });
      return;
    }
    if (file.size > SLIDE_IMAGE_MAX_BYTES) {
      setNotice({ type: 'error', text: `Dosya çok büyük (maks ${Math.round(SLIDE_IMAGE_MAX_BYTES / 1024)} KB)` });
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      updateBannerText(id, 'image', dataUrl);
      setNotice(null);
    } catch {
      setNotice({ type: 'error', text: 'Dosya okunamadı' });
    }
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      await api.patch('/admin/pages/home', { sectionOrder, banners });
      setNotice({ type: 'ok', text: 'Kaydedildi' });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || 'Kaydedilemedi' });
    } finally {
      setSaving(false);
    }
  }

  const hiddenSections = DEFAULT_SECTION_ORDER.filter(id => !sectionOrder.includes(id));
  const hiddenBanners = ALL_SLIDES.filter(b => !banners.some(x => x.id === b.id));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-text-1 mb-1">🎞️ Slider Düzenleme Aracı</h1>
      <p className="text-text-3 text-sm mb-6">Ana sayfanın bölüm sırasını ve hero slider'ın tüm slaytlarını (görsel dahil) buradan yönetin.</p>

      {notice && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${notice.type === 'ok' ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="bg-bg-card border border-white/10 rounded-xl p-4 h-16 animate-pulse" />)}
        </div>
      ) : (
        <>
          <h2 className="text-sm font-bold text-text-2 uppercase tracking-wide mb-2">Bölüm Sırası</h2>
          <div className="space-y-2 mb-8">
            {sectionOrder.map((id, i) => (
              <div key={id} className="bg-bg-card border border-white/10 rounded-lg p-3 flex items-center gap-3">
                <span className="flex-1 text-sm text-text-1">{SECTION_LABELS[id] || id}</span>
                <button onClick={() => moveSection(i, -1)} disabled={i === 0} className="text-text-3 hover:text-text-1 disabled:opacity-30 px-2">↑</button>
                <button onClick={() => moveSection(i, 1)} disabled={i === sectionOrder.length - 1} className="text-text-3 hover:text-text-1 disabled:opacity-30 px-2">↓</button>
                <button onClick={() => toggleSection(id)} className="text-xs text-red-300 hover:text-red-200 px-2">Gizle</button>
              </div>
            ))}
          </div>
          {hiddenSections.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8 -mt-6">
              {hiddenSections.map(id => (
                <button
                  key={id}
                  onClick={() => toggleSection(id)}
                  className="text-xs bg-white/5 text-text-3 border border-white/10 rounded-full px-3 py-1 hover:text-text-1"
                >
                  + {SECTION_LABELS[id] || id}
                </button>
              ))}
            </div>
          )}

          <h2 className="text-sm font-bold text-text-2 uppercase tracking-wide mb-2">Hero Slider Slaytları</h2>
          <div className="space-y-3 mb-4">
            {banners.map((b, i) => (
              <div key={b.id} className="bg-bg-card border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="flex-1 text-sm font-semibold text-text-1">{SLIDE_LABELS[b.id] || b.id}</span>
                  <button onClick={() => moveBanner(i, -1)} disabled={i === 0} className="text-text-3 hover:text-text-1 disabled:opacity-30 px-2">↑</button>
                  <button onClick={() => moveBanner(i, 1)} disabled={i === banners.length - 1} className="text-text-3 hover:text-text-1 disabled:opacity-30 px-2">↓</button>
                  <button onClick={() => toggleBanner(b.id)} className="text-xs text-red-300 hover:text-red-200 px-2">Gizle</button>
                </div>
                <div className="flex gap-3">
                  <div className="shrink-0">
                    {b.image && <img src={b.image} alt="" className="w-24 h-16 rounded-lg object-cover bg-white/5 border border-white/10 mb-1.5" />}
                    <label className="block text-center text-[11px] bg-bg-base border border-white/10 rounded-lg px-2 py-1.5 cursor-pointer text-text-2 hover:text-text-1">
                      Görsel Seç
                      <input type="file" accept="image/*" onChange={e => onImageChange(b.id, e)} className="hidden" />
                    </label>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-2 flex-1">
                    <input value={b.title} onChange={e => updateBannerText(b.id, 'title', e.target.value)} placeholder="Başlık" className="bg-bg-base border border-white/10 rounded-lg px-2 py-1.5 text-sm text-text-1" />
                    <input value={b.desc} onChange={e => updateBannerText(b.id, 'desc', e.target.value)} placeholder="Açıklama" className="bg-bg-base border border-white/10 rounded-lg px-2 py-1.5 text-sm text-text-1 sm:col-span-1" />
                    <input value={b.cta} onChange={e => updateBannerText(b.id, 'cta', e.target.value)} placeholder="Buton metni" className="bg-bg-base border border-white/10 rounded-lg px-2 py-1.5 text-sm text-text-1" />
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
                  className="text-xs bg-white/5 text-text-3 border border-white/10 rounded-full px-3 py-1 hover:text-text-1"
                >
                  + {SLIDE_LABELS[b.id] || b.id}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <button
        onClick={save}
        disabled={saving || loading}
        className="bg-primary text-black font-semibold px-5 py-2 rounded-lg disabled:opacity-40"
      >
        {saving ? 'Kaydediliyor…' : 'Kaydet'}
      </button>
    </div>
  );
}
