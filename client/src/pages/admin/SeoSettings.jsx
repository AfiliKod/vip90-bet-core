import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { useToastStore } from '../../store/toastStore';
import { useTranslation } from '../../i18n';
import { ADMIN_BTN_PRIMARY, ADMIN_BTN_GHOST } from '../../components/admin/AdminPageHeader.jsx';
import { useBrandingStore } from '../../store/brandingStore';
import { formatTitle, DEFAULT_SITE_TITLE } from '../../seo/titles';
import {
  validateSeo, extractVerificationCode, normalizeTwitterHandle, DESCRIPTION_RECOMMENDED,
} from '../../seo/validate';

/**
 * Settings → SEO sekmesi. Değerler server/src/seo/ ile saklanır ve oyuncu
 * sitesinin <head>'ine sunucu tarafında enjekte edilir. Serbest HTML/script
 * alanı YOKTUR; yalnızca biçimi doğrulanmış kimlikler kabul edilir.
 */
const FIELDS = [
  'siteTitle', 'titleTemplate', 'description', 'keywords', 'canonicalBase', 'indexing',
  'ogImage', 'ogSiteName', 'twitterHandle', 'twitterCard',
  'googleVerification', 'bingVerification', 'yandexVerification',
  'ga4Id', 'gtmId', 'pixelId',
];

const INPUT = 'w-full bg-bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:outline-none focus:border-white/25';
const INPUT_ERR = 'border-danger/70';

function Section({ icon, title, hint, children }) {
  return (
    <section className="rounded-xl border border-white/10 bg-bg-card p-4">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
          <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">{icon}</span>
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-text-1">{title}</h3>
          {hint && <p className="text-[11.5px] text-text-3">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ id, label, help, error, className = '', children }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-text-2">{label}</label>
      {children}
      {error ? <div className="mt-1 text-[11px] text-danger" role="alert">{error}</div>
        : help ? <div className="mt-1 text-[11px] text-text-3/70">{help}</div> : null}
    </div>
  );
}

function SerpPreview({ t, title, url, description }) {
  return (
    <div className="rounded-lg bg-white p-3 text-left" aria-label={t('admin.seo.previewGoogle')}>
      <div className="truncate text-[12px] text-[#4d5156]">{url}</div>
      <div className="truncate text-[18px] leading-snug text-[#1a0dab]">{title}</div>
      <div className="line-clamp-2 text-[13px] leading-snug text-[#4d5156]">{description}</div>
    </div>
  );
}

function LinkPreview({ t, large, image, host, title, description }) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-white/10 bg-bg-deep ${large ? '' : 'flex'}`}
      aria-label={t('admin.seo.previewLink')}
    >
      <div className={`grid place-items-center bg-bg-hover text-text-3 ${large ? 'aspect-[1.91/1] w-full' : 'h-24 w-24 shrink-0'}`}>
        {image
          ? <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          : <span className="material-symbols-outlined !text-[32px]" aria-hidden="true">image</span>}
      </div>
      <div className="min-w-0 p-3">
        <div className="truncate text-[11px] uppercase tracking-wide text-text-3">{host}</div>
        <div className="truncate text-sm font-bold text-text-1">{title}</div>
        <div className="line-clamp-2 text-[12px] text-text-2">{description}</div>
      </div>
    </div>
  );
}

export default function SeoSettings() {
  const { t } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const brandName = useBrandingStore(s => s.siteName);
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/admin/settings/seo')
      .then(r => { setSaved(r.data.settings); setForm({}); })
      .catch(() => addToast(t('admin.seo.loadFailed'), 'error'));
  }, [t, addToast]);

  const values = useMemo(() => ({ ...(saved || {}), ...form }), [saved, form]);
  const errors = useMemo(() => validateSeo(values), [values]);
  const dirtyKeys = Object.keys(form).filter(k => String(form[k] ?? '') !== String(saved?.[k] ?? ''));
  const dirty = dirtyKeys.length > 0;
  const hasErrors = Object.keys(errors).length > 0;

  if (!saved) return <div className="h-64 animate-pulse rounded-xl bg-bg-card" />;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const err = k => (errors[k] ? t(errors[k]) : null);
  const cls = k => `${INPUT} ${errors[k] ? INPUT_ERR : ''}`;
  const val = k => values[k] ?? '';

  async function save() {
    if (hasErrors) { addToast(t('admin.seo.fixErrors'), 'error'); return; }
    setSaving(true);
    try {
      const patch = {};
      for (const k of dirtyKeys) {
        let v = form[k];
        if (k.endsWith('Verification')) v = extractVerificationCode(v);
        if (k === 'twitterHandle') v = normalizeTwitterHandle(v);
        patch[k] = v;
      }
      const r = await api.put('/admin/settings/seo', patch);
      setSaved(r.data.settings);
      setForm({});
      addToast(t('admin.seo.saved'), 'success');
    } catch (e) {
      addToast(e.response?.data?.error?.message || t('admin.seo.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  const site = values.siteTitle || brandName || DEFAULT_SITE_TITLE;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = values.canonicalBase || origin;
  const host = base.replace(/^https?:\/\//, '');
  const descLen = String(values.description || '').length;
  const placeholders = { page: '{page}', site: '{site}' };
  const sampleTitle = formatTitle(values.titleTemplate, t('nav.casino'), site);
  const imageSrc = values.ogImage ? (values.ogImage.startsWith('/') ? `${origin}${values.ogImage}` : values.ogImage) : '';
  const imageOk = !errors.ogImage;
  const description = values.description || t('admin.seo.previewNoDescription');

  return (
    <div className="space-y-4">
      <Section icon="search" title={t('admin.seo.general')} hint={t('admin.seo.generalHint')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="seo-siteTitle" label={t('admin.seo.siteTitle')} help={t('admin.seo.siteTitleHelp')}>
            <input id="seo-siteTitle" className={INPUT} maxLength={120} value={val('siteTitle')} placeholder={brandName || DEFAULT_SITE_TITLE} onChange={e => set('siteTitle', e.target.value)} />
          </Field>
          <Field id="seo-titleTemplate" label={t('admin.seo.titleTemplate')} help={t('admin.seo.titleTemplateHelp', placeholders)} error={err('titleTemplate')}>
            <input id="seo-titleTemplate" className={cls('titleTemplate')} maxLength={120} value={val('titleTemplate')} placeholder="{page} | {site}" onChange={e => set('titleTemplate', e.target.value)} />
          </Field>
          <Field id="seo-description" className="sm:col-span-2" label={t('admin.seo.description')}
            help={<span className={descLen > DESCRIPTION_RECOMMENDED ? 'text-warning' : ''}>{t('admin.seo.descriptionCount', { n: descLen, max: DESCRIPTION_RECOMMENDED })}</span>}>
            <textarea id="seo-description" rows={3} className={INPUT} maxLength={320} value={val('description')} onChange={e => set('description', e.target.value)} />
          </Field>
          <Field id="seo-keywords" label={t('admin.seo.keywords')} help={t('admin.seo.keywordsHelp')}>
            <input id="seo-keywords" className={INPUT} maxLength={300} value={val('keywords')} onChange={e => set('keywords', e.target.value)} />
          </Field>
          <Field id="seo-canonicalBase" label={t('admin.seo.canonicalBase')} help={t('admin.seo.canonicalBaseHelp')} error={err('canonicalBase')}>
            <input id="seo-canonicalBase" className={cls('canonicalBase')} inputMode="url" value={val('canonicalBase')} placeholder="https://example.com" onChange={e => set('canonicalBase', e.target.value)} />
          </Field>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-bg-hover p-3 sm:col-span-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-text-2">{t('admin.seo.indexing')}</div>
              <div className="text-[11px] text-text-3/70">{values.indexing === 'noindex' ? t('admin.seo.indexingOffHelp') : t('admin.seo.indexingOnHelp')}</div>
            </div>
            <button
              type="button" role="switch" aria-checked={values.indexing !== 'noindex'} aria-label={t('admin.seo.indexing')}
              onClick={() => set('indexing', values.indexing === 'noindex' ? 'index' : 'noindex')}
              className={`relative h-6 w-12 shrink-0 rounded-full transition ${values.indexing !== 'noindex' ? 'bg-success/80' : 'bg-white/10'}`}
            >
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${values.indexing !== 'noindex' ? 'translate-x-6' : ''}`} />
            </button>
          </div>
        </div>
      </Section>

      <Section icon="share" title={t('admin.seo.social')} hint={t('admin.seo.socialHint')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="seo-ogImage" className="sm:col-span-2" label={t('admin.seo.ogImage')} help={t('admin.seo.ogImageHelp')} error={err('ogImage')}>
            <input id="seo-ogImage" className={cls('ogImage')} inputMode="url" value={val('ogImage')} placeholder="https://example.com/og.jpg" onChange={e => set('ogImage', e.target.value)} />
          </Field>
          <Field id="seo-ogSiteName" label={t('admin.seo.ogSiteName')}>
            <input id="seo-ogSiteName" className={INPUT} maxLength={80} value={val('ogSiteName')} placeholder={site} onChange={e => set('ogSiteName', e.target.value)} />
          </Field>
          <Field id="seo-twitterHandle" label={t('admin.seo.twitterHandle')} error={err('twitterHandle')}>
            <input id="seo-twitterHandle" className={cls('twitterHandle')} autoComplete="off" value={val('twitterHandle')} placeholder="@username" onChange={e => set('twitterHandle', e.target.value)} />
          </Field>
          <Field id="seo-twitterCard" label={t('admin.seo.twitterCard')}>
            <select id="seo-twitterCard" className={INPUT} value={val('twitterCard') || 'summary_large_image'} onChange={e => set('twitterCard', e.target.value)}>
              <option value="summary">{t('admin.seo.cardSummary')}</option>
              <option value="summary_large_image">{t('admin.seo.cardLarge')}</option>
            </select>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-medium text-text-2">{t('admin.seo.previewGoogle')}</div>
            <SerpPreview t={t} title={site} url={base} description={description.slice(0, DESCRIPTION_RECOMMENDED)} />
            <div className="mt-1.5 text-[11px] text-text-3/70">{t('admin.seo.previewPageTitle', { title: sampleTitle })}</div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-text-2">{t('admin.seo.previewLink')}</div>
            <LinkPreview
              t={t} large={values.twitterCard !== 'summary'} image={imageOk ? imageSrc : ''}
              host={values.ogSiteName || host} title={site} description={description}
            />
          </div>
        </div>
      </Section>

      <Section icon="verified" title={t('admin.seo.verification')} hint={t('admin.seo.verificationHint')}>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['googleVerification', 'admin.seo.google'],
            ['bingVerification', 'admin.seo.bing'],
            ['yandexVerification', 'admin.seo.yandex'],
          ].map(([k, label]) => (
            <Field key={k} id={`seo-${k}`} label={t(label)} error={err(k)}>
              <input id={`seo-${k}`} className={cls(k)} autoComplete="off" value={val(k)} onChange={e => set(k, e.target.value)}
                onBlur={e => { const c = extractVerificationCode(e.target.value); if (c !== e.target.value) set(k, c); }} />
            </Field>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-text-3/70">{t('admin.seo.verificationPasteNote')}</p>
      </Section>

      <Section icon="monitoring" title={t('admin.seo.analytics')} hint={t('admin.seo.analyticsHint')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="seo-ga4Id" label={t('admin.seo.ga4')} error={err('ga4Id')}>
            <input id="seo-ga4Id" className={cls('ga4Id')} autoComplete="off" value={val('ga4Id')} placeholder="G-XXXXXXXXXX" onChange={e => set('ga4Id', e.target.value.trim())} />
          </Field>
          <Field id="seo-gtmId" label={t('admin.seo.gtm')} error={err('gtmId')}>
            <input id="seo-gtmId" className={cls('gtmId')} autoComplete="off" value={val('gtmId')} placeholder="GTM-XXXXXXX" onChange={e => set('gtmId', e.target.value.trim())} />
          </Field>
          <Field id="seo-pixelId" label={t('admin.seo.pixel')} error={err('pixelId')}>
            <input id="seo-pixelId" className={cls('pixelId')} inputMode="numeric" autoComplete="off" value={val('pixelId')} placeholder="1234567890" onChange={e => set('pixelId', e.target.value.trim())} />
          </Field>
        </div>
        <p className="mt-2 text-[11px] text-text-3/70">{t('admin.seo.analyticsNote')}</p>
      </Section>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving || !dirty} className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}>
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">save</span>
          {saving ? t('admin.settings.savingEllipsis') : t('common.save')}
        </button>
        <button onClick={() => setForm({})} disabled={saving || !dirty} className={`${ADMIN_BTN_GHOST} disabled:opacity-40`}>
          {t('admin.seo.discard')}
        </button>
        <span className="text-[11px] text-text-3/70">{t('admin.seo.cacheNote')}</span>
      </div>
    </div>
  );
}
