/**
 * Üç hazır tema paketi (A6).
 *
 * theme/registry.js'teki THEME_TOKEN_DEFINITIONS'ın (A1/A2) üç farklı,
 * her biri kendi içinde tutarlı varsayılan değer seti. "Kurulumda tema
 * seçilebiliyor, üçü de tutarlı görünüyor" kabul kriterinin somutlaştığı
 * yer: her paket TÜM token id'lerini kapsar (kısmi paket yok, hiçbir token
 * eski/uyumsuz bir değerde kalmaz) — bkz. themePresets.test.js.
 *
 * Uygulama, mevcut `setThemeToken()` (theme/index.js) üzerinden — yeni bir
 * DB alanı/şema açılmadı, paket seçimi zaten var olan `theme.<id>` Setting
 * anahtarlarını topluca günceller.
 */

const FONT = 'system-ui, -apple-system, sans-serif';

export const THEME_PRESETS = [
  {
    id: 'neon-cyan',
    label: 'Neon Cyan',
    description: 'Varsayılan — mevcut tasarımın gerçek renkleri (siyan/mor).',
    tokens: {
      primary: '#00d4ff',
      primaryDark: '#00aed4',
      accent: '#7c3aed',
      radiusMd: '0.75rem',
      fontDisplay: FONT,
    },
  },
  {
    id: 'emerald-gold',
    label: 'Emerald Gold',
    description: 'Zümrüt yeşili + altın vurgu, sıcak/premium his.',
    tokens: {
      primary: '#10b981',
      primaryDark: '#059669',
      accent: '#f59e0b',
      radiusMd: '0.75rem',
      fontDisplay: FONT,
    },
  },
  {
    id: 'crimson-purple',
    label: 'Crimson Purple',
    description: 'Kırmızı/eflatun, yüksek enerjili casino teması.',
    tokens: {
      primary: '#f43f5e',
      primaryDark: '#e11d48',
      accent: '#a855f7',
      radiusMd: '0.75rem',
      fontDisplay: FONT,
    },
  },
];

export const THEME_PRESET_IDS = THEME_PRESETS.map(p => p.id);
