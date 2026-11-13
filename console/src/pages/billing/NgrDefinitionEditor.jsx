import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { billingApi } from '../../api/client.js';

const h = React.createElement;

export const NGR_CATEGORIES = ['bonus', 'provider_fee', 'tax', 'chargeback', 'other'];
export const NGR_SOURCES = ['stat_field', 'fee_plan', 'rate', 'fixed'];

export const STAT_FIELD_OPTIONS = [
  { field: 'bonusCost', category: 'bonus', label: 'Bonus Maliyeti (bonusCost)' },
  { field: 'providerFees', category: 'provider_fee', label: 'Sağlayıcı Ücretleri (providerFees)' },
  { field: 'chargebacks', category: 'chargeback', label: 'Ters İbrazlar (chargebacks)' },
];

export const STAT_FIELD_CATEGORY = {
  bonusCost: 'bonus',
  providerFees: 'provider_fee',
  chargebacks: 'chargeback',
};

export const NGR_ERROR_EXPLANATIONS = {
  ERR_NGR_DUPLICATE_CATEGORY: 'Aynı kesinti kategorisi birden fazla kez eklenemez (çift kesinti koruması).',
  ERR_NGR_DUPLICATE_LABEL: '"Diğer" kategorisindeki kesintiler için mükerrer etiket kullanılamaz.',
  ERR_NGR_DUPLICATE_SOURCE: 'Aynı veri kaynağı birden fazla kesinti kalemi için kullanılamaz.',
  ERR_NGR_ALREADY_NET_OF: 'Bu kesinti kategorisi zaten GGR\'dan düşülmüş olduğundan tekrar kesinti yapılamaz.',
  ERR_NGR_UNSUPPORTED_PERIOD: 'Sabit kesintiler için yalnızca günlük ("day") periyot desteklenir.',
  ERR_NGR_UNKNOWN_CATEGORY: 'Geçersiz kesinti kategorisi seçildi.',
  ERR_NGR_UNKNOWN_SOURCE: 'Geçersiz kesinti veri kaynağı seçildi.',
  ERR_NGR_DOUBLE_DEDUCTION: 'Çift kesinti koruması ihlal edildi: aynı maliyet birden fazla kez düşülemez.',
  ERR_TERMS_REQUIRED: 'Ticari koşullar zorunludur.',
  ERR_TERMS_MODEL: 'Geçerli bir hesaplama modeli seçilmelidir.',
  ERR_TERMS_BASE: 'Geçerli bir hesaplama tabanı seçilmelidir.',
  ERR_TERMS_RATE: 'Komisyon oranı zorunludur ve 0 ile 1 arasında olmalıdır.',
  ERR_TERMS_NGR_DEFINITION: 'NGR hesaplaması için geçerli bir NGR tanımı ve sürümü seçilmelidir.',
  ERR_NGR_DEFINITION_IN_USE: 'Bu NGR tanımı sürümü kesinleşmiş bir ekstre tarafından kullanıldığından değiştirilemez. Lütfen yeni bir sürüm oluşturun.',
  NAME_IS_REQUIRED: 'Tanım adı zorunludur.',
  NOT_FOUND: 'NGR tanımı bulunamadı.',
};

/**
 * Pure validation function mirroring backend rules (K28).
 * Evaluates duplicate category, duplicate label in other, duplicate source,
 * ggrAlreadyNetOf conflict, and unsupported periods.
 */
export function validateNgrDefinition(definition) {
  if (!definition) return { valid: false, code: 'ERR_EMPTY', message: 'Tanım boş olamaz.' };

  if (!definition.name || !String(definition.name).trim()) {
    return { valid: false, code: 'NAME_IS_REQUIRED', message: 'Tanım adı zorunludur.' };
  }

  if (!Array.isArray(definition.ggrComponents) || definition.ggrComponents.length === 0) {
    return { valid: false, code: 'ERR_GGR_COMPONENTS_REQUIRED', message: 'En az bir GGR bileşeni seçilmelidir.' };
  }

  const enabledItems = (definition.items || []).filter((item) => item?.enabled);
  const categories = new Set();
  const otherLabels = new Set();
  const sources = new Set();
  const alreadyNetOf = new Set(definition.ggrAlreadyNetOf || []);

  for (const item of enabledItems) {
    if (!NGR_CATEGORIES.includes(item.category)) {
      return { valid: false, code: 'ERR_NGR_UNKNOWN_CATEGORY', message: `Bilinmeyen kategori "${item.category}".` };
    }
    if (!NGR_SOURCES.includes(item.source)) {
      return { valid: false, code: 'ERR_NGR_UNKNOWN_SOURCE', message: `Bilinmeyen veri kaynağı "${item.source}".` };
    }
    if (item.source === 'stat_field' && !STAT_FIELD_CATEGORY[item.params?.field]) {
      return { valid: false, code: 'ERR_NGR_UNKNOWN_SOURCE', message: `Bilinmeyen istatistik alanı "${item.params?.field}".` };
    }
    if (item.source === 'fixed' && (item.params?.period ?? 'day') !== 'day') {
      return { valid: false, code: 'ERR_NGR_UNSUPPORTED_PERIOD', message: 'Sabit kesintiler yalnızca günlük ("day") periyodu destekler.' };
    }

    if (item.category === 'other') {
      const label = String(item.label || '').trim().toLowerCase();
      if (!label) {
        return { valid: false, code: 'ERR_LABEL_REQUIRED', message: '"Diğer" kategorisindeki her kalem için etiket zorunludur.' };
      }
      if (otherLabels.has(label)) {
        return {
          valid: false,
          code: 'ERR_NGR_DUPLICATE_LABEL',
          message: `"Diğer" kategorisinde "${item.label}" etiketi birden fazla kez kullanılamaz.`,
        };
      }
      otherLabels.add(label);
    } else {
      if (categories.has(item.category)) {
        return {
          valid: false,
          code: 'ERR_NGR_DUPLICATE_CATEGORY',
          message: `"${item.category}" kategorisi birden fazla kez düşülemez (çift kesinti koruması).`,
        };
      }
      categories.add(item.category);
    }

    let sourceKey = null;
    if (item.source === 'stat_field') sourceKey = `stat_field:${item.params?.field}`;
    else if (item.source === 'fee_plan' && item.params?.component) sourceKey = `fee_plan:${item.params.component}`;

    if (sourceKey) {
      if (sources.has(sourceKey)) {
        return {
          valid: false,
          code: 'ERR_NGR_DUPLICATE_SOURCE',
          message: `"${sourceKey}" veri kaynağı birden fazla kesinti kalemi tarafından kullanılamaz.`,
        };
      }
      sources.add(sourceKey);
    }

    const impliedCategory = item.source === 'stat_field' ? STAT_FIELD_CATEGORY[item.params?.field] : null;
    if (alreadyNetOf.has(item.category) || (impliedCategory && alreadyNetOf.has(impliedCategory))) {
      return {
        valid: false,
        code: 'ERR_NGR_ALREADY_NET_OF',
        message: `"${impliedCategory || item.category}" kategorisi zaten GGR'dan düşülmüştür, tekrar kesinti yapılamaz.`,
      };
    }
  }

  return { valid: true };
}

export default function NgrDefinitionEditor({ definitionId: propDefinitionId }) {
  let routeParams = {};
  try {
    routeParams = useParams() || {};
  } catch {
    // Outside router context
  }

  const [definitionId, setDefinitionId] = useState(propDefinitionId || routeParams.id || '');
  const [isNew, setIsNew] = useState(!definitionId || definitionId === 'new');
  const [cloneFromId, setCloneFromId] = useState(null);

  // Form states
  const [name, setName] = useState('');
  const [version, setVersion] = useState(1);
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [ggrComponents, setGgrComponents] = useState(['casino', 'sports']);
  const [ggrAlreadyNetOf, setGgrAlreadyNetOf] = useState([]);
  const [items, setItems] = useState([
    {
      category: 'bonus',
      label: 'Bonus Maliyeti',
      enabled: true,
      source: 'stat_field',
      params: { field: 'bonusCost' },
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    let id = propDefinitionId || routeParams.id;
    if (!id && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/');
      id = parts[parts.length - 1];
    }

    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const cloneId = searchParams.get('cloneFrom');
      if (cloneId) {
        setCloneFromId(cloneId);
        loadDefinition(cloneId, true);
        return;
      }
    }

    if (id && id !== 'new') {
      setDefinitionId(id);
      setIsNew(false);
      loadDefinition(id, false);
    } else {
      setIsNew(true);
    }
  }, [propDefinitionId, routeParams.id]);

  const loadDefinition = async (id, isCloning = false) => {
    setLoading(true);
    setApiError(null);
    try {
      const res = await billingApi.getNgrDefinition(id);
      const def = res?.definition || res;
      if (def) {
        setName(def.name || '');
        setDescription(def.description || '');
        setStatus(def.status || 'active');
        setGgrComponents(def.ggrComponents || ['casino', 'sports']);
        setGgrAlreadyNetOf(def.ggrAlreadyNetOf || []);
        setItems(def.items || []);
        if (isCloning) {
          setVersion((def.version || 1) + 1);
          setIsNew(true);
          setSuccessMsg(`"${def.name}" v${def.version} tanımından yeni sürüm taslağı oluşturuldu.`);
        } else {
          setVersion(def.version || 1);
        }
      }
    } catch (err) {
      const code = err.response?.data?.error?.code || err.response?.data?.code || 'FETCH_ERROR';
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Tanım yüklenemedi.';
      const explanation = NGR_ERROR_EXPLANATIONS[code] || msg;
      setApiError({ code, message: msg, explanation });
    } finally {
      setLoading(false);
    }
  };

  // Real-time live validation check
  const validationResult = validateNgrDefinition({
    name,
    ggrComponents,
    ggrAlreadyNetOf,
    items,
  });

  const handleToggleGgrComponent = (comp) => {
    if (ggrComponents.includes(comp)) {
      if (ggrComponents.length === 1) return; // Prevent empty
      setGgrComponents(ggrComponents.filter((c) => c !== comp));
    } else {
      setGgrComponents([...ggrComponents, comp]);
    }
  };

  const handleToggleAlreadyNetOf = (cat) => {
    if (ggrAlreadyNetOf.includes(cat)) {
      setGgrAlreadyNetOf(ggrAlreadyNetOf.filter((c) => c !== cat));
    } else {
      setGgrAlreadyNetOf([...ggrAlreadyNetOf, cat]);
    }
  };

  const handleAddItem = () => {
    const newItem = {
      category: 'other',
      label: 'Yeni Kesinti Kalemi',
      enabled: true,
      source: 'rate',
      params: { target: 'ggr', rate: 0.05 },
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (index) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleMoveItem = (index, direction) => {
    const newItems = [...items];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= newItems.length) return;
    const temp = newItems[index];
    newItems[index] = newItems[targetIdx];
    newItems[targetIdx] = temp;
    setItems(newItems);
  };

  const handleUpdateItem = (index, field, value) => {
    const newItems = [...items];
    const item = { ...newItems[index] };

    if (field === 'category') {
      item.category = value;
      // Adjust default label if standard category
      if (value === 'bonus') item.label = 'Bonus Maliyeti';
      else if (value === 'provider_fee') item.label = 'Sağlayıcı Ücreti';
      else if (value === 'tax') item.label = 'Şans Oyunları Vergisi';
      else if (value === 'chargeback') item.label = 'Ters İbrazlar';
    } else if (field === 'source') {
      item.source = value;
      if (value === 'stat_field') {
        item.params = { field: 'bonusCost' };
      } else if (value === 'fee_plan') {
        item.params = { component: 'sportsbookFee' };
      } else if (value === 'rate') {
        item.params = { target: 'ggr', rate: 0.05 };
      } else if (value === 'fixed') {
        item.params = { amount: 100, period: 'day' };
      }
    } else if (field === 'label') {
      item.label = value;
    } else if (field === 'enabled') {
      item.enabled = Boolean(value);
    } else if (field.startsWith('params.')) {
      const pKey = field.split('.')[1];
      item.params = { ...item.params, [pKey]: value };
    }

    newItems[index] = item;
    setItems(newItems);
  };

  const handleSave = async (asNewVersion = false) => {
    setApiError(null);
    setSuccessMsg(null);

    if (!validationResult.valid) {
      setApiError({
        code: validationResult.code,
        message: validationResult.message,
        explanation: NGR_ERROR_EXPLANATIONS[validationResult.code] || validationResult.message,
      });
      return;
    }

    setSaving(true);
    try {
      if (isNew || cloneFromId) {
        if (cloneFromId) {
          const res = await billingApi.createNewNgrVersion(cloneFromId, {
            description,
            ggrComponents,
            ggrAlreadyNetOf,
            items,
          });
          setSuccessMsg(`Yeni sürüm v${res.version} başarıyla oluşturuldu.`);
          setIsNew(false);
          setDefinitionId(res._id);
        } else {
          const res = await billingApi.createNgrDefinition({
            name,
            description,
            ggrComponents,
            ggrAlreadyNetOf,
            items,
          });
          setSuccessMsg(`"${res.name}" tanımı (v1) başarıyla oluşturuldu.`);
          setIsNew(false);
          setDefinitionId(res._id);
        }
      } else if (asNewVersion) {
        const res = await billingApi.createNewNgrVersion(definitionId, {
          description,
          ggrComponents,
          ggrAlreadyNetOf,
          items,
        });
        setSuccessMsg(`Yeni sürüm v${res.version} başarıyla oluşturuldu.`);
        setVersion(res.version);
        setDefinitionId(res._id);
      } else {
        const res = await billingApi.updateNgrDefinition(definitionId, {
          description,
          ggrComponents,
          ggrAlreadyNetOf,
          items,
          status,
        });
        const updated = res.definition || res;
        setSuccessMsg(`"${updated.name}" v${updated.version} güncellendi.`);
      }
    } catch (err) {
      const code = err.response?.data?.error?.code || err.response?.data?.code || 'SAVE_ERROR';
      const msg = err.response?.data?.error?.message || err.response?.data?.message || 'Kaydetme işlemi başarısız.';
      const explanation = NGR_ERROR_EXPLANATIONS[code] || msg;
      setApiError({ code, message: msg, explanation });
    } finally {
      setSaving(false);
    }
  };

  return h(
    'div',
    { className: 'space-y-6 max-w-5xl' },

    // Header
    h(
      'div',
      { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4' },
      h(
        'div',
        null,
        h(
          'div',
          { className: 'flex items-center gap-3' },
          h(
            'h1',
            { className: 'text-2xl font-bold text-white' },
            isNew ? 'Yeni NGR Tanımı Oluştur' : `NGR Tanımı Düzenle: ${name}`
          ),
          h(
            'span',
            { className: 'px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-slate-800 text-indigo-300 border border-slate-700' },
            `v${version}`
          )
        ),
        h(
          'p',
          { className: 'text-xs text-slate-400 mt-1' },
          'GGR bileşenleri, kesinti kalemleri ve çift kesinti koruması yapılandırması.'
        )
      ),
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h(
          'a',
          {
            href: '/console/billing/ngr-definitions',
            className: 'px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors',
          },
          '← Tanım Listesine Dön'
        )
      )
    ),

    // Success Notification
    successMsg &&
      h(
        'div',
        { className: 'p-4 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs' },
        successMsg
      ),

    // Server API Error Alert with Turkish Explanation
    apiError &&
      h(
        'div',
        { className: 'p-4 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-200 text-xs space-y-1' },
        h(
          'div',
          { className: 'flex items-center gap-2' },
          h('span', { className: 'px-2 py-0.5 rounded font-mono font-bold bg-rose-900 text-rose-100 text-2xs' }, apiError.code),
          h('span', { className: 'font-semibold' }, 'Hata Oluştu')
        ),
        h('div', { className: 'text-rose-300' }, apiError.explanation),
        apiError.message && apiError.message !== apiError.explanation &&
          h('div', { className: 'text-rose-400 text-2xs italic font-mono mt-0.5' }, apiError.message)
      ),

    // Real-Time Dynamic Validation Warning Alert
    !validationResult.valid &&
      h(
        'div',
        { className: 'p-3.5 rounded-lg bg-amber-950/50 border border-amber-800/80 text-amber-200 text-xs space-y-1' },
        h(
          'div',
          { className: 'flex items-center gap-2' },
          h('span', { className: 'px-2 py-0.5 rounded font-mono font-semibold bg-amber-900 text-amber-200 text-2xs' }, validationResult.code),
          h('span', { className: 'font-medium text-amber-300' }, 'Form Doğrulama Uyarısı (Çift Kesinti / Kural Koruması)')
        ),
        h('div', null, NGR_ERROR_EXPLANATIONS[validationResult.code] || validationResult.message)
      ),

    // Main Form
    h(
      'div',
      { className: 'grid grid-cols-1 lg:grid-cols-3 gap-6' },

      // Left Column: Definition Metadata & GGR settings
      h(
        'div',
        { className: 'space-y-6' },

        // Basic Info Card
        h(
          'div',
          { className: 'bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4' },
          h('h3', { className: 'text-sm font-semibold text-white border-b border-slate-800 pb-2' }, 'Genel Bilgiler'),

          h(
            'div',
            { className: 'space-y-1 text-xs' },
            h('label', { className: 'font-medium text-slate-300' }, 'Tanım Adı *'),
            h('input', {
              type: 'text',
              value: name,
              disabled: !isNew,
              onChange: (e) => setName(e.target.value),
              placeholder: 'Örn: Standart NGR Formülü',
              className: 'w-full px-3 py-2 bg-slate-800 text-white rounded border border-slate-700 disabled:opacity-60 focus:outline-none focus:border-indigo-500',
            }),
            !isNew && h('div', { className: 'text-slate-500 text-2xs' }, 'Mevcut sürümün adı değiştirilemez; yeni isim için yeni tanım oluşturun.')
          ),

          h(
            'div',
            { className: 'space-y-1 text-xs' },
            h('label', { className: 'font-medium text-slate-300' }, 'Açıklama'),
            h('textarea', {
              rows: 3,
              value: description,
              onChange: (e) => setDescription(e.target.value),
              placeholder: 'Formülün amacı, kapsamı ve ticari gerekçesi...',
              className: 'w-full px-3 py-2 bg-slate-800 text-white rounded border border-slate-700 focus:outline-none focus:border-indigo-500',
            })
          ),

          !isNew &&
            h(
              'div',
              { className: 'space-y-1 text-xs' },
              h('label', { className: 'font-medium text-slate-300' }, 'Durum'),
              h(
                'select',
                {
                  value: status,
                  onChange: (e) => setStatus(e.target.value),
                  className: 'w-full px-3 py-2 bg-slate-800 text-white rounded border border-slate-700 focus:outline-none focus:border-indigo-500',
                },
                h('option', { value: 'active' }, 'Aktif'),
                h('option', { value: 'draft' }, 'Taslak'),
                h('option', { value: 'archived' }, 'Arşiv')
              )
            )
        ),

        // GGR Components Card
        h(
          'div',
          { className: 'bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4' },
          h('h3', { className: 'text-sm font-semibold text-white border-b border-slate-800 pb-2' }, 'GGR Bileşenleri'),
          h('p', { className: 'text-xs text-slate-400' }, 'NGR tabanına dahil edilecek brüt oyun gelirleri:'),

          h(
            'div',
            { className: 'space-y-2 text-xs' },
            h(
              'label',
              { className: 'flex items-center gap-2 cursor-pointer text-slate-200' },
              h('input', {
                type: 'checkbox',
                checked: ggrComponents.includes('casino'),
                onChange: () => handleToggleGgrComponent('casino'),
                className: 'rounded border-slate-700 text-indigo-600 focus:ring-indigo-500',
              }),
              h('span', null, 'Casino GGR (casinoGgr)')
            ),
            h(
              'label',
              { className: 'flex items-center gap-2 cursor-pointer text-slate-200' },
              h('input', {
                type: 'checkbox',
                checked: ggrComponents.includes('sports'),
                onChange: () => handleToggleGgrComponent('sports'),
                className: 'rounded border-slate-700 text-indigo-600 focus:ring-indigo-500',
              }),
              h('span', null, 'Spor Bahisleri GGR (sportsGgrRealized)')
            )
          )
        ),

        // ggrAlreadyNetOf Guard Card
        h(
          'div',
          { className: 'bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3' },
          h('h3', { className: 'text-sm font-semibold text-white border-b border-slate-800 pb-2' }, 'GGR Zaten Net Olan Maliyetler'),
          h(
            'p',
            { className: 'text-xs text-slate-400' },
            'GGR hesaplanırken zaten düşülmüş olan kategorileri seçin. Bu kategoriler tekrar kesinti olarak eklenemez (ERR_NGR_ALREADY_NET_OF):'
          ),

          h(
            'div',
            { className: 'flex flex-wrap gap-2 pt-1' },
            NGR_CATEGORIES.map((cat) => {
              const isNet = ggrAlreadyNetOf.includes(cat);
              return h(
                'button',
                {
                  type: 'button',
                  key: cat,
                  onClick: () => handleToggleAlreadyNetOf(cat),
                  className: `px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    isNet
                      ? 'bg-amber-950 text-amber-300 border-amber-600'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`,
                },
                isNet ? `✓ ${cat}` : `+ ${cat}`
              );
            })
          )
        )
      ),

      // Right Column (2 spans): Deduction Items Builder
      h(
        'div',
        { className: 'lg:col-span-2 space-y-6' },

        h(
          'div',
          { className: 'bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4' },
          h(
            'div',
            { className: 'flex items-center justify-between border-b border-slate-800 pb-3' },
            h(
              'div',
              null,
              h('h3', { className: 'text-sm font-semibold text-white' }, 'Kesinti Kalemleri (Deductions)'),
              h('p', { className: 'text-xs text-slate-400 mt-0.5' }, 'GGR\'dan düşülecek maliyet kalemleri sırayla hesaplanır.')
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: handleAddItem,
                className: 'px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors',
              },
              '+ Kesinti Kalemi Ekle'
            )
          ),

          items.length === 0
            ? h(
                'div',
                { className: 'p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg' },
                'Henüz kesinti kalemi eklenmedi. NGR formülünüze maliyet eklemek için yukarıdaki butonu kullanın.'
              )
            : h(
                'div',
                { className: 'space-y-3' },
                items.map((item, idx) =>
                  h(
                    'div',
                    {
                      key: idx,
                      className: `p-4 rounded-lg border transition-all space-y-3 ${
                        item.enabled
                          ? 'bg-slate-800/80 border-slate-700'
                          : 'bg-slate-950/60 border-slate-800/80 opacity-60'
                      }`,
                    },

                    // Item header row
                    h(
                      'div',
                      { className: 'flex items-center justify-between gap-2 border-b border-slate-700/60 pb-2 text-xs' },
                      h(
                        'div',
                        { className: 'flex items-center gap-2' },
                        h('span', { className: 'font-mono text-slate-500 text-2xs' }, `#${idx + 1}`),
                        h(
                          'label',
                          { className: 'flex items-center gap-1.5 cursor-pointer font-medium text-slate-200' },
                          h('input', {
                            type: 'checkbox',
                            checked: item.enabled,
                            onChange: (e) => handleUpdateItem(idx, 'enabled', e.target.checked),
                            className: 'rounded border-slate-600 text-indigo-600 focus:ring-indigo-500',
                          }),
                          h('span', null, item.enabled ? 'Aktif' : 'Devre Dışı')
                        )
                      ),
                      h(
                        'div',
                        { className: 'flex items-center gap-1 text-2xs' },
                        h(
                          'button',
                          {
                            type: 'button',
                            disabled: idx === 0,
                            onClick: () => handleMoveItem(idx, -1),
                            className: 'px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded text-slate-300',
                            title: 'Yukarı Taşı',
                          },
                          '▲'
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            disabled: idx === items.length - 1,
                            onClick: () => handleMoveItem(idx, 1),
                            className: 'px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded text-slate-300',
                            title: 'Aşağı Taşı',
                          },
                          '▼'
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            onClick: () => handleRemoveItem(idx),
                            className: 'px-2 py-0.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 rounded text-rose-300 ml-1',
                          },
                          'Sil'
                        )
                      )
                    ),

                    // Inputs Grid
                    h(
                      'div',
                      { className: 'grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs' },

                      // Category
                      h(
                        'div',
                        { className: 'space-y-1' },
                        h('label', { className: 'text-slate-400 font-medium' }, 'Kategori *'),
                        h(
                          'select',
                          {
                            value: item.category,
                            onChange: (e) => handleUpdateItem(idx, 'category', e.target.value),
                            className: 'w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs',
                          },
                          NGR_CATEGORIES.map((c) => h('option', { key: c, value: c }, c))
                        )
                      ),

                      // Label
                      h(
                        'div',
                        { className: 'space-y-1' },
                        h('label', { className: 'text-slate-400 font-medium' }, 'Etiket (Label) *'),
                        h('input', {
                          type: 'text',
                          value: item.label,
                          onChange: (e) => handleUpdateItem(idx, 'label', e.target.value),
                          placeholder: 'Örn: Gaming Tax',
                          className: 'w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs',
                        })
                      ),

                      // Source
                      h(
                        'div',
                        { className: 'space-y-1' },
                        h('label', { className: 'text-slate-400 font-medium' }, 'Veri Kaynağı (Source) *'),
                        h(
                          'select',
                          {
                            value: item.source,
                            onChange: (e) => handleUpdateItem(idx, 'source', e.target.value),
                            className: 'w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs',
                          },
                          NGR_SOURCES.map((s) => h('option', { key: s, value: s }, s))
                        )
                      )
                    ),

                    // Source Parameters Row
                    h(
                      'div',
                      { className: 'bg-slate-900/60 p-3 rounded border border-slate-800 text-xs space-y-2' },
                      h('div', { className: 'text-2xs uppercase tracking-wider text-slate-500 font-semibold' }, 'Kaynak Parametreleri'),

                      item.source === 'stat_field' &&
                        h(
                          'div',
                          { className: 'grid grid-cols-1 sm:grid-cols-2 gap-2' },
                          h(
                            'div',
                            null,
                            h('label', { className: 'text-slate-400 block mb-1' }, 'İstatistik Alanı (Field):'),
                            h(
                              'select',
                              {
                                value: item.params?.field || 'bonusCost',
                                onChange: (e) => handleUpdateItem(idx, 'params.field', e.target.value),
                                className: 'w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs',
                              },
                              STAT_FIELD_OPTIONS.map((opt) =>
                                h('option', { key: opt.field, value: opt.field }, opt.label)
                              )
                            )
                          )
                        ),

                      item.source === 'fee_plan' &&
                        h(
                          'div',
                          { className: 'grid grid-cols-1 sm:grid-cols-2 gap-2' },
                          h(
                            'div',
                            null,
                            h('label', { className: 'text-slate-400 block mb-1' }, 'Ücret Planı Bileşeni:'),
                            h(
                              'select',
                              {
                                value: item.params?.component || 'sportsbookFee',
                                onChange: (e) => handleUpdateItem(idx, 'params.component', e.target.value),
                                className: 'w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs',
                              },
                              h('option', { value: 'sportsbookFee' }, 'Bahis Altyapı Ücreti (sportsbookFee)')
                            )
                          )
                        ),

                      item.source === 'rate' &&
                        h(
                          'div',
                          { className: 'grid grid-cols-1 sm:grid-cols-2 gap-3' },
                          h(
                            'div',
                            null,
                            h('label', { className: 'text-slate-400 block mb-1' }, 'Uygulanacak Taban (Target):'),
                            h(
                              'select',
                              {
                                value: item.params?.target || 'ggr',
                                onChange: (e) => handleUpdateItem(idx, 'params.target', e.target.value),
                                className: 'w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs',
                              },
                              h('option', { value: 'ggr' }, 'GGR Üzerinden'),
                              h('option', { value: 'turnover' }, 'Turnover (Ciro) Üzerinden')
                            )
                          ),
                          h(
                            'div',
                            null,
                            h('label', { className: 'text-slate-400 block mb-1' }, 'Oran (Örn: 0.05 = %5):'),
                            h('input', {
                              type: 'number',
                              step: '0.001',
                              min: '0',
                              max: '1',
                              value: item.params?.rate ?? 0.05,
                              onChange: (e) => handleUpdateItem(idx, 'params.rate', parseFloat(e.target.value)),
                              className: 'w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs',
                            })
                          )
                        ),

                      item.source === 'fixed' &&
                        h(
                          'div',
                          { className: 'grid grid-cols-1 sm:grid-cols-2 gap-3' },
                          h(
                            'div',
                            null,
                            h('label', { className: 'text-slate-400 block mb-1' }, 'Sabit Tutar:'),
                            h('input', {
                              type: 'number',
                              step: '0.01',
                              min: '0',
                              value: item.params?.amount ?? 0,
                              onChange: (e) => handleUpdateItem(idx, 'params.amount', parseFloat(e.target.value)),
                              className: 'w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs',
                            })
                          ),
                          h(
                            'div',
                            null,
                            h('label', { className: 'text-slate-400 block mb-1' }, 'Periyot (Yalnızca günlük "day" desteklenir):'),
                            h(
                              'select',
                              {
                                value: item.params?.period || 'day',
                                onChange: (e) => handleUpdateItem(idx, 'params.period', e.target.value),
                                className: 'w-full px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs',
                              },
                              h('option', { value: 'day' }, 'Günlük (day)')
                            )
                          )
                        )
                    )
                  )
                )
              )
        ),

        // Action Buttons Row
        h(
          'div',
          { className: 'flex flex-wrap items-center justify-end gap-3 pt-3' },
          h(
            'a',
            {
              href: '/console/billing/ngr-definitions',
              className: 'px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors',
            },
            'İptal'
          ),
          !isNew &&
            h(
              'button',
              {
                type: 'button',
                disabled: saving || !validationResult.valid,
                onClick: () => handleSave(true),
                className: 'px-4 py-2 text-xs font-medium text-indigo-300 bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 disabled:opacity-50 rounded-md transition-colors',
              },
              saving ? 'İşleniyor...' : 'Yeni Sürüm Olarak Kaydet (vN+1)'
            ),
          h(
            'button',
            {
              type: 'button',
              disabled: saving || !validationResult.valid,
              onClick: () => handleSave(false),
              className: 'px-5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md shadow-sm transition-colors',
            },
            saving ? 'Kaydediliyor...' : isNew ? 'Tanımı Oluştur' : 'Değişiklikleri Kaydet'
          )
        )
      )
    )
  );
}
